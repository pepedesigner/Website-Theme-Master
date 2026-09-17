/**
 * Detail controls — everything that is not colour.
 *
 * These target the element kinds `analyze.mjs` collected (real buttons, real
 * fields, real cards) rather than guessing from class names, so a site gets its
 * corners rounded where corners exist instead of wherever a substring matched.
 */
import { rgba } from './color.mjs'

export const FONT_STACKS = {
  system: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  grotesk: '"Clash Grotesk", "Helvetica Neue", Helvetica, Arial, ui-sans-serif, sans-serif',
  humanist: 'Optima, Candara, "Segoe UI", "Gill Sans", Calibri, sans-serif',
  geometric: '"Century Gothic", Futura, "Avenir Next", "Trebuchet MS", sans-serif',
  serif: 'Georgia, "Iowan Old Style", Charter, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
}

export const FONT_CHOICES = [
  ['original', 'Keep original'],
  ['system', 'System UI'],
  ['grotesk', 'Grotesk'],
  ['humanist', 'Humanist'],
  ['geometric', 'Geometric'],
  ['serif', 'Serif'],
  ['mono', 'Mono'],
]

export const DETAIL_DEFAULTS = {
  bodyFont: 'original',
  headingFont: 'original',
  radius: null,
  elevation: 'original',
  typeScale: 1,
  lineHeight: null,
  headingTracking: null,
  motion: 'original',
  borders: 'original',
}

export const DETAIL_OPTIONS = {
  elevation: [
    ['original', 'Keep original'],
    ['none', 'Flat'],
    ['subtle', 'Subtle'],
    ['soft', 'Soft'],
    ['dramatic', 'Dramatic'],
  ],
  typeScale: [
    [0.9, '90%'],
    [1, '100%'],
    [1.1, '110%'],
    [1.2, '120%'],
  ],
  lineHeight: [
    [null, 'Keep original'],
    [1.4, 'Tight'],
    [1.5, 'Normal'],
    [1.65, 'Relaxed'],
    [1.8, 'Loose'],
  ],
  headingTracking: [
    [null, 'Keep original'],
    [-0.03, 'Tight'],
    [-0.015, 'Slightly tight'],
    [0, 'Neutral'],
    [0.02, 'Wide'],
  ],
  motion: [
    ['original', 'Keep original'],
    ['calm', 'Calm'],
    ['off', 'Off'],
  ],
  borders: [
    ['original', 'Keep original'],
    ['soften', 'Soften'],
    ['none', 'Remove'],
  ],
}

const ICON_EXCLUDES =
  ':not(code):not(pre):not(kbd):not(samp):not(svg):not([class*="icon" i]):not([class*="fa-" i]):not([class*="fa_" i]):not(.material-icons):not(.material-symbols-outlined)'

const GENERIC_BUTTONS =
  'button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]'

const GENERIC_FIELDS =
  'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select'

const GENERIC_SURFACES =
  '[class*="card" i], [class*="panel" i], [class*="modal" i], [class*="dialog" i], [class*="dropdown" i], [class*="popover" i]'

/** Split a comma list of selectors and rebuild it, so lists can be merged. */
function selectorList(groups, limit = 80) {
  const out = []
  for (const group of groups) {
    if (!group) continue
    for (const part of String(group).split(',')) {
      const trimmed = part.trim()
      if (!trimmed || out.includes(trimmed)) continue
      out.push(trimmed)
      if (out.length >= limit) return out.join(',')
    }
  }
  return out.join(',')
}

function elevationShadow(style, ink) {
  if (style === 'none') return 'none'
  if (style === 'subtle') return `0 2px 6px -2px ${rgba(ink, 0.16)}, 0 1px 2px ${rgba(ink, 0.08)}`
  if (style === 'soft') return `0 12px 32px -14px ${rgba(ink, 0.3)}, 0 2px 8px -4px ${rgba(ink, 0.16)}`
  if (style === 'dramatic') return `0 28px 64px -20px ${rgba(ink, 0.45)}, 0 6px 18px -8px ${rgba(ink, 0.24)}`
  return null
}

/**
 * Build the detail half of the override stylesheet.
 * Returns '' when every control is left on "keep original".
 */
