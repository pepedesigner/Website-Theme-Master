/**
 * Theme model.
 *
 * A theme is nothing more than a set of role → colour pairs, per mode. Themes
 * can be authored directly in that shape, or imported from an OpenCode /
 * Sandcode Theme Studio file (TUI tokens), which is what `fromOpenCode` does.
 */
import {
  composite,
  contrast,
  chroma,
  mix,
  parseColor,
  readableOn,
  toHex,
  luminance,
} from './color.mjs'
import { ALL_ROLES, BASE_THEME, NEUTRAL_ROLES, MODES } from './roles.mjs'

/* ------------------------------------------------------- OpenCode import */

const ANSI = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
]

function ansiToHex(code) {
  if (code < 16) return ANSI[code] ?? '#000000'
  if (code < 232) {
    const index = code - 16
    const blue = index % 6
    const green = Math.floor(index / 6) % 6
    const red = Math.floor(index / 36)
    const ch = (v) => (v === 0 ? 0 : v * 40 + 55)
    return `#${[red, green, blue].map(ch).map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    const h = gray.toString(16).padStart(2, '0')
    return `#${h}${h}${h}`
  }
  return '#000000'
}

/**
 * Resolve one token, following `defs` and theme references.
 *
 * Deliberately checks `defs` before the CSS named-colour table. Theme Studio
 * does the opposite, which silently rewrites any palette entry whose name
 * collides with a CSS colour — Dracula's `purple` def (#bd93f9) resolves to CSS
 * #800080 there. The palette the author wrote is the palette we render.
 */
function resolveValue(theme, value, mode, path = []) {
  if (value === undefined || value === null) return null
  if (typeof value === 'object') {
    if (!('dark' in value)) return null
    return resolveValue(theme, value[mode], mode, path)
  }
  if (typeof value === 'number') return ansiToHex(value)

  const definition = theme.defs?.[value]
  if (definition !== undefined) {
    if (path.includes(`defs:${value}`)) throw new Error(`circular reference: ${value}`)
    return resolveValue(theme, definition, mode, [...path, `defs:${value}`])
  }

  if (parseColor(value)) return String(value).trim().toLowerCase()

  if (theme.theme[value] !== undefined && value !== 'thinkingOpacity') {
    if (path.includes(`theme:${value}`)) throw new Error(`circular reference: ${value}`)
    return resolveValue(theme, theme.theme[value], mode, [...path, `theme:${value}`])
  }

  throw new Error(`unknown theme reference "${value}"`)
}

export function resolveOpenCodeTokens(json, mode) {
  const tokens = {}
  for (const [token, value] of Object.entries(json.theme ?? {})) {
    if (token === 'thinkingOpacity') continue
    const resolved = resolveValue(json, value, mode)
    if (resolved) tokens[token] = resolved
  }
  for (const [token, value] of Object.entries(json.defs ?? {})) {
    const resolved = resolveValue(json, value, mode)
    if (resolved) tokens[`defs.${token}`] = resolved
  }
  tokens.selectedListItemText ??= tokens.background
  return tokens
}

function backgroundFallback(tokens, mode) {
  const named = Object.entries(tokens)
    .filter(([key]) => key.startsWith('defs.'))
    .map(([key, value]) => [key.slice(5), value])
  const scoped = named.filter(([key]) => new RegExp(mode, 'i').test(key))
  return (
    scoped.find(([key]) => /panel|surface|bg/i.test(key))?.[1] ??
    named.find(([key]) => /panel|surface|bg/i.test(key))?.[1] ??
    null
  )
}

function ensureContrast(color, backgrounds, target, toward) {
  const list = backgrounds.filter(Boolean)
  if (list.every((bg) => contrast(color, bg) >= target)) return color
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(color, toward, t)
    if (list.every((bg) => contrast(candidate, bg) >= target)) return candidate
  }
  return toward
}

function ensureDistinct(color, from, threshold, toward) {
  if (contrast(color, from) >= threshold) return color
  for (let t = 0.02; t <= 0.42; t += 0.02) {
    const candidate = mix(color, toward, t)
    if (contrast(candidate, from) >= threshold) return candidate
  }
  return mix(color, toward, 0.42)
}

/**
 * Reduce a resolved TUI token set to our roles.
 *
 * A lot of this is repair work: TUI themes assume a terminal composites them
 * (translucent and even `transparent` backgrounds are legal), and they are not
 * required to be legible as a web page. So we flatten onto real backdrops, then
 * nudge the roles that carry text until they clear AA.
 */
