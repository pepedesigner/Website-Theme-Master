/**
 * Colour transfer.
 *
 * The problem: a theme speaks in roles, a site speaks in whatever its authors
 * felt like. There is no reliable way to ask a random site "what is your accent
 * colour", so instead we measure each colour's *distance from the page canvas*
 * and stretch that onto the theme's ramp for whatever job that colour is doing.
 *
 * That keeps a site's own light/dark structure intact while swapping its
 * palette wholesale, and it works on sites with no design tokens at all.
 */
import {
  chroma as chromaOf,
  luminance,
  mix,
  parseColor,
  rgba,
  toHex,
  toHsl,
} from './color.mjs'

const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

function dedupe(colors) {
  const out = []
  for (const color of colors) {
    if (!parseColor(color)) continue
    if (out.length && toHex(out[out.length - 1]) === toHex(color)) continue
    out.push(color)
  }
  return out
}

/**
 * Ramps per property kind, ordered the way each kind is sorted.
 *
 * A background is not a text colour, even when it is the same hex — sandcode
 * paints `#0e0b1a` as body ink *and* as its terminal panel, and `#f2f0f3` as the
 * page canvas *and* as the ink inside that panel. Resolving each kind against
 * its own ramp is what lets one hex be right in both jobs.
 *
 * Backgrounds climb away from the canvas; foregrounds climb toward the ink, so
 * the colour furthest from the canvas is the one that becomes the theme's text.
 */
const RAMP_ROLES = {
  background: { roles: ['surface', 'surfaceAlt'], order: 'asc' },
  foreground: { roles: ['text', 'muted', 'borderStrong'], order: 'desc' },
  border: { roles: ['border', 'borderStrong'], order: 'asc' },
}

/**
 * A well-named custom property states its own role, and that beats any amount of
 * statistics. `--muted` is the muted text colour because it says so.
 */
const ROLE_HINTS = [
  // code surfaces first, because `--panel-fg` is a code colour while `--panel`
  // is the surface it sits on — the compound names have to win before the
  // generic `fg` and `panel` rules see them
  [/(panel|code|terminal|console|snippet|editor|(^|[-_])pre)[-_]?(fg|text|foreground|ink|content)/i, 'plateFg'],
  [/(syntax|code|token)[-_]?(keyword|bright|type|tag)/i, 'codeKeyword'],
  [/(syntax|code|token)[-_]?(func|fn|function|method)/i, 'codeFunction'],
  [/(syntax|code|token)[-_]?(num|number|literal|warn|constant)/i, 'codeNumber'],
  [/(syntax|code|token)[-_]?(muted|comment|dim)/i, 'codeMuted'],
  [/(panel|code|terminal|console|snippet|editor|(^|[-_])(pre|editor))/i, 'plate'],

  [/(^|[-_])(muted|dim|quiet|subtle|tertiary|text-secondary|secondary-text)/i, 'muted'],
  [/(^|[-_])(accent|primary|brand|link|focus)/i, 'accent'],
  [/(^|[-_])(highlight|mark|selection)/i, 'highlight'],
  [/(^|[-_])(success|positive|ok|valid)/i, 'positive'],
  [/(^|[-_])(warning|warn|caution)/i, 'warning'],
  [/(^|[-_])(danger|error|destructive|invalid|critical|red)/i, 'danger'],
  [/(^|[-_])strong/i, 'borderStrong'],
  [/(border|divider|stroke|outline|rule|hairline|separator|(^|[-_])line)/i, 'border'],
  [/(^|[-_])(ink|text|foreground|fg|content|on-surface)/i, 'text'],
  [/(bg|background|surface|layer|neutral|gray|grey)[-_]?(3|alt|element|raised|elevated|muted)/i, 'surfaceAlt'],
  [/(bg|background|surface|layer|neutral|gray|grey)[-_]?(2|secondary|subtle|sunken)/i, 'surface'],
  [/(^|[-_])(card|popover|menu|dropdown|modal|dialog|overlay|elevation|sheet)/i, 'surface'],
  [/(tint|wash|band|stripe|strip|well|inset)/i, 'surfaceAlt'],
  [/(^|[-_])(bg|background|surface|canvas|page|layer|base)/i, 'canvas'],
]

/** Which role a custom property's a name claims, if any. */
function roleFromVariableName(name) {
  const bare = name.replace(/^--/, '')
  for (const [pattern, role] of ROLE_HINTS) {
    if (pattern.test(bare)) return role
  }
  return null
}

