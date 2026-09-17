#!/usr/bin/env node
/**
 * Website Theme Master — studio server.
 *
 * Two ways to point the tool at a site:
 *   local folder →  /preview?dir=<abs path>&file=<relative path>
 *   live URL     →  /preview?url=<absolute url>
 *
 * Both funnel through the same rewrite step: asset URLs are resolved to our own
 * origin (so `document.styleSheets` is readable — a cross-origin sheet throws on
 * `cssRules`, and unreadable CSS means no selectors to override), and the
 * injected engine is appended to the document.
 *
 * Usage: node server.mjs [port]
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.argv[2]) || 4180

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.map': 'application/json; charset=utf-8',
}

const INJECT_TAG = '<script type="module" src="/studio/inject.js"></script>'

function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function encode(value) {
  return encodeURIComponent(value)
}

/** Wrap any URL so the browser asks us for it instead of the original origin. */
function wrap(target, mode) {
  if (!target) return target
  if (/^(data:|blob:|mailto:|tel:|javascript:|about:|#)/i.test(target)) return target
  if (mode.type === 'url') {
    const absolute = new URL(target, mode.base).href
    return `/preview?url=${encode(absolute)}`
  }
  // mode.base is an absolute directory; `file://` + `/Users/...` is already the
  // three-slash form, so a template literal must not add a fourth
  const absolute = new URL(target, `file://${mode.base}/`)
  let file = decodeURIComponent(absolute.pathname)
  if (file.endsWith('/')) file += 'index.html'
  return `/preview?dir=${encode(mode.dir)}&file=${encode(file)}`
}

/** Entities in an attribute have to be decoded before the URL means anything. */
function decodeEntities(value) {
  return value
    .replace(/&(?:amp|#38|#x26);/gi, '&')
    .replace(/&(?:quot|#34|#x22);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:lt|#60|#x3c);/gi, '<')
    .replace(/&(?:gt|#62|#x3e);/gi, '>')
}

function rewriteSrcset(value, mode) {
  return value
    .split(',')
    .map((part) => {
      const [url, ...descriptor] = part.trim().split(/\s+/)
      return [escapeAttribute(wrap(decodeEntities(url), mode)), ...descriptor].join(' ')
    })
    .join(', ')
}

/** A bare `&` is legal HTML, but `&file=` reads as an entity — escape it back. */
function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;')
}

/** Rewrite asset references so every sub-resource round-trips through us. */
function rewriteUrls(html, mode) {
  let output = html

  output = output.replace(
    /(\s(?:href|src|action|poster|data-src)\s*=\s*)(["'])(.*?)\2/gi,
    (match, lead, quote, value) =>
      `${lead}${quote}${escapeAttribute(wrap(decodeEntities(value), mode))}${quote}`,
  )

  output = output.replace(
    /(\ssrcset\s*=\s*)(["'])(.*?)\2/gi,
    (match, lead, quote, value) => `${lead}${quote}${rewriteSrcset(decodeEntities(value), mode)}${quote}`,
  )

  // a <base> would re-point every relative URL at the original origin, undoing
  // the rewrite above
  output = output.replace(/<base\b[^>]*>/gi, '')
  // CSP would block the injected module; integrity hashes cannot survive proxying
  output = output.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
  output = output.replace(/\sintegrity=(["']).*?\1/gi, '')
  output = output.replace(/\scrossorigin(=(["']).*?\2)?/gi, '')

  return output
}

function injectEngine(html) {
  if (html.includes('/studio/inject.js')) return html
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${INJECT_TAG}\n</body>`)
  return `${html}\n${INJECT_TAG}`
}

/**
 * Rewrite a stylesheet's own references.
 *
 * `@import` and `url()` are relative to the sheet, but once the sheet is served
 * from `/preview?...` the browser resolves them against `/preview` instead —
 * so they have to be absolutised before the sheet is handed over. This bites
 * both modes: proxied CSS and plain local CSS alike.
 */
function rewriteCss(css, mode) {
  let output = css.replace(
    /(@import\s+(?:url\(\s*)?)(["']?)([^"')]+)\2(\s*\)?)/gi,
    (match, lead, quote, value) => `${lead}${quote}${wrap(value, mode)}${quote}`,
  )
  output = output.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote, value) => {
    if (/^(data:|blob:|#)/i.test(value)) return match
    return `url("${wrap(value, mode)}")`
  })
  return output
}

async function sendFile(response, path) {
  try {
    const info = await stat(path)
    if (info.isDirectory()) return sendFile(response, join(path, 'index.html'))
    const body = await readFile(path)
    response.writeHead(200, { 'content-type': mimeFor(path), 'cache-control': 'no-store' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
  }
}

async function serveLocal(response, dir, file) {
  const base = resolve(dir)
  // the rewritten URLs carry absolute paths; a bare relative file is resolved
  // against the served folder instead
  const raw = decodeURIComponent(file || '/index.html')
  const target = resolve(raw.startsWith('/') ? raw : `${base}/${raw}`)
  // never serve outside the folder the user pointed at
  if (target !== base && !target.startsWith(base + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('outside the served folder')
    return
  }

  let info
  try {
    info = await stat(target)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    return
  }

  if (info.isDirectory()) {
    return serveLocal(response, dir, join(relative(base, target), 'index.html'))
  }

  const body = await readFile(target)
  const type = mimeFor(target)

  if (type.startsWith('text/css')) {
    const mode = { type: 'local', dir: base, base: dirname(target) }
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    response.end(rewriteCss(body.toString('utf8'), mode))
    return
  }

  if (!type.startsWith('text/html')) {
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    response.end(body)
    return
  }

  const mode = { type: 'local', dir: base, base: dirname(target) }
  const html = injectEngine(rewriteUrls(body.toString('utf8'), mode))
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(html)
}

async function serveRemote(response, rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('bad url')
    return
  }
  if (!/^https?:$/.test(url.protocol)) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('only http(s)')
    return
  }

  let upstream
  try {
    upstream = await fetch(url.href, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        accept: '*/*',
      },
    })
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain' })
    response.end(`upstream fetch failed: ${error.message}`)
    return
  }

  const type = upstream.headers.get('content-type') ?? mimeFor(url.pathname)
  const body = Buffer.from(await upstream.arrayBuffer())

  if (type.includes('text/css')) {
    const mode = { type: 'url', base: url.href }
    const css = rewriteCss(body.toString('utf8'), mode)
    response.writeHead(upstream.status, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' })
    response.end(css)
    return
  }

  if (!type.includes('text/html')) {
    response.writeHead(upstream.status, { 'content-type': type, 'cache-control': 'no-store' })
    response.end(body)
    return
  }

  const mode = { type: 'url', base: url.href }
  const html = injectEngine(rewriteUrls(body.toString('utf8'), mode))
  response.writeHead(upstream.status, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(html)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`)
  const path = decodeURIComponent(url.pathname)

  try {
    if (path === '/preview') {
      if (url.searchParams.has('url')) return await serveRemote(response, url.searchParams.get('url'))
      const dir = url.searchParams.get('dir')
      if (!dir) {
        response.writeHead(400, { 'content-type': 'text/plain' }).end('missing dir or url')
        return
      }
      return await serveLocal(response, dir, url.searchParams.get('file') ?? '/index.html')
    }

    if (path === '/api/config') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(
        JSON.stringify({
          fixture: join(ROOT, 'fixtures-sandcode'),
          root: ROOT,
          themes: join(ROOT, 'themes'),
        }),
      )
      return
    }

    if (path === '/') return await sendFile(response, join(ROOT, 'studio', 'index.html'))
    if (path.startsWith('/studio/') || path.startsWith('/engine/') || path.startsWith('/themes/')) {
      const target = join(ROOT, normalize(path).replace(/^[/\\]+/, ''))
      if (!target.startsWith(ROOT)) {
        response.writeHead(403).end('forbidden')
        return
      }
      return await sendFile(response, target)
    }

    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error?.stack ?? error))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Website Theme Master → http://127.0.0.1:${PORT}/`)
  console.log('Ctrl-C to stop')
})
