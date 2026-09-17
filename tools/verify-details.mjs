import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const PORT = 4193
const TARGET = '/Users/qumo/Documents/Others/Sandbase/sandcode'
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: process.cwd() })
server.stderr.on('data', (c) => process.stderr.write(String(c)))
await new Promise((r) => setTimeout(r, 900))
const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
page.on('pageerror', (e) => console.log('PAGEERR', e.message))
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await page.click('#target-kind button[data-kind="local"]')
await page.fill('#target-input', TARGET)
await page.click('#target-form button[type="submit"]')
await page.waitForTimeout(4000)

const probe = () =>
  page.evaluate(() => {
    const doc = document.getElementById('preview').contentDocument
    const cs = (sel, prop) => {
      const node = doc.querySelector(sel)
      return node ? getComputedStyle(node)[prop] : '(missing)'
    }
    return {
      theme: document.getElementById('status').textContent,
      radiusBtn: cs('.hero-ctas .btn', 'borderTopLeftRadius'),
      radiusCard: cs('.card', 'borderTopLeftRadius'),
      bodyFont: cs('body', 'fontFamily').split(',')[0],
      h1Font: cs('h1', 'fontFamily').split(',')[0],
      rootPx: getComputedStyle(doc.documentElement).fontSize,
      lineHeight: cs('.sub', 'lineHeight'),
      tracking: cs('h1', 'letterSpacing'),
      shadow: cs('.card', 'boxShadow').slice(0, 34),
      borderColor: cs('.card', 'borderTopColor'),
    }
  })

async function setSel(id, value) {
  await page.selectOption(`#${id}`, String(value))
}
async function reset() {
  for (const [id, v] of Object.entries({
    bodyFont: 'original', headingFont: 'original', typeScale: 1, lineHeight: 'null',
    headingTracking: 'null', elevation: 'original', borders: 'original', motion: 'original',
  })) await setSel(id, v)
  await page.fill('#radius', '0')
  await page.dispatchEvent('#radius', 'input')
  await page.waitForTimeout(600)
}

const DIRECTIONS = [
  { name: 'editorial', theme: 'sandbase', mode: 'light', radius: 3,
    details: { bodyFont: 'serif', headingFont: 'serif', elevation: 'subtle', headingTracking: -0.015, lineHeight: 1.65 } },
  { name: 'terminal', theme: 'matrix', mode: 'dark', radius: 2,
    details: { bodyFont: 'mono', headingFont: 'mono', elevation: 'none', borders: 'soften' } },
  { name: 'friendly', theme: 'catppuccin', mode: 'light', radius: 18,
    details: { bodyFont: 'geometric', headingFont: 'geometric', elevation: 'soft', typeScale: 1.1 } },
  { name: 'brutalist', theme: 'nord', mode: 'light', radius: 2,
    details: { elevation: 'none', headingTracking: 0.02, borders: 'soften', motion: 'off' } },
]

for (const d of DIRECTIONS) {
  await page.click(`#mode button[data-mode="${d.mode}"]`)
  await page.waitForTimeout(400)
  await page.click(`.theme[data-id="${d.theme}"]`)
  await page.waitForTimeout(1500)
  await reset()
  await page.fill('#radius', String(d.radius))
  await page.dispatchEvent('#radius', 'input')
  for (const [id, v] of Object.entries(d.details)) await setSel(id, v)
  await page.waitForTimeout(1500)
  const r = await probe()
  console.log(`\n${d.name}  (${d.theme}/${d.mode}, radius ${d.radius})`)
  console.log(`  button radius : ${r.radiusBtn}    card radius: ${r.radiusCard}`)
  console.log(`  body font     : ${r.bodyFont}    heading: ${r.h1Font}`)
  console.log(`  root font-size: ${r.rootPx}    line-height: ${r.lineHeight}    tracking: ${r.tracking}`)
  console.log(`  card shadow   : ${r.shadow}`)
  console.log(`  card border   : ${r.borderColor}`)
}

await reset()
await page.click(`.theme[data-id="sandbase"]`)
await page.waitForTimeout(1500)
console.log('\nreset →', JSON.stringify(await probe()))
await browser.close()
server.kill()