/** Which kind each colour-bearing CSS property belongs to. */
function kindOf(property) {
  if (/^background/.test(property)) return 'background'
  if (/^border|^outline|^column-rule/.test(property)) return 'border'
  if (property === 'box-shadow') return 'background'
  return 'foreground'
}

/** Custom properties are context-free, so their name is the only clue we get. */
function kindOfVariable(name) {
  const role = roleFromVariableName(name)
  if (role === 'canvas' || role === 'surface' || role === 'surfaceAlt' || role === 'plate') return 'background'
  if (role === 'border' || role === 'borderStrong') return 'border'
  if (role === 'text' || role === 'muted') return 'foreground'
  if (/bg|background|surface|panel|card|canvas|plate|elevation|shade|fill/i.test(name)) return 'background'
  if (/border|divider|stroke|outline|rule|line|hairline|separator/i.test(name)) return 'border'
  return 'foreground'
}

/**
 * Build the colour transfer.
 *
 * Colours the page actually paints are ranked and paired with their ramp, so a
 * site's own ordering survives: its faintest text becomes the theme's muted,
 * its strongest becomes the theme's text. Anything else — hover states, dialogs,
 * the mobile menu, the whole of a stylesheet for a page you are not looking at —
 * falls through to the same ramp resolved by distance from the canvas. A lookup
 * table alone left Wikipedia at 35 rules; the resolver takes it past 600.
 *
 * @returns {{ resolve: (color: string, kind?: string) => string, size: number }}
 */
