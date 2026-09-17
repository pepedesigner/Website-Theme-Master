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
  composite,
  contrast,
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
 * Component-scoped prefixes.
 *
 * Real design systems are full of paired variables that belong to one component
 * rather than to the page: `--btn-bg` / `--btn-fg`, `--mark-bg` / `--mark-fg`.
 * Guessing a page-level role from the `-bg` in `--btn-bg` inverts the button;
 * guessing one from the `mark` in `--mark-fg` paints highlight text in the
 * highlight colour. When a name is namespaced like this, we resolve it from the
 * colour we measured instead of from its name.
 */
const COMPONENT_PREFIXES = new Set([
  'btn', 'button', 'input', 'field', 'badge', 'chip', 'tag', 'pill',
  'tooltip', 'popover', 'modal', 'dialog', 'toast', 'alert', 'banner',
  'nav', 'navbar', 'menu', 'sidebar', 'header', 'footer', 'hero',
  'table', 'tab', 'form', 'switch', 'toggle', 'slider', 'checkbox', 'radio',
  'avatar', 'dropdown', 'accordion', 'breadcrumb', 'pagination', 'progress',
  'skeleton', 'spinner', 'segment', 'tabbar', 'topbar', 'drawer', 'sheet',
])

const FG_WORDS = new Set(['fg', 'text', 'foreground', 'ink', 'content', 'contrast', 'label'])

/** Split a variable name into role-ish tokens: `--color-bg-2` → [color, bg, 2]. */
function tokensOf(name) {
  return name
    .replace(/^--/, '')
    .replace(/(\d+)/g, '-$1-')
    .toLowerCase()
    .split(/[-_.]+/)
    .filter(Boolean)
}

