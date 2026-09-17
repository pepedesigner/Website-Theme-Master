/**
 * Site analysis — runs inside the page being reskinned.
 *
 * The tool cannot know a site's design tokens, so it reconstructs them:
 *   1. what does the page actually paint (computed styles, weighted by area)
 *   2. what colours does its CSS declare (so we can override them by selector)
 *   3. which elements are buttons / fields / surfaces (so detail controls have
 *      something precise to aim at)
 *
 * Step 1 gives us the palette to remap; step 2 gives us the hooks to apply it.
 */
import { chroma, composite, contrast, parseColor, toHex, luminance } from './color.mjs'

const COLOR_PROPS = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'box-shadow',
  'text-shadow',
  'background',
  'border',
  'outline',
]

const MAX_ELEMENTS = 6000
const MAX_DECLARATIONS = 40000
const MAX_SELECTORS = 60

/** The id of the sheet this engine writes; the analyser must never read it back. */
export const OVERRIDE_STYLE_ID = 'wdt-overrides'

/** A short, stable-enough selector for an element. */
function selectorFor(element) {
  const tag = element.tagName.toLowerCase()
  if (tag === 'html' || tag === 'body') return tag
  const classes = [...(element.classList ?? [])]
    .filter((name) => name.length < 40 && !/^\d/.test(name))
    .slice(0, 2)
  const id = element.id && element.id.length < 40 && !/^\d/.test(element.id) ? `#${element.id}` : ''
  if (id) return `${tag}${id}`
  return tag + classes.map((name) => `.${name}`).join('')
}

function stripePseudo(selector) {
  return selector.replace(/::?(before|after|first-line|first-letter|placeholder|marker|selection|backdrop)/g, '')
}

function addWeight(map, color, weight) {
  const key = toHex(color)
  const entry = map.get(key)
  if (entry) entry.weight += weight
  else map.set(key, { color: key, weight })
}

/**
 * Walk every stylesheet we are allowed to read.
 *
 * `@media` / `@supports` blocks are descended into so responsive and
 * conditional rules are not missed. Cross-origin sheets throw on `cssRules` and
 * are skipped — which is exactly why live-URL mode proxies CSS through our own
 * origin first.
 */
