#!/usr/bin/env node
/**
 * Legibility audit across the whole theme library.
 *
 * The identity check (`diff-sandbase.mjs`) proves the engine does not distort a
 * site that is already wearing its own palette. This one proves the opposite
 * direction: that every *other* theme leaves the page readable — no invisible
 * button labels, no body copy vanishing into the canvas, and the dark code
 * panel still dark.
 *
 * Usage: node tools/audit-themes.mjs [siteDir]
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4188
const DIR = process.argv[2] ?? join(ROOT, 'fixtures-sandcode')

/** label, foreground selector, background selector, minimum ratio */
const PAIRS = [
  ['body copy', 'body', 'body', 4.5],
  ['lede', '.sub', 'body', 4.5],
  ['card copy', '.card p', '.card', 4.5],
  ['card title', '.card b', '.card', 4.5],
  ['faq answer', '.faq p', '.faq details', 4.5],
  ['nav link', '.nav-links a', 'body', 4.5],
  ['primary button', '.hero-ctas .btn', '.hero-ctas .btn', 4.5],
  ['ghost button', '.hero-ctas .btn.light', '.hero-ctas .btn.light', 4.5],
  ['terminal text', '.term-body', '.terminal', 4.5],
  ['terminal dim', '.term-bar .tname', '.terminal', 3],
  ['code accent', '.uc-term .green', '.uc-term', 3],
  ['code prompt', '.uc-prompt', '.uc-term', 3],
  ['highlight <em>', 'h1 em', 'h1 em', 4.5],
  ['dark band', '.zen-banner p', '.zen-banner', 4.5],
]

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT)], { cwd: ROOT })
server.stderr.on('data', (c) => process.stderr.write(String(c)))
await new Promise((r) => setTimeout(r, 900))

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERR', e.message))

const themes = await (await fetch(`http://127.0.0.1:${PORT}/themes/index.json`)).json()

const READ = ([pairs]) => {
  const parse = (value) => {
    const m = String(value).match(/[\d.]+/g)
    if (!m) return null
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }
  }
  const lum = (c) => {
    const ch = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  }
  const canvas = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }

  return pairs.map(([label, fgSel, bgSel, min]) => {
    const fgEl = document.querySelector(fgSel)
    const bgEl = document.querySelector(bgSel)
    if (!fgEl || !bgEl) return { label, min, missing: true }
    let fg = parse(getComputedStyle(fgEl).color)
    let bg = parse(getComputedStyle(bgEl).backgroundColor)
    if (!fg || !bg) return { label, min, missing: true }
    if (bg.a < 1) bg = { r: bg.r * bg.a + canvas.r * (1 - bg.a), g: bg.g * bg.a + canvas.g * (1 - bg.a), b: bg.b * bg.a + canvas.b * (1 - bg.a) }
    if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
    const a = lum(fg)
    const b = lum(bg)
    return {
      label,
      min,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      panelLum: label.startsWith('terminal') || label.startsWith('code') ? b : null,
    }
  })
}

const url = `http://127.0.0.1:${PORT}/preview?dir=${encodeURIComponent(DIR)}&file=index.html`
const failures = []
let checks = 0

for (const theme of themes) {
  for (const mode of ['light', 'dark']) {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(
      async ([id, m]) => {
        const data = await (await fetch(`/themes/${id}.json`)).json()
        localStorage.setItem('sandcode-theme', m)
        localStorage.setItem('wdt:config', JSON.stringify({ themeId: id, roles: data.roles, mode: m, strength: 1, details: {} }))
      },
      [theme.id, mode],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const results = await page.evaluate(READ, [PAIRS])
    for (const result of results) {
      checks += 1
      if (result.missing) {
        failures.push(`${theme.id}/${mode} ${result.label}: selector not found`)
        continue
      }
      if (result.ratio < result.min) {
        failures.push(`${theme.id}/${mode} ${result.label}: ${result.ratio.toFixed(2)}:1 (needs ${result.min})`)
      }
      // the code panel is dark by design in both modes; if it goes light the
      // whole terminal reads as a broken card
      if (result.panelLum !== null && result.panelLum > 0.45) {
        failures.push(`${theme.id}/${mode} ${result.label}: code surface is light (luminance ${result.panelLum.toFixed(2)})`)
      }
    }
  }
}

await browser.close()
server.kill()

console.log(`${themes.length} themes × 2 modes — ${checks} checks on ${DIR.split('/').pop()}`)
if (!failures.length) {
  console.log('every pair clears its threshold; code surfaces stay dark')
} else {
  console.log(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.log(`  ${failure}`)
}
process.exit(failures.length ? 1 : 0)