/** Which role a custom property's name claims, if any. */
export function roleFromVariableName(name) {
  const tokens = tokensOf(name)
  if (!tokens.length) return null

  // a component namespace means the colour belongs to that component, and its
  // second word (`bg`, `fg`) says nothing about its role on the page
  if (tokens.length > 1 && COMPONENT_PREFIXES.has(tokens[0])) return null

  const has = (...words) => words.some((word) => tokens.includes(word))
  const isFg = tokens.some((word) => FG_WORDS.has(word)) || tokens.includes('on')

  if (has('code', 'syntax', 'token', 'editor')) {
    if (has('keyword', 'bright', 'type', 'tag', 'key')) return 'codeKeyword'
    if (has('func', 'function', 'method', 'path', 'accent')) return 'codeFunction'
    if (has('num', 'number', 'literal', 'warn', 'constant')) return 'codeNumber'
    if (has('muted', 'dim', 'comment', 'quiet')) return 'codeMuted'
    return 'codeFg'
  }

  if (has('panel', 'terminal', 'console', 'snippet', 'editor', 'pre')) {
    return isFg ? 'plateFg' : 'codeBg'
  }

  if (has('plate', 'band', 'banner')) {
    return isFg ? 'plateFg' : 'plate'
  }

  if (has('mark', 'highlight', 'selection')) return isFg ? 'highlightFg' : 'highlight'

  if (has('accent', 'primary', 'brand', 'link')) {
    return isFg || has('strong') ? 'accentFg' : 'accent'
  }

  if (has('success', 'positive', 'valid')) return 'positive'
  if (has('warning', 'warn', 'caution')) return 'warning'
  if (has('danger', 'error', 'destructive', 'invalid', 'critical', 'red')) return 'danger'

  if (has('muted', 'dim', 'quiet', 'subtle', 'tertiary')) return 'muted'
  if (has('strong', 'bold')) return 'borderStrong'
  if (has('border', 'divider', 'stroke', 'outline', 'hairline', 'separator', 'line', 'rule')) return 'border'
  if (has('ink', 'text', 'foreground', 'fg', 'content')) return 'text'
  if (has('surface', 'card', 'elevation', 'overlay', 'popover', 'menu', 'dropdown', 'modal', 'dialog')) return 'surface'
  if (has('tint', 'wash', 'band', 'stripe', 'well', 'inset', 'shade')) return 'surfaceAlt'

  // page-level backgrounds only when the name *leads* with one, so `--btn-bg`
  // and `--chrome-bg` fall through to measurement instead of becoming the canvas
  if (['bg', 'background', 'canvas', 'page', 'body'].includes(tokens[0])) {
    if (has('3', 'alt', 'element', 'raised', 'elevated', 'tertiary', 'high')) return 'surfaceAlt'
    if (has('2', 'secondary', 'subtle', 'sunken', 'low', 'muted')) return 'surface'
    return 'canvas'
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
  const tokens = tokensOf(name)
  if (tokens.some((t) => ['bg', 'background', 'surface', 'panel', 'card', 'canvas', 'plate', 'elevation', 'shade', 'fill'].includes(t))) {
    return 'background'
  }
  if (tokens.some((t) => ['border', 'divider', 'stroke', 'outline', 'rule', 'line', 'hairline', 'separator'].includes(t))) {
    return 'border'
  }
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

  /**
   * A faint neutral wash — a 5% hover tint, a 14% hairline — is structural, not
   * brand. It only has to be re-pointed when the theme flips the page's
   * polarity; a dark wash on a light page becoming a dark wash on a dark page
   * is the one case where leaving it alone makes it disappear. Otherwise it
   * stays exactly as the site wrote it.
   */
  const themeIsLight = luminance(roles[mode].canvas) > 0.5
  const flipWash = canvasLum > 0.5 !== themeIsLight
  const isWash = (color) => {
    const parsed = parseColor(color)
    return Boolean(parsed) && parsed.a > 0 && parsed.a < 0.25 && chromaOf(color) < 0.12
  }

  const table = new Map()
  const ramps = {}
  const inkKeys = new Set()
  // which role each entry was paired with. Two roles regularly share a hex —
  // Catppuccin Frappé's `text` and `plateFg` are both #c6d0f5 — so guessing the
  // role back from the colour picks the wrong backdrop half the time.
  const roleTable = new Map()

  // Surfaces sit on one side of the canvas or the other: in SandCode's light
  // theme `surface` is *lighter* than the canvas and `surfaceAlt` is *darker*,
  // so ranking purely by distance cannot tell them apart. When the theme's two
  // surfaces straddle the canvas, a site colour's side decides its role.
  const surfaceSide = Math.sign(luminance(roles[mode].surface) - canvasLum)
  const altSide = Math.sign(luminance(roles[mode].surfaceAlt) - canvasLum)
  const straddles = surfaceSide !== 0 && altSide !== 0 && surfaceSide !== altSide

  for (const [kind, config] of Object.entries(RAMP_ROLES)) {
    // keep the role names alongside their colours so a pairing can report both
    const stops = []
    for (const roleName of config.roles) {
      const value = roles[mode][roleName]
      if (!parseColor(value)) continue
      if (stops.length && toHex(stops[stops.length - 1].color) === toHex(value)) continue
      stops.push({ role: roleName, color: value })
    }
    const list = stops.length ? stops : [{ role: 'text', color: roles[mode].text }]

    const source =
      kind === 'background' ? site.backgrounds : kind === 'border' ? site.borders : site.foregrounds
    const candidates = (source ?? [])
      .filter((entry) => parseColor(entry.color))
      // the canvas and the plate ink are pinned by role below, so they must not
      // also consume a slot in the ranking
      .filter((entry) =>
        kind === 'background' ? toHex(entry.color) !== canvasKey : !plateInkKeys.has(toHex(entry.color)),
      )

    const placed = new Set()
    if (kind === 'background' && straddles) {
      for (const entry of candidates) {
        const side = Math.sign(luminance(entry.color) - canvasLum)
        if (side !== surfaceSide && side !== altSide) continue
        const roleName = side === surfaceSide ? 'surface' : 'surfaceAlt'
        table.set(`${kind}:${toHex(entry.color)}`, keep(entry.color, roles[mode][roleName]))
        roleTable.set(`${kind}:${toHex(entry.color)}`, roleName)
        placed.add(toHex(entry.color))
      }
    }

    // a colour used twice on one page is noise, and letting it take the text
    // slot is how a single stray hex used to steal a whole role
    const heaviest = Math.max(...candidates.map((entry) => entry.weight), 0)
    const observed = candidates
      .filter((entry) => !placed.has(toHex(entry.color)))
      .filter((entry) => entry.weight >= heaviest * 0.05)
      .map((entry) => ({ ...entry, distance: Math.abs(luminance(entry.color) - canvasLum) }))
      .sort((a, b) => (config.order === 'asc' ? a.distance - b.distance : b.distance - a.distance))

    observed.forEach((entry, index) => {
      const position = observed.length === 1 ? 0 : index / (observed.length - 1)
      const stop = list[Math.round(position * (list.length - 1))]
      table.set(`${kind}:${toHex(entry.color)}`, keep(entry.color, stop.color))
      roleTable.set(`${kind}:${toHex(entry.color)}`, stop.role)
      // remember which colour won the text role; the background pass needs it
      if (kind === 'foreground' && stop.role === 'text') inkKeys.add(toHex(entry.color))
    })

    // a floor on the span keeps a very low-contrast site from being stretched
    // into something it never was
    ramps[kind] = {
      stops: list,
      span: Math.max(...observed.map((entry) => entry.distance), 0.5),
    }
  }

  // A site's ink is sometimes used as a fill as well as for text — SandCode
  // paints its primary button with `--ink`. Left to the background ramp that
  // fill lands on a surface and the button inverts, so the ink claims it back.
  for (const key of inkKeys) {
    if (key !== canvasKey) {
      table.set(`background:${key}`, keep(key, roles[mode].text))
      roleTable.set(`background:${key}`, 'text')
    }
  }

  // the canvas is the one colour that must never be guessed
  table.set(`background:${canvasKey}`, keep(site.canvas, roles[mode].canvas))
  roleTable.set(`background:${canvasKey}`, 'canvas')

  // inverse panels keep their role: the plate colour on the background side
  // only, and its ink on the foreground side only
  for (const entry of site.plates ?? []) {
    table.set(`background:${toHex(entry.color)}`, keep(entry.color, roles[mode].plate))
    roleTable.set(`background:${toHex(entry.color)}`, 'plate')
  }
  for (const entry of site.plateInk ?? []) {
    for (const kind of ['foreground', 'border']) {
      table.set(`${kind}:${toHex(entry.color)}`, keep(entry.color, roles[mode].plateFg))
      roleTable.set(`${kind}:${toHex(entry.color)}`, 'plateFg')
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
    roleTable.set(`chroma:${toHex(siteChroma[0].color)}`, 'accent')

    const palette = dedupe(['highlight', 'positive', 'warning', 'danger'].map((role) => roles[mode][role]))
      .sort((a, b) => toHsl(a).h - toHsl(b).h)
    const ranked = siteChroma
      .slice(1)
      .map((entry) => ({ ...entry, hue: toHsl(entry.color).h }))
      .sort((a, b) => a.hue - b.hue)

    ranked.forEach((entry, index) => {
      const position = ranked.length === 1 ? 0 : index / (ranked.length - 1)
      const target = palette[Math.round(position * (palette.length - 1))]
      if (target) {
        table.set(`chroma:${toHex(entry.color)}`, keep(entry.color, target))
        const named = ['highlight', 'positive', 'warning', 'danger'].find(
          (role) => toHex(roles[mode][role]) === toHex(target),
        )
        if (named) roleTable.set(`chroma:${toHex(entry.color)}`, named)
      }
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

  /** Resolve, and report which role the answer belongs to. */
  const resolveDetailed = (color, kind = 'foreground') => {
    if (isWash(color)) return { color: flipWash ? toHex(roles[mode].text) : toHex(color), role: 'text' }
    const key = toHex(color)
    if (chromaOf(color) >= 0.14) {
      const known = table.get(`chroma:${key}`)
      return { color: keep(color, known ?? chromaTarget(color)), role: roleTable.get(`chroma:${key}`) ?? 'accent' }
    }
    const known = table.get(`${kind}:${key}`)
    if (known !== undefined) return { color: known, role: roleTable.get(`${kind}:${key}`) ?? null }
    // a colour equal to the page canvas is the canvas in every job it does —
    // SandCode paints its primary button's label with it (`--btn-fg: var(--bg)`)
    if (key === canvasKey) return { color: keep(color, roles[mode].canvas), role: 'canvas' }
    const { stops, span } = ramps[kind] ?? ramps.foreground
    const position = Math.min(1, Math.abs(luminance(color) - canvasLum) / span)
    const stop = stops[Math.round(position * (stops.length - 1))]
    return { color: keep(color, stop.color), role: stop.role }
  }

  const resolve = (color, kind = 'foreground') => resolveDetailed(color, kind).color

  /**
   * A custom property that names its own role gets that role directly — no
   * inference. `--muted` should be the theme's muted text because it says so.
   *
   * The name comes first, not the measurement. A site can use one hex for both
   * its page canvas and the ink inside a dark panel (sandcode does exactly
   * that), so a colour we saw acting as a plate is not proof that *this*
   * variable is a plate — `--bg` still means the canvas.
   */
  const resolveVariableDetailed = (name, color) => {
    if (isWash(color)) return { color: flipWash ? toHex(roles[mode].text) : toHex(color), role: 'text' }
    const key = toHex(color)
    const role = roleFromVariableName(name)
    if (role && roles[mode][role]) return { color: keep(color, roles[mode][role]), role }
    if (plateKeys.has(key)) return { color: keep(color, roles[mode].plate), role: 'plate' }
    // plate ink is checked before the canvas, because on a light page the panel's
    // ink and the page canvas are frequently the same hex
    if (plateInkKeys.has(key)) return { color: keep(color, roles[mode].plateFg), role: 'plateFg' }
    if (key === canvasKey) return { color: keep(color, roles[mode].canvas), role: 'canvas' }
    if (chromaOf(color) >= 0.14) return resolveDetailed(color, 'foreground')
    return resolveDetailed(color, kindOfVariable(name))
  }

  const resolveVariable = (name, color) => resolveVariableDetailed(name, color).color

  /**
   * Should a translucent text colour keep its transparency?
   *
   * A site paints `.zen-banner p` as its panel ink at 72%. On a theme whose
   * panel ink is bright that is still plenty readable. On Solarized, whose ink
   * for that surface only clears 4.7:1 when solid, the 28% of background
   * bleeding through drops it to 2.9:1.
   *
   * The backdrop has to be the one the colour is *for* — a plate ink is judged
   * against the plate, not against the canvas it never sits on.
   */
  const ROLE_BACKDROP = {
    text: 'canvas',
    muted: 'canvas',
    border: 'canvas',
    borderStrong: 'canvas',
    canvas: 'canvas',
    surface: 'canvas',
    surfaceAlt: 'canvas',
    accent: 'canvas',
    highlight: 'canvas',
    positive: 'canvas',
    warning: 'canvas',
    danger: 'canvas',
    accentFg: 'accent',
    highlightFg: 'highlight',
    plate: 'plate',
    plateFg: 'plate',
    codeBg: 'plate',
    codeFg: 'codeBg',
    codeKeyword: 'codeBg',
    codeFunction: 'codeBg',
    codeNumber: 'codeBg',
    codeMuted: 'codeBg',
  }

  /**
   * Body text can land on the page canvas *or* on a dark band, and the mapping
   * cannot tell which from the colour alone. So a text-role transparency has to
   * survive both, or it is not safe to keep.
   */
  const TEXT_ROLES = new Set(['text', 'muted'])
  const keepTranslucency = (role, mapped, alpha) => {
    const backdrops = [roles[mode][ROLE_BACKDROP[role] ?? 'canvas']]
    if (TEXT_ROLES.has(role)) backdrops.push(roles[mode].plate)
    return backdrops.every((backdrop) => {
      const composed = composite(rgba(mapped, alpha), backdrop)
      return contrast(composed, backdrop) >= 4.5
    })
  }

  return {
    resolve,
    resolveVariable,
    resolveDetailed,
    resolveVariableDetailed,
    keepTranslucency,
    size: table.size,
    kindOf,
    kindOfVariable,
  }
}

/** Rewrite every colour token inside an arbitrary CSS value. */
export function remapValue(value, mapping, kind = 'foreground') {
  let changed = false
  const output = value.replace(COLOR_TOKEN, (token) => {
    const parsed = parseColor(token)
    if (!parsed) return token
    const { color: mapped, role } = mapping.resolveDetailed(token, kind)
    const differs = toHex(token) !== toHex(mapped)
    // a translucent text colour that would fall under AA on the surface it is
    // actually for goes opaque instead — see keepTranslucency
    const keepAlpha =
      parsed.a >= 1 ||
      kind !== 'foreground' ||
      mapping.keepTranslucency(role, mapped, Number(parsed.a.toFixed(3)))
    if (!differs && keepAlpha) return token
    changed = true
    return keepAlpha ? rgba(mapped, Number(parsed.a.toFixed(3))) : mapped
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
    const { color: mapped, role } = mapping.resolveVariableDetailed(name, color)
    if (toHex(mapped) === toHex(color)) continue
    const source = parseColor(color)
    const kind = mapping.kindOfVariable(name)
    // a translucent text token goes opaque when the theme cannot carry it; a
    // background wash keeps its transparency either way
    const translucent =
      source.a < 1 && (kind !== 'foreground' || mapping.keepTranslucency(role, mapped, Number(source.a.toFixed(3))))
    const value = translucent ? rgba(mapped, Number(source.a.toFixed(3))) : mapped
    out.push(`${selector}{${name}:${value} !important}`)
  }

  for (const { selector, prop, value } of site.declarations ?? []) {
    if (out.length >= limit) break
    const mapped = remapValue(value, mapping, mapping.kindOf(prop))
    if (mapped) out.push(`${selector}{${prop}:${mapped} !important}`)
  }

  return out.join('\n')
}

export { COLOR_TOKEN, dedupe }
