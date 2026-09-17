#!/usr/bin/env node
/**
 * Build the shipped theme library.
 *
 * Reads a Sandcode Theme Studio install (or any directory of OpenCode
 * theme.json files) and writes one role-format theme per file into themes/.
 *
 * Usage: node tools/import-themes.mjs [builtinsDir]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromOpenCode } from '../engine/theme.mjs'
import { BASE_THEME } from '../engine/roles.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'themes')
const SOURCE =
  process.argv[2] ??
  '/Users/qumo/Documents/Others/Sandbase/Sandcode Theme/src/domain/opencode/builtins'

const DISPLAY = {
  tokyonight: 'Tokyo Night',
  'one-dark': 'One Dark',
  'catppuccin-frappe': 'Catppuccin Frappé',
  'catppuccin-macchiato': 'Catppuccin Macchiato',
  catppuccin: 'Catppuccin Latte',
  rosepine: 'Rosé Pine',
  synthwave84: 'Synthwave 84',
  nightowl: 'Night Owl',
  'lucent-orng': 'Lucent Orange',
  'osaka-jade': 'Osaka Jade',
  cobalt2: 'Cobalt 2',
  github: 'GitHub',
  carbonfox: 'Carbonfox',
  opencode: 'OpenCode',
  orng: 'Orange',
  vercel: 'Vercel',
}

function displayName(id) {
  if (DISPLAY[id]) return DISPLAY[id]
  return id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

mkdirSync(OUT, { recursive: true })

const index = []

// the fallback theme is a real theme here, so SandBase ships as a choice too
writeFileSync(
  join(OUT, 'sandbase.json'),
  `${JSON.stringify({ id: 'sandbase', label: 'SandBase', roles: { light: BASE_THEME.light, dark: BASE_THEME.dark } }, null, 2)}\n`,
)
index.push({ id: 'sandbase', label: 'SandBase' })

let imported = 0
for (const file of readdirSync(SOURCE).filter((f) => f.endsWith('.json')).sort()) {
  const id = file.replace(/\.json$/, '')
  const json = JSON.parse(readFileSync(join(SOURCE, file), 'utf8'))
  try {
    const roles = fromOpenCode(json)
    const label = displayName(id)
    writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify({ id, label, roles }, null, 2)}\n`)
    index.push({ id, label })
    imported += 1
  } catch (error) {
    console.error(`skip ${id}: ${error.message}`)
  }
}

index.sort((a, b) => (a.id === 'sandbase' ? -1 : b.id === 'sandbase' ? 1 : a.label.localeCompare(b.label)))
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)

console.log(`${imported} themes imported from ${SOURCE}`)
console.log(`${index.length} themes in themes/index.json`)
