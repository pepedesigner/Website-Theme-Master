#!/usr/bin/env node
/**
 * Preview renderer.
 *
 * Drives the real studio and captures what it produces: the tool itself, the
 * bundled fixture across a spread of themes in both modes, and a live URL to
 * prove the proxy path works on sites we have never seen.
 *
 * Usage: node tools/shoot.mjs [--quick]
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'out')
const PORT = 4198
const base = `http://127.0.0.1:${PORT}`
const quick = process.argv.includes('--quick')

const SPREAD = [
  'sandbase', 'nord', 'dracula', 'tokyonight', 'monokai', 'one-dark',
  'catppuccin', 'gruvbox', 'rosepine', 'solarized', 'synthwave84', 'matrix',
]

/**
 * Detail-control directions: same theme, same site, very different feel. These
 * exist to prove the non-colour controls carry their weight.
 */
const DIRECTIONS = [
  {
    name: 'editorial',
    theme: 'sandbase',
    mode: 'light',
    radius: 3,
    details: { bodyFont: 'serif', headingFont: 'serif', elevation: 'subtle', headingTracking: -0.015, lineHeight: 1.65 },
  },
  {
    name: 'terminal',
    theme: 'matrix',
    mode: 'dark',
    radius: 2,
    details: { bodyFont: 'mono', headingFont: 'mono', elevation: 'none', borders: 'soften' },
  },
  {
    name: 'friendly',
    theme: 'catppuccin',
    mode: 'light',
    radius: 18,
    details: { bodyFont: 'geometric', headingFont: 'geometric', elevation: 'soft', typeScale: 1.1 },
  },
  {
    name: 'brutalist',
    theme: 'nord',
    mode: 'light',
    radius: 2,
    details: { elevation: 'none', headingTracking: 0.02, borders: 'soften', motion: 'off' },
  },
]

const LIVE = [
  { url: 'https://example.com', theme: 'dracula', mode: 'dark' },
  { url: 'https://en.wikipedia.org/wiki/CSS', theme: 'tokyonight', mode: 'dark' },
  { url: 'https://en.wikipedia.org/wiki/CSS', theme: 'nord', mode: 'light' },
]

const targetFlag = process.argv.indexOf('--target')
const targetDir = targetFlag > -1 ? process.argv[targetFlag + 1] : null

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT)], { cwd: ROOT })
server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))
await new Promise((resolve) => setTimeout(resolve, 900))

await mkdir(join(OUT, 'shots'), { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 })
const page = await context.newPage()

const problems = []
page.on('pageerror', (error) => problems.push(error.message))

const failures = []

async function probe() {
  return page.evaluate(() => {
    const doc = document.getElementById('preview').contentDocument
    const style = doc?.getElementById('wdt-overrides')
    // mid-navigation the frame is still about:blank, which has no body
    if (!doc || !doc.body) {
      return { rules: 0, bytes: 0, status: '', mapping: 'working', canvas: '' }
    }
    return {
      rules: style ? style.textContent.split('\n').filter(Boolean).length : 0,
      bytes: style ? style.textContent.length : 0,
      status: document.getElementById('status').textContent,
      mapping: document.getElementById('mapping-pill').textContent,
      canvas: getComputedStyle(doc.body).backgroundColor,
    }
  })
}

async function waitForApplied(timeout = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const value = await probe()
      if (value.rules > 0 && value.status.startsWith('Reskinned')) return value
    } catch {
      /* frame mid-navigation */
    }
    await page.waitForTimeout(200)
  }
  return null
}

async function setTarget(kind, value) {
  await page.click(`#target-kind button[data-kind="${kind}"]`)
  await page.fill('#target-input', value)
  await page.click('#target-form button[type="submit"]')
  return waitForApplied()
}

async function setTheme(id) {
  await page.click(`.theme[data-id="${id}"]`)
  const started = Date.now()
  while (Date.now() - started < 20000) {
    const value = await probe()
    // the pill goes to "working…" while a pass is in flight, so settling on it
    // means the screenshot is of a finished reskin, not a half-applied one
    if (value.status.includes(id) && !value.mapping.startsWith('working')) return value
    await page.waitForTimeout(150)
  }
  return null
}