export function rolesFromTokens(tokens, mode, darkTokens) {
  const base = mode === 'dark' ? '#000000' : '#FFFFFF'
  const pick = (map, key) => (map[key] && map[key] !== 'transparent' ? map[key] : null)

  const canvasRaw = pick(tokens, 'background') ?? backgroundFallback(tokens, mode)
  const canvas = canvasRaw ? composite(canvasRaw, base) : mix(base, mode === 'dark' ? '#FFFFFF' : '#000000', 0.06)

  const flatten = (value) => composite(value, canvas)
  const t = {}
  for (const key of Object.keys(tokens)) {
    if (key.startsWith('defs.')) continue
    const value = pick(tokens, key)
    if (value) t[key] = flatten(value)
  }

  const darkCanvasRaw = pick(darkTokens, 'background') ?? backgroundFallback(darkTokens, 'dark')
  const darkCanvas = darkCanvasRaw ? composite(darkCanvasRaw, '#000000') : '#0E0B1A'
  const d = {}
  for (const key of Object.keys(darkTokens)) {
    if (key.startsWith('defs.')) continue
    const value = pick(darkTokens, key)
    if (value) d[key] = composite(value, darkCanvas)
  }

  const toward = contrast(canvas, '#0E0B1A') >= contrast(canvas, '#FFFFFF') ? '#0E0B1A' : '#FFFFFF'
  const surface = ensureDistinct(t.backgroundPanel ?? canvas, canvas, 1.05, toward)
  const surfaceAlt = ensureDistinct(
    ensureDistinct(t.backgroundElement ?? surface, canvas, 1.08, toward),
    surface,
    1.03,
    toward,
  )
  const nudge = (color, target = 4.5) =>
    ensureContrast(color ?? t.text ?? canvas, [canvas, surface, surfaceAlt], target, toward)

  const border = t.border ?? t.borderSubtle ?? t.text
  let hairline = mix(border, canvas, 0.5)
  for (let x = 0.6; x <= 0.9 && contrast(hairline, canvas) > 1.55; x += 0.1) {
    hairline = mix(border, canvas, x)
  }

  const codeBg = mode === 'light'
    ? ensureDistinct(d.background ?? '#0E0B1A', canvas, 1.5, toward)
    : ensureDistinct(mix(d.backgroundPanel ?? canvas, d.text ?? '#FFFFFF', 0.05), canvas, 1.18, toward)
  const codeFg = ensureContrast(d.text ?? '#F2F0F3', [codeBg], 4.5, toward)
  const codeToken = (value, fallback) => {
    const candidate = value ?? fallback
    return contrast(candidate, codeBg) >= 3 ? candidate : mix(candidate, codeFg, 0.4)
  }

  const accent = nudge(t.primary ?? t.accent, 4.5)
  const highlight = t.accent ?? t.secondary ?? t.primary ?? accent
  const text = nudge(t.text, 4.5)

  return {
    canvas,
    surface,
    surfaceAlt,
    border: hairline,
    borderStrong: contrast(border, canvas) >= 3 ? border : text,
    muted: nudge(t.textMuted, 4.5),
    text,
    accent,
    accentFg: readableOn(accent),
    highlight,
    highlightFg: readableOn(highlight),
    positive: nudge(t.success, 3),
    warning: nudge(t.warning, 3),
    danger: nudge(t.error, 4.5),
    plate: codeBg,
    plateFg: codeFg,
    codeBg,
    codeFg,
    codeKeyword: codeToken(d.syntaxKeyword ?? d.primary, codeFg),
    codeFunction: codeToken(d.syntaxFunction ?? d.accent, codeFg),
    codeNumber: codeToken(d.syntaxNumber ?? d.warning, codeFg),
    codeMuted: ensureContrast(d.textMuted ?? codeFg, [codeBg], 4.5, codeFg),
  }
}

/** Import an OpenCode / Theme Studio theme file into the role model. */
export function fromOpenCode(json) {
  const lightTokens = resolveOpenCodeTokens(json, 'light')
  const darkTokens = resolveOpenCodeTokens(json, 'dark')
  return {
    light: rolesFromTokens(lightTokens, 'light', darkTokens),
    dark: rolesFromTokens(darkTokens, 'dark', darkTokens),
  }
}

/** Import a theme file in any supported shape. */
export function importTheme(json, fallbackId = 'imported') {
  if (json?.roles?.light && json?.roles?.dark) {
    return { id: json.id ?? fallbackId, label: json.label ?? fallbackId, roles: json.roles }
  }
  if (json?.light && json?.dark) {
    return { id: json.id ?? fallbackId, label: json.label ?? fallbackId, roles: { light: json.light, dark: json.dark } }
  }
  if (json?.theme) {
    return { id: fallbackId, label: json.label ?? fallbackId, roles: fromOpenCode(json) }
  }
  throw new Error('unrecognised theme file')
}

/* ------------------------------------------------------------ utilities */

/** Merge a (possibly partial) theme over the fallback base. */
export function fillRoles(theme) {
  const out = {}
  for (const mode of MODES) {
    out[mode] = { ...BASE_THEME[mode], ...(theme?.roles?.[mode] ?? theme?.[mode] ?? {}) }
  }
  return out
}

export function roleList(roles, mode) {
  return ALL_ROLES.map((role) => ({ role, color: roles[mode][role] })).filter((entry) => parseColor(entry.color))
}

/**
 * The theme's neutral ramp, brightest first. This is the thing a site's own
 * neutral ramp gets stretched onto.
 */
export function neutralRamp(roles, mode) {
  return NEUTRAL_ROLES
    .map((role) => ({ role, color: roles[mode][role] }))
    .filter((entry) => parseColor(entry.color))
    .sort((a, b) => luminance(b.color) - luminance(a.color))
}

/** The theme's chromatic roles, deduplicated by resolved colour. */
export function chromaRoles(roles, mode) {
  const seen = new Map()
  for (const role of ['accent', 'highlight', 'positive', 'warning', 'danger']) {
    const color = roles[mode][role]
    if (!parseColor(color)) continue
    const key = toHex(color)
    if (!seen.has(key)) seen.set(key, { role, color: key, chroma: chroma(color) })
  }
  return [...seen.values()]
}
