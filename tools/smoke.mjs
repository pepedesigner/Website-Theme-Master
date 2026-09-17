#!/usr/bin/env node
/**
 * End-to-end check for Website Theme Master.
 *
 * Boots the studio, loads the bundled fixture, and asserts the product's actual
 * claims: a different theme produces different computed colours, switching mode
 * re-derives them, and the detail controls move the properties they say they do.
 *
 * Usage: node tools/smoke.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4199
const base = `http://127.0.0.1:${PORT}`

const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT)], { cwd: ROOT })
server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))
await new Promise((resolve) => setTimeout(resolve, 900))

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()

const problems = []
const failed = new Set()
page.on('response', (response) => {
  if (response.status() >= 400) failed.add(`${response.status()} ${response.url().slice(0, 150)}`)
})
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

const results = []
const check = (label, ok, detail = '') => results.push({ label, ok, detail })

/** Read what the previewed page actually paints. */
const probe = () =>
  page.evaluate(() => {
    const doc = document.getElementById('preview').contentDocument
    const style = doc.getElementById('wdt-overrides')
    const heading = doc.querySelector('h1, h2')
    const button = doc.querySelector('.btn, button')
    const body = getComputedStyle(doc.body)
    return {
      rules: style ? style.textContent.split('\n').filter(Boolean).length : 0,
      bytes: style ? style.textContent.length : 0,
      canvas: body.backgroundColor,
      ink: body.color,
      font: body.fontFamily,
      rootSize: getComputedStyle(doc.documentElement).fontSize,
      headingFamily: heading ? getComputedStyle(heading).fontFamily : '',
      headingTracking: heading ? getComputedStyle(heading).letterSpacing : '',
      buttonRadius: button ? getComputedStyle(button).borderTopLeftRadius : '',
      status: document.getElementById('status').textContent,
      mapping: document.getElementById('mapping-pill').textContent,
    }
  })

async function waitFor(predicate, timeout = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await probe()
    if (predicate(value)) return value
    await page.waitForTimeout(150)
  }
  return null
}

async function pickTheme(id) {
  await page.click(`.theme[data-id="${id}"]`)
  return waitFor((value) => value.status.includes(id))
}

async function setMode(mode) {
  await page.click(`#mode button[data-mode="${mode}"]`)
  return waitFor((value) => value.status.includes(mode))
}

async function setSelect(id, value) {
  await page.selectOption(`#${id}`, value)
}

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

const booted = await waitFor((value) => value.rules > 0)
check('engine produces an override stylesheet', Boolean(booted), booted ? `${booted.rules} rules` : 'none')
if (!booted) {
  report()
  await browser.close()
  server.kill()
  process.exit(1)
}

const sandbase = await probe()

// 1. a different theme has to repaint the page
const dracula = await pickTheme('dracula')
check(
  'switching theme repaints the canvas',
  Boolean(dracula) && dracula.canvas !== sandbase.canvas,
  `${sandbase.canvas} → ${dracula?.canvas}`,
)
check(
  'switching theme repaints the ink',
  Boolean(dracula) && dracula.ink !== sandbase.ink,
  `${sandbase.ink} → ${dracula?.ink}`,
)
check('mapping reports a non-trivial colour count', Number((dracula?.mapping ?? '').match(/^(\d+)/)?.[1] ?? 0) > 3, dracula?.mapping)

// 2. mode is its own axis
const draculaDark = await setMode('dark')
check(
  'dark mode re-derives the palette',
  Boolean(draculaDark) && draculaDark.canvas !== dracula.canvas,
  `${dracula.canvas} → ${draculaDark?.canvas}`,
)
await setMode('light')

// 3. intensity is a dial, not a switch
await page.fill('#strength', '40')
const dialled = await waitFor((value) => value.rules > 0)
check('intensity changes the result', Boolean(dialled) && dialled.canvas !== dracula.canvas, `${dracula.canvas} → ${dialled?.canvas}`)
await page.fill('#strength', '100')
await waitFor((value) => value.canvas === dracula.canvas)

// 4. detail controls
await setSelect('bodyFont', 'serif')
const serif = await waitFor((value) => /serif|Georgia/i.test(value.font))
check('body font control applies', Boolean(serif), serif?.font.slice(0, 40))

await setSelect('headingTracking', '-0.03')
const tracked = await waitFor((value) => value.headingTracking.startsWith('-'))
check('heading tracking applies', Boolean(tracked), tracked?.headingTracking)

await setSelect('typeScale', '1.2')
const scaled = await waitFor((value) => value.rootSize.startsWith('19'))
check('type scale applies', Boolean(scaled), scaled?.rootSize)

await page.fill('#radius', '18')
await page.dispatchEvent('#radius', 'input')
const rounded = await waitFor((value) => value.buttonRadius.startsWith('18'))
check('corner radius applies', Boolean(rounded), rounded?.buttonRadius)

await setSelect('motion', 'off')
const frozen = await waitFor((value) => value.rules > 0)
check('motion control applies', Boolean(frozen) && frozen.bytes > booted.bytes, `${booted.bytes} → ${frozen?.bytes} bytes`)

report()
await browser.close()
server.kill()
process.exit(results.every((entry) => entry.ok) && problems.length === 0 ? 0 : 1)

function report() {
  console.log('\nresults')
  for (const entry of results) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.label}${entry.detail ? `  (${entry.detail})` : ''}`)
  }
  const failedList = [...failed].filter((line) => !/favicon/.test(line))
  if (failedList.length) {
    console.log('\nfailed requests')
    for (const line of failedList) console.log(' ', line)
  }
  if (problems.length) {
    console.log('\npage errors')
    for (const line of [...new Set(problems)]) console.log(' ', line)
  }
  const passed = results.filter((entry) => entry.ok).length
  console.log(`\n${passed}/${results.length} checks passed`)
}