export function buildMapping(site, roles, mode, options = {}) {
  const strength = Math.max(0, Math.min(1, options.strength ?? 1))
  const keep = (original, target) => (strength >= 1 ? toHex(target) : mix(original, target, strength))

  const canvasKey = toHex(site.canvas)
  const canvasLum = luminance(site.canvas)
  const plateKeys = new Set((site.plates ?? []).map((entry) => toHex(entry.color)))
  const plateInkKeys = new Set((site.plateInk ?? []).map((entry) => toHex(entry.color)))

  const table = new Map()
  const ramps = {}

  for (const [kind, config] of Object.entries(RAMP_ROLES)) {
    const stops = dedupe(config.roles.map((name) => roles[mode][name]))
    const list = stops.length ? stops : [roles[mode].text]

    const source =
      kind === 'background' ? site.backgrounds : kind === 'border' ? site.borders : site.foregrounds
    const candidates = (source ?? [])
      .filter((entry) => parseColor(entry.color))
      // the canvas and the plate ink are pinned by role below, so they must not
      // also consume a slot in the ranking
      .filter((entry) =>
        kind === 'background' ? toHex(entry.color) !== canvasKey : !plateInkKeys.has(toHex(entry.color)),
      )

    // a colour used twice on one page is noise, and letting it take the text
    // slot is how a single stray hex used to steal a whole role
    const heaviest = Math.max(...candidates.map((entry) => entry.weight), 0)
    const observed = candidates
      .filter((entry) => entry.weight >= heaviest * 0.05)
      .map((entry) => ({ ...entry, distance: Math.abs(luminance(entry.color) - canvasLum) }))
      .sort((a, b) => (config.order === 'asc' ? a.distance - b.distance : b.distance - a.distance))

    observed.forEach((entry, index) => {
      const position = observed.length === 1 ? 0 : index / (observed.length - 1)
      const target = list[Math.round(position * (list.length - 1))]
      table.set(`${kind}:${toHex(entry.color)}`, keep(entry.color, target))
    })

    // a floor on the span keeps a very low-contrast site from being stretched
    // into something it never was
    ramps[kind] = {
      stops: list,
      span: Math.max(...observed.map((entry) => entry.distance), 0.5),
    }
  }

  // the canvas is the one colour that must never be guessed
  table.set(`background:${canvasKey}`, keep(site.canvas, roles[mode].canvas))

  // inverse panels keep their role: the plate colour on the background side
  // only, and its ink on the foreground side only
  for (const entry of site.plates ?? []) {
    table.set(`background:${toHex(entry.color)}`, keep(entry.color, roles[mode].plate))
  }
  for (const entry of site.plateInk ?? []) {
    for (const kind of ['foreground', 'border']) {
      table.set(`${kind}:${toHex(entry.color)}`, keep(entry.color, roles[mode].plateFg))
    }
  }

  /* ------------------------------------------------------ chromatic */

  const themeChroma = dedupe(['accent', 'highlight', 'positive', 'warning', 'danger'].map((role) => roles[mode][role]))
  const byHue = [...themeChroma].sort((a, b) => toHsl(a).h - toHsl(b).h)

  const siteChroma = (site.chroma ?? [])
    .filter((entry) => parseColor(entry.color))
    .sort((a, b) => b.weight - a.weight)

  if (siteChroma.length) {
    // the loudest colour on the site becomes the theme's accent — that is the
    // whole point of picking a theme
    table.set(`chroma:${toHex(siteChroma[0].color)}`, keep(siteChroma[0].color, roles[mode].accent))

    const palette = dedupe(['highlight', 'positive', 'warning', 'danger'].map((role) => roles[mode][role]))
      .sort((a, b) => toHsl(a).h - toHsl(b).h)
    const ranked = siteChroma
      .slice(1)
      .map((entry) => ({ ...entry, hue: toHsl(entry.color).h }))
      .sort((a, b) => a.hue - b.hue)

    ranked.forEach((entry, index) => {
      const position = ranked.length === 1 ? 0 : index / (ranked.length - 1)
      const target = palette[Math.round(position * (palette.length - 1))]
      if (target) table.set(`chroma:${toHex(entry.color)}`, keep(entry.color, target))
    })
  }

  /**
   * An unobserved colour: keep its hue if the theme has something near it,
   * otherwise hand it the theme's accent. A site's blue links turning into the
   * theme's signature colour is the point; a red error turning orange is not.
   */
  const chromaTarget = (color) => {
    const hue = toHsl(color).h
    let best = null
    let bestDistance = 46
    for (const candidate of byHue) {
      const raw = Math.abs(toHsl(candidate).h - hue)
      const distance = Math.min(raw, 360 - raw)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    return best ?? roles[mode].accent
  }

  const resolve = (color, kind = 'foreground') => {
    const key = toHex(color)
    if (chromaOf(color) >= 0.14) {
      return keep(color, table.get(`chroma:${key}`) ?? chromaTarget(color))
    }
    const known = table.get(`${kind}:${key}`)
    if (known !== undefined) return known
    const { stops, span } = ramps[kind] ?? ramps.foreground
    const position = Math.min(1, Math.abs(luminance(color) - canvasLum) / span)
    return keep(color, stops[Math.round(position * (stops.length - 1))])
  }

  /**
   * A custom property that names its own role gets that role directly — no
   * inference. `--muted` should be the theme's muted text because it says so.
   *
   * The name comes first, not the measurement. A site can use one hex for both
   * its page canvas and the ink inside a dark panel (sandcode does exactly
   * that), so a colour we saw acting as a plate is not proof that *this*
   * variable is a plate — `--bg` still means the canvas.
   */
  const resolveVariable = (name, color) => {
    const key = toHex(color)
    const role = roleFromVariableName(name)
    if (role && roles[mode][role]) return keep(color, roles[mode][role])
    if (plateKeys.has(key)) return keep(color, roles[mode].plate)
    if (plateInkKeys.has(key)) return keep(color, roles[mode].plateFg)
    if (chromaOf(color) >= 0.14) return resolve(color, 'foreground')
    return resolve(color, kindOfVariable(name))
  }

  return { resolve, resolveVariable, size: table.size, kindOf, kindOfVariable }
}

/** Rewrite every colour token inside an arbitrary CSS value. */
export function remapValue(value, mapping, kind = 'foreground') {
  let changed = false
  const output = value.replace(COLOR_TOKEN, (token) => {
    const parsed = parseColor(token)
    if (!parsed) return token
    const mapped = mapping.resolve(token, kind)
    if (toHex(token) === toHex(mapped)) return token
    changed = true
    return parsed.a >= 1 ? mapped : rgba(mapped, Number(parsed.a.toFixed(3)))
  })
  return changed ? output : null
}

/**
 * The colour half of the override stylesheet.
 *
 * `!important` throughout: it is the only way to beat a site's own inline
 * styles and its most specific selectors without knowing its cascade.
 */
export function buildColorCss(site, mapping, options = {}) {
  const limit = options.maxRules ?? 30000
  const out = []

  for (const { selector, name, color } of site.customProps ?? []) {
    const mapped = mapping.resolveVariable(name, color)
    if (toHex(mapped) !== toHex(color)) out.push(`${selector}{${name}:${mapped} !important}`)
  }

  for (const { selector, prop, value } of site.declarations ?? []) {
    if (out.length >= limit) break
    const mapped = remapValue(value, mapping, mapping.kindOf(prop))
    if (mapped) out.push(`${selector}{${prop}:${mapped} !important}`)
  }

  return out.join('\n')
}

export { COLOR_TOKEN, dedupe }
