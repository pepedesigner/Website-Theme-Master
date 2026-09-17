/**
 * Runs inside the previewed page.
 *
 * The studio never touches the page directly — it posts a config, this script
 * analyses the document, builds the override stylesheet and drops it into a
 * single <style> element. Keeping the engine on this side means the analysis is
 * always looking at the real, fully-laid-out page.
 */
import { analyzeSite, OVERRIDE_STYLE_ID } from '/engine/analyze.mjs'
import { buildColorCss, buildMapping } from '/engine/remap.mjs'
import { buildDetailCss, DETAIL_DEFAULTS } from '/engine/details.mjs'

const STORAGE_KEY = 'wdt:config'
const STYLE_ID = OVERRIDE_STYLE_ID

let analysis = null
let styleElement = null
let lastConfig = null

function ensureStyleElement() {
  if (styleElement && styleElement.isConnected) return styleElement
  styleElement = document.getElementById(STYLE_ID)
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = STYLE_ID
    document.head.appendChild(styleElement)
  }
  return styleElement
}

/**
 * Analyse the site as it was written, not as we have painted it.
 *
 * Our own sheet has to come off while measuring — otherwise every re-analysis
 * describes the theme currently applied, and picking a second theme maps the
 * first one. Stack that twice and the palette walks away entirely.
 */
function analyze(force = false) {
  if (analysis && !force) return analysis
  const existing = document.getElementById(STYLE_ID)
  const wasDisabled = existing?.disabled ?? false
  if (existing) existing.disabled = true
  // force a style recalculation so the disabled sheet is actually undone
  void document.documentElement.offsetHeight
  analysis = analyzeSite(document, window)
  if (existing) existing.disabled = wasDisabled
  return analysis
}

function apply(config) {
  if (!config?.roles?.[config.mode]) return
  lastConfig = config

  const site = analyze(Boolean(config.reanalyze))
  const mapping = buildMapping(site, config.roles, config.mode, { strength: config.strength ?? 1 })
  const colorCss = buildColorCss(site, mapping)

  const details = { ...DETAIL_DEFAULTS, ...(config.details ?? {}) }
  // "same as body" is resolved here so the engine only deals in real stacks
  const detailCss = buildDetailCss(site, config.roles[config.mode], details)
  const css = `${colorCss}\n${detailCss}`

  ensureStyleElement().textContent = css
  document.documentElement.dataset.wdtTheme = config.themeId ?? ''
  document.documentElement.dataset.wdtMode = config.mode

  // debugging hook: everything the last pass decided, inspectable from devtools
  window.__wdt = { site, mapping, config, css }

  post({
    type: 'wdt:applied',
    themeId: config.themeId,
    mode: config.mode,
    css,
    mapped: mapping.size,
    resolved: colorCss.split('\n').length,
    analysis: {
      canvas: site.canvas,
      counts: site.counts,
      neutrals: site.neutrals.slice(0, 14),
      chroma: site.chroma.slice(0, 10),
      plates: site.plates,
      selectors: {
        buttons: site.selectors.buttons.length,
        fields: site.selectors.fields.length,
        surfaces: site.selectors.surfaces.length,
        shadowed: site.selectors.shadowed.length,
      },
    },
  })
}

function post(message) {
  try {
    parent.postMessage(message, '*')
  } catch {
    /* not embedded */
  }
}

window.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'wdt:apply') {
    try {
      apply(data.config)
    } catch (error) {
      post({ type: 'wdt:error', message: String(error && error.message ? error.message : error) })
    }
  }
  if (data.type === 'wdt:request-analysis') {
    try {
      apply({ ...(lastConfig ?? {}), reanalyze: true })
    } catch (error) {
      post({ type: 'wdt:error', message: String(error && error.message ? error.message : error) })
    }
  }
})

function boot() {
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    } catch {
      return null
    }
  })()
  if (stored) {
    try {
      apply(stored)
    } catch {
      /* a stale config should never take the page down */
    }
  }
  post({ type: 'wdt:ready', themed: Boolean(stored) })
}

if (document.readyState === 'complete') boot()
else window.addEventListener('load', boot, { once: true })

// a page that keeps changing (SPA routing, lazy sections) invalidates the
// palette, so remember it needs a fresh pass
let mutationTimer = 0
const observer = new MutationObserver(() => {
  clearTimeout(mutationTimer)
  mutationTimer = setTimeout(() => {
    if (analysis) analysis = null
  }, 1200)
})
try {
  observer.observe(document.documentElement, { childList: true, subtree: true })
} catch {
  /* ignore */
}
