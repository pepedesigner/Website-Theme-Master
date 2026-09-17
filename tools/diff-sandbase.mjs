import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

/**
 * Accuracy check: render a site untouched, then render it under its own theme,
 * and report every computed colour that moved.
 *
 * SandCode is the ideal subject because a SandBase theme *is* its palette, so
 * the two renders should be identical. Anything that moves is a bug.
 */
const PORT = 4191
const DIR = process.argv[2] ?? '/Users/qumo/Documents/Others/Sandbase/sandcode'
const THEME = process.argv[3] ?? 'sandbase'
const MODE = process.argv[4] ?? 'light'

const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: process.cwd() })
server.stderr.on('data', (c) => process.stderr.write(String(c)))
await new Promise((r) => setTimeout(r, 900))

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERR', e.message))

const PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'boxShadow',
  'outlineColor',
]

// A path of nth-of-type steps is stable across the two renders. A flat element
// index is not: the engine appends its <style> to <head>, which shifts every
// index after it and silently compares each element against its neighbour.
const capture = () =>
  page.evaluate(
    ([props]) => {
      const path = (el) => {
        const steps = []
        let node = el
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          const parent = node.parentElement
          if (!parent) break
          const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName)
          steps.unshift(`${node.tagName.toLowerCase()}:${sameTag.indexOf(node)}`)
          node = parent
        }
        return steps.join('>')
      }

      const out = []
      const all = document.querySelectorAll('*')
      for (let i = 0; i < all.length; i += 1) {
        const el = all[i]
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue
        const cs = getComputedStyle(el)
        const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
          el.className && typeof el.className === 'string' && el.className.trim()
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        }`
        for (const prop of props) {
          const value = cs[prop]
          if (!value || value === 'rgba(0, 0, 0, 0)' || value === 'none') continue
          out.push([path(el), label, prop, value])
        }
      }
      return out
    },
    [PROPS],
  )

const url = `http://127.0.0.1:${PORT}/preview?dir=${encodeURIComponent(DIR)}&file=index.html`

// Both captures have to put the *page* in the same mode, or a dark theme gets
// compared against a light original and every difference is expected rather
// than a bug. `sandcode-theme` is what this particular site reads on boot.
const prime = async () => {
  await page.evaluate(
    ([mode]) => {
      localStorage.setItem('sandcode-theme', mode)
      localStorage.removeItem('wdt:config')
    },
    [MODE],
  )
}

await page.goto(url, { waitUntil: 'networkidle' })
await prime()
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => document.getElementById('wdt-overrides')?.remove())
await page.waitForTimeout(600)
const original = await capture()

await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(
  async ([theme, mode]) => {
    const data = await (await fetch(`/themes/${theme}.json`)).json()
    localStorage.setItem('sandcode-theme', mode)
    localStorage.setItem(
      'wdt:config',
      JSON.stringify({ themeId: theme, roles: data.roles, mode, strength: 1, details: {} }),
    )
  },
  [THEME, MODE],
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const themed = await capture()

const key = (row) => `${row[0]}|${row[2]}`
const after = new Map(themed.map((row) => [key(row), row[3]]))
const diffs = []
for (const row of original) {
  const next = after.get(key(row))
  if (next !== undefined && next !== row[3]) {
    diffs.push({ label: row[1], prop: row[2], before: row[3], after: next })
  }
}

const byProperty = {}
for (const d of diffs) byProperty[d.prop] = (byProperty[d.prop] ?? 0) + 1

console.log(`主题 ${THEME}/${MODE} — 与原始站点对比`)
console.log(`属性条目 ${original.length} · 变化 ${diffs.length}`)
console.log('按属性:', JSON.stringify(byProperty))

const grouped = new Map()
for (const d of diffs) {
  const k = `${d.label}|${d.prop}|${d.before}→${d.after}`
  grouped.set(k, (grouped.get(k) ?? 0) + 1)
}
console.log(`\n去重后的差异模式 ${grouped.size} 种:`)
for (const [k, count] of [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ×${String(count).padEnd(4)} ${k}`)
}

await browser.close()
server.kill()