export function buildDetailCss(site, roles, details) {
  const theme = roles
  const selectors = site.selectors ?? {}
  const rules = []

  const buttons = selectorList([selectors.buttons?.join(','), GENERIC_BUTTONS])
  const fields = selectorList([selectors.fields?.join(','), GENERIC_FIELDS])
  const surfaces = selectorList([selectors.surfaces?.join(','), GENERIC_SURFACES])

  /* ------------------------------------------------------------- fonts */

  const bodyStack = FONT_STACKS[details.bodyFont]
  if (bodyStack) {
    rules.push(`body, body *${ICON_EXCLUDES}{font-family:${bodyStack} !important;font-feature-settings:normal !important}`)
  }

  const headingStack =
    details.headingFont === 'body' ? bodyStack : FONT_STACKS[details.headingFont]
  if (headingStack) {
    rules.push(
      `h1, h2, h3, h4, h5, h6, [role="heading"], .h1, .h2, .h3, .title, .heading`
        + `{font-family:${headingStack} !important}`,
    )
  }

  /* ------------------------------------------------------------ radius */

  if (details.radius !== null && details.radius !== undefined) {
    const r = Number(details.radius)
    rules.push(`${buttons}{border-radius:${r}px !important}`)
    rules.push(`${fields}{border-radius:${Math.min(r, 12)}px !important}`)
    rules.push(`${surfaces}{border-radius:${Math.round(r * 1.4)}px !important}`)
  }

  /* --------------------------------------------------------- elevation */

  const shadow = elevationShadow(details.elevation, theme.text)
  if (shadow) {
    const shadowed = selectorList([selectors.shadowed?.join(','), buttons, surfaces], 120)
    if (shadowed) rules.push(`${shadowed}{box-shadow:${shadow} !important}`)
  }

  /* ------------------------------------------------------------ borders */

  if (details.borders === 'soften') {
    const target = selectorList([surfaces, buttons, fields], 120)
    if (target) rules.push(`${target}{border-color:${theme.border} !important}`)
  } else if (details.borders === 'none') {
    const target = selectorList([surfaces, buttons], 120)
    if (target) rules.push(`${target}{border-color:transparent !important;border-width:0 !important}`)
  }

  /* -------------------------------------------------------------- type */

  if (details.typeScale && details.typeScale !== 1) {
    rules.push(`html{font-size:${(16 * details.typeScale).toFixed(2)}px !important}`)
  }

  if (details.lineHeight) {
    rules.push(
      `body, p, li, dd, dt, blockquote, figcaption, td, th, .prose, article`
        + `{line-height:${details.lineHeight} !important}`,
    )
  }

  if (details.headingTracking !== null && details.headingTracking !== undefined) {
    rules.push(
      `h1, h2, h3, h4, h5, h6, [role="heading"]`
        + `{letter-spacing:${details.headingTracking}em !important}`,
    )
  }

  /* ------------------------------------------------------------ motion */

  if (details.motion === 'off') {
    rules.push(
      '*, *::before, *::after{animation:none !important;transition:none !important}'
        + 'html{scroll-behavior:auto !important}',
    )
  } else if (details.motion === 'calm') {
    rules.push(
      '*, *::before, *::after'
        + `{transition-duration:.5s !important;transition-timing-function:cubic-bezier(.4,0,.2,1) !important}`
        + 'html{scroll-behavior:smooth !important}',
    )
  }

  return rules.join('\n')
}

/** Human-readable summary of which detail controls are active. */
export function activeDetails(details) {
  const active = []
  if (FONT_STACKS[details.bodyFont]) active.push(`body font ${details.bodyFont}`)
  if (FONT_STACKS[details.headingFont] || details.headingFont === 'body') active.push(`headings ${details.headingFont}`)
  if (details.radius !== null && details.radius !== undefined) active.push(`radius ${details.radius}px`)
  if (details.elevation !== 'original') active.push(`elevation ${details.elevation}`)
  if (details.typeScale !== 1) active.push(`type ${Math.round(details.typeScale * 100)}%`)
  if (details.lineHeight) active.push(`line-height ${details.lineHeight}`)
  if (details.headingTracking !== null && details.headingTracking !== undefined) {
    active.push(`tracking ${details.headingTracking}em`)
  }
  if (details.motion !== 'original') active.push(`motion ${details.motion}`)
  if (details.borders !== 'original') active.push(`borders ${details.borders}`)
  return active
}