function collectRules(doc, visit) {
  const walk = (rules) => {
    for (const rule of rules) {
      // a style rule can be visited *and* have nested children in modern CSS
      if (rule.selectorText && rule.style) visit(rule)
      if (rule.cssRules && rule.cssRules.length) {
        try {
          walk(rule.cssRules)
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (const sheet of doc.styleSheets) {
    // our own override sheet is not part of the site. Reading it back would make
    // every re-analysis describe the theme we just applied instead of the site,
    // and the next theme would be mapped from the previous one.
    if (sheet.ownerNode?.id === OVERRIDE_STYLE_ID) continue
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    try {
      walk(rules)
    } catch {
      /* ignore */
    }
  }
}

export function analyzeSite(doc = document, win = window) {
  const rootStyle = win.getComputedStyle(doc.documentElement)
  const bodyStyle = doc.body ? win.getComputedStyle(doc.body) : null

  // the page's own base colour: whichever of html/body is actually opaque
  let canvas = null
  for (const style of [bodyStyle, rootStyle]) {
    if (!style) continue
    const parsed = parseColor(style.backgroundColor)
    if (parsed && parsed.a > 0.5) {
      canvas = toHex(style.backgroundColor)
      break
    }
  }
  const canvasDeclared = canvas !== null
  canvas ??= '#ffffff'

  const backgrounds = new Map()
  const foregrounds = new Map()
  const borders = new Map()
  // (surface, ink) pairs, so inverse panels can be spotted once the canvas is known
  const pairs = []

  const buttons = new Set()
  const fields = new Set()
  const surfaces = new Set()
  const shadowed = new Set()

  const elements = doc.querySelectorAll('*')
  const limit = Math.min(elements.length, MAX_ELEMENTS)

  for (let index = 0; index < limit; index += 1) {
    const element = elements[index]
    const tag = element.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') continue

    let style
    try {
      style = win.getComputedStyle(element)
    } catch {
      continue
    }

    const rect = element.getBoundingClientRect()
    const area = Math.max(rect.width * rect.height, 0)
    // sqrt keeps one full-bleed hero from drowning out every control on the page
    const areaWeight = Math.sqrt(area)

    const bg = parseColor(style.backgroundColor)
    if (bg && bg.a > 0.05) {
      const flatBackground = composite(style.backgroundColor, canvas)
      addWeight(backgrounds, flatBackground, areaWeight + 1)

      const ink = parseColor(style.color)
      if (ink && ink.a > 0.5 && area > 20000 && pairs.length < 2000) {
        pairs.push({
          bg: flatBackground,
          fg: composite(style.color, flatBackground),
          area,
        })
      }
    }

    const fg = parseColor(style.color)
    if (fg && fg.a > 0.05 && element.childElementCount === 0) {
      const text = (element.textContent ?? '').trim().length
      addWeight(foregrounds, composite(style.color, canvas), Math.min(text, 240) + 1)
    }

    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = Number.parseFloat(style[`border${side}Width`]) || 0
      if (width <= 0) continue
      const color = parseColor(style[`border${side}Color`])
      if (!color || color.a < 0.05) continue
      addWeight(borders, composite(style[`border${side}Color`], canvas), (rect.height + rect.width) / 2 + 1)
      break
    }

    // element kinds the detail controls need to target
    const classText = typeof element.className === 'string' ? element.className : ''
    const isButton =
      tag === 'button' ||
      (tag === 'input' && ['submit', 'button', 'reset'].includes(element.type)) ||
      element.getAttribute('role') === 'button' ||
      /btn|button|cta/i.test(classText)
    if (isButton) buttons.add(selectorFor(element))

    if (tag === 'input' || tag === 'textarea' || tag === 'select') fields.add(selectorFor(element))

    const hasRadius = (Number.parseFloat(style.borderTopLeftRadius) || 0) > 1
    const hasBorder = (Number.parseFloat(style.borderTopWidth) || 0) > 0
    if (area > 4000 && (hasRadius || hasBorder) && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      surfaces.add(selectorFor(element))
    }

    if (style.boxShadow && style.boxShadow !== 'none') shadowed.add(selectorFor(element))
  }

  /* -------------------------------------------------- declared colours */

  const declarations = []
  const seen = new Set()
  collectRules(doc, (rule) => {
    if (declarations.length >= MAX_DECLARATIONS) return
    const selector = rule.selectorText
    for (const prop of COLOR_PROPS) {
      const value = rule.style.getPropertyValue(prop)?.trim()
      // keep only values that could carry a colour
      if (!value || !/#|rgb|hsl|color\(|transparent/i.test(value)) continue
      const key = `${selector}|${prop}`
      if (seen.has(key)) continue
      seen.add(key)
      declarations.push({ selector, prop, value })
    }
  })

  /* ------------------------------------------- custom properties */

  const customProps = []
  const seenVars = new Set()
  collectRules(doc, (rule) => {
    for (let index = 0; index < rule.style.length; index += 1) {
      const prop = rule.style[index]
      if (!prop.startsWith('--')) continue
      const key = `${rule.selectorText}|${prop}`
      if (seenVars.has(key)) continue

      const declared = rule.style.getPropertyValue(prop).trim()
      let resolved = parseColor(declared) ? toHex(declared) : null

      // the value may be another var, or only meaningful on a specific element
      if (!resolved) {
        try {
          const target = doc.querySelector(stripePseudo(rule.selectorText)) ?? doc.documentElement
          const computed = target ? win.getComputedStyle(target).getPropertyValue(prop).trim() : ''
          if (parseColor(computed)) resolved = toHex(computed)
        } catch {
          /* an unqueryable selector simply stays unresolved */
        }
      }
      if (!resolved) continue

      seenVars.add(key)
      customProps.push({ selector: rule.selectorText, name: prop, color: resolved })
    }
  })

  const sortByWeight = (map) =>
    [...map.values()].sort((a, b) => b.weight - a.weight)

  const backgroundList = sortByWeight(backgrounds).slice(0, 60)
  const foregroundList = sortByWeight(foregrounds).slice(0, 60)
  const borderList = sortByWeight(borders).slice(0, 30)

  // body/html are the canvas by definition. Only when neither paints one do we
  // fall back to whichever surface covers the most page — otherwise a big dark
  // terminal or a full-bleed band hijacks the role and inverts the whole site.
  if (!canvasDeclared) {
    const dominant = backgroundList[0]
    if (dominant) canvas = dominant.color
  }

  const neutrals = new Map()
  const chromaMap = new Map()
  // neutrals are also kept per role, because the same hex routinely serves
  // different jobs: sandcode paints #f2f0f3 as the page canvas *and* as the ink
  // inside its dark terminal. Resolving by property kind is what lets both be
  // right at once.
  const neutralByKind = { background: new Map(), text: new Map(), border: new Map() }
  const classify = (list, kind) => {
    for (const entry of list) {
      if (chroma(entry.color) < 0.14) {
        addWeight(neutrals, entry.color, entry.weight)
        addWeight(neutralByKind[kind], entry.color, entry.weight)
      } else {
        const existing = chromaMap.get(entry.color)
        if (existing) existing.weight += entry.weight
        else chromaMap.set(entry.color, { color: entry.color, weight: entry.weight, kind })
      }
    }
  }
  classify(backgroundList, 'background')
  classify(foregroundList, 'text')
  classify(borderList, 'border')

  /**
   * Inverse panels: surfaces whose lightness polarity is the opposite of the
   * page's own, carrying readable ink. That is a dark terminal on a light site,
   * or a light card on a dark one — and they need their own role, because a
   * plain brightness ramp would turn the dark panel into body text.
   */
  const canvasIsLight = luminance(canvas) > 0.5
  const plateMap = new Map()
  const plateInkMap = new Map()
  for (const pair of pairs) {
    const inverse = luminance(pair.bg) > 0.5 !== canvasIsLight
    if (!inverse || contrast(pair.bg, pair.fg) < 4) continue
    addWeight(plateMap, pair.bg, Math.sqrt(pair.area))
    addWeight(plateInkMap, pair.fg, Math.sqrt(pair.area))
  }
  const plates = sortByWeight(plateMap).slice(0, 8)
  const plateInk = sortByWeight(plateInkMap).slice(0, 8)

  return {
    canvas,
    neutrals: [...neutrals.values()],
    backgrounds: sortByWeight(neutralByKind.background),
    foregrounds: sortByWeight(neutralByKind.text),
    borders: sortByWeight(neutralByKind.border),
    chroma: [...chromaMap.values()].sort((a, b) => b.weight - a.weight),
    plates,
    plateInk,
    declarations,
    customProps,
    selectors: {
      buttons: [...buttons].slice(0, MAX_SELECTORS),
      fields: [...fields].slice(0, MAX_SELECTORS),
      surfaces: [...surfaces].slice(0, MAX_SELECTORS),
      shadowed: [...shadowed].slice(0, MAX_SELECTORS),
    },
    counts: {
      elements: limit,
      declarations: declarations.length,
      neutrals: neutrals.size,
      chroma: chromaMap.size,
      plates: plates.length,
      readSheets: doc.styleSheets.length,
    },
  }
}

export function isLightCanvas(site) {
  return luminance(site.canvas) > 0.4
}