async function setMode(mode) {
  await page.click(`#mode button[data-mode="${mode}"]`)
  await page.waitForTimeout(400)
}

/** Wait until no reskin pass is in flight, so shots never catch a half-applied one. */
async function settled(timeout = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await probe()
    if (!value.mapping.startsWith('working')) return value
    await page.waitForTimeout(150)
  }
  return null
}

async function setDetail(id, value) {
  await page.selectOption(`#${id}`, String(value))
}

async function setRadius(value) {
  await page.fill('#radius', String(value))
  await page.dispatchEvent('#radius', 'input')
}

async function resetDetails() {
  for (const [id, value] of Object.entries({
    bodyFont: 'original',
    headingFont: 'original',
    typeScale: 1,
    lineHeight: null,
    headingTracking: null,
    elevation: 'original',
    borders: 'original',
    motion: 'original',
  })) {
    await setDetail(id, value === null ? 'null' : value)
  }
  await setRadius(0)
  await page.waitForTimeout(300)
}

async function shootFrame(file) {
  await page.locator('#preview').screenshot({ path: join(OUT, 'shots', file) })
}

/* ------------------------------------------------------------ the tool */

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
const booted = await waitForApplied()
if (!booted) failures.push('studio never produced an override stylesheet')
await page.waitForTimeout(1200)
await page.screenshot({ path: join(OUT, 'studio.png') })
console.log('studio.png')

/* ------------------------------------------------- point at a real site */

if (targetDir) {
  const value = await setTarget('local', targetDir)
  if (!value) {
    failures.push(`${targetDir}: never applied`)
  } else {
    console.log(`\ntarget → ${targetDir}`)
    console.log(`  ${value.mapping}`)
  }
}

/* ------------------------------------------------------- theme spread */

if (!quick) {
  for (const theme of SPREAD) {
    for (const mode of ['light', 'dark']) {
      await setMode(mode)
      const value = await setTheme(theme)
      if (!value) {
        failures.push(`${theme}/${mode}: theme never applied`)
        continue
      }
      await page.waitForTimeout(350)
      await shootFrame(`${theme}-${mode}.png`)
      console.log(`${theme}-${mode}.png  ${value.mapping}`)
    }
  }
}

/* --------------------------------------------------- detail directions */

if (!quick) {
  console.log('')
  for (const direction of DIRECTIONS) {
    await setMode(direction.mode)
    const themed = await setTheme(direction.theme)
    if (!themed) {
      failures.push(`direction ${direction.name}: theme never applied`)
      continue
    }
    await resetDetails()
    await setRadius(direction.radius)
    for (const [id, value] of Object.entries(direction.details)) {
      await setDetail(id, value === null ? 'null' : value)
    }
    const applied = await settled(15000)
    if (!applied) failures.push(`direction ${direction.name}: never settled`)
    await page.waitForTimeout(500)
    await shootFrame(`detail-${direction.name}.png`)
    console.log(`detail-${direction.name}.png  ${direction.theme}/${direction.mode}  ${applied?.mapping ?? ''}`)
  }
  await resetDetails()
}

/* -------------------------------------------------------------- live url */

for (const target of LIVE) {
  const value = await setTarget('url', target.url)
  if (!value) {
    failures.push(`${target.url}: never applied`)
    continue
  }
  await setMode(target.mode)
  const themed = await setTheme(target.theme)
  if (!themed) {
    failures.push(`${target.url}: theme ${target.theme} never applied`)
    continue
  }
  await page.waitForTimeout(700)
  const slug = target.url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')
  await shootFrame(`live-${slug}-${target.theme}-${target.mode}.png`)
  console.log(`live-${slug}-${target.theme}-${target.mode}.png  ${themed.mapping}`)
}

await writeFile(
  join(OUT, 'report.txt'),
  [
    `boot: ${booted ? booted.mapping : 'failed'}`,
    ...problems.map((problem) => `page error: ${problem}`),
    ...failures.map((failure) => `failure: ${failure}`),
  ].join('\n') + '\n',
)

await browser.close()
server.kill()

console.log('')
if (failures.length || problems.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  for (const problem of problems) console.error(`ERR  ${problem}`)
  process.exit(1)
}
console.log(`done → out/`)
