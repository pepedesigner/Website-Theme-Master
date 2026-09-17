/**
 * Studio logic.
 *
 * The studio owns no styling engine of its own — it picks a theme, posts a
 * config into the preview iframe, and the injected engine does the work. What
 * comes back is the finished stylesheet, which is what the export buttons save.
 */
import { DETAIL_DEFAULTS, DETAIL_OPTIONS, FONT_CHOICES } from '/engine/details.mjs'

const STORAGE_KEY = 'wdt:config'

const state = {
  kind: 'local',
  fixture: '',
  library: [],
  themeId: 'sandbase',
  roles: null,
  mode: 'light',
  strength: 1,
  details: { ...DETAIL_DEFAULTS },
  lastCss: '',
  ready: false,
}

const el = (id) => document.getElementById(id)
const preview = el('preview')
const curtain = el('curtain')
const status = el('status')

/* --------------------------------------------------------------- helpers */

function setStatus(text, tone = '') {
  status.textContent = text
  status.dataset.tone = tone
}

function download(name, text, type = 'text/css') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function fillSelect(id, choices, value, onChange) {
  const select = el(id)
  select.innerHTML = ''
  for (const [optionValue, label] of choices) {
    const option = document.createElement('option')
    option.value = String(optionValue)
    option.textContent = label
    option.selected = String(optionValue) === String(value)
    select.appendChild(option)
  }
  select.addEventListener('change', () => onChange(select.value))
  return select
}

/* ------------------------------------------------------------ theme list */

function swatches(theme) {
  const colors = theme.roles[state.mode]
  return ['canvas', 'surface', 'accent', 'highlight', 'text']
    .map((role) => `<i style="background:${colors[role]}"></i>`)
    .join('')
}

function renderLibrary() {
  const query = el('theme-filter').value.trim().toLowerCase()
  el('themes').innerHTML = state.library
    .map(
      (theme) => `
      <button type="button" class="theme" data-id="${theme.id}"
        aria-pressed="${theme.id === state.themeId}" ${query && !theme.label.toLowerCase().includes(query) ? 'hidden' : ''}>
        <span class="name">${theme.label}</span>
        <span class="sw">${swatches(theme)}</span>
      </button>`,
    )
    .join('')
}

async function loadTheme(id) {
  const response = await fetch(`/themes/${id}.json`)
  const theme = await response.json()
  state.themeId = id
  state.roles = theme.roles
  renderLibrary()
  apply()
}

async function loadLibrary() {
  state.library = await (await fetch('/themes/index.json')).json()
  const full = await Promise.all(
    state.library.map(async (theme) => ({
      ...theme,
      ...(await (await fetch(`/themes/${theme.id}.json`)).json()),
    })),
  )
  state.library = full
  await loadTheme(state.themeId)
}

/* -------------------------------------------------------------- applying */

function config() {
  return {
    themeId: state.themeId,
    roles: state.roles,
    mode: state.mode,
    strength: state.strength,
    details: state.details,
  }
}

function apply(options = {}) {
  if (!state.ready || !state.roles) return
  const payload = { ...config(), ...options }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode */
  }
  preview.contentWindow?.postMessage({ type: 'wdt:apply', config: payload }, '*')
  el('mapping-pill').textContent = 'working…'
}

/* ---------------------------------------------------------------- target */

function previewUrl() {
  const value = el('target-input').value.trim()
  if (state.kind === 'url') return `/preview?url=${encodeURIComponent(value)}`
  // no leading slash: a leading slash means an absolute path on disk, which is
  // how the rewritten asset URLs address themselves
  return `/preview?dir=${encodeURIComponent(value)}&file=index.html`
}

function loadTarget() {
  state.ready = false
  curtain.hidden = false
  curtain.firstElementChild.textContent = 'Loading site…'
  el('stage-title').textContent =
    state.kind === 'url' ? el('target-input').value.trim() : el('target-input').value.trim()
  preview.src = previewUrl()
}

/* -------------------------------------------------------------- controls */

function setMode(mode) {
  state.mode = mode
  for (const button of document.querySelectorAll('#mode button')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  }
  renderLibrary()
  apply({ reanalyze: true })
}

function setDetail(key, value) {
  state.details = { ...state.details, [key]: value }
  apply()
}

function wireControls() {
  document.querySelectorAll('#target-kind button').forEach((button) => {
    button.addEventListener('click', () => {
      state.kind = button.dataset.kind
      document.querySelectorAll('#target-kind button').forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button))
      })
      el('target-input').value = state.kind === 'url' ? 'https://' : state.fixture
      el('target-input').focus()
    })
  })

  el('target-form').addEventListener('submit', (event) => {
    event.preventDefault()
    loadTarget()
  })

  document.querySelectorAll('#mode button').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode))
  })

  el('reanalyze').addEventListener('click', () => apply({ reanalyze: true }))

  const strength = el('strength')
  strength.addEventListener('input', () => {
    state.strength = Number(strength.value) / 100
    el('strength-out').textContent = `${strength.value}%`
    apply()
  })

  el('radius').addEventListener('input', (event) => {
    const value = Number(event.target.value)
    // 0 is a real answer ("square everything"), so "keep" gets its own stop
    el('radius-out').textContent = value === 0 ? 'keep' : `${value}px`
    setDetail('radius', value === 0 ? null : value)
  })

  fillSelect('bodyFont', FONT_CHOICES, state.details.bodyFont, (value) => setDetail('bodyFont', value))
  fillSelect(
    'headingFont',
    [['original', 'Keep original'], ['body', 'Same as body'], ...FONT_CHOICES.slice(1)],
    state.details.headingFont,
    (value) => setDetail('headingFont', value),
  )
  fillSelect('typeScale', DETAIL_OPTIONS.typeScale, state.details.typeScale, (value) =>
    setDetail('typeScale', Number(value)),
  )
  fillSelect('lineHeight', DETAIL_OPTIONS.lineHeight, state.details.lineHeight, (value) =>
    setDetail('lineHeight', value === 'null' ? null : Number(value)),
  )
  fillSelect(
    'headingTracking',
    DETAIL_OPTIONS.headingTracking,
    state.details.headingTracking,
    (value) => setDetail('headingTracking', value === 'null' ? null : Number(value)),
  )
  fillSelect('elevation', DETAIL_OPTIONS.elevation, state.details.elevation, (value) =>
    setDetail('elevation', value),
  )
  fillSelect('borders', DETAIL_OPTIONS.borders, state.details.borders, (value) =>
    setDetail('borders', value),
  )
  fillSelect('motion', DETAIL_OPTIONS.motion, state.details.motion, (value) => setDetail('motion', value))

  el('theme-filter').addEventListener('input', renderLibrary)

  el('themes').addEventListener('click', (event) => {
    const button = event.target.closest('.theme')
    if (button) loadTheme(button.dataset.id)
  })

  el('export-css').addEventListener('click', () => {
    download(`theme-master-${state.themeId}-${state.mode}.css`, state.lastCss)
  })
  el('export-json').addEventListener('click', () => {
    download(`theme-master-${state.themeId}.json`, JSON.stringify(config(), null, 2), 'application/json')
  })
  el('copy-css').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.lastCss)
      setStatus('CSS copied to clipboard', 'good')
    } catch {
      setStatus('Clipboard blocked — use Download CSS', 'bad')
    }
  })
}

/* ------------------------------------------------------------- reporting */

function renderDetected(analysis) {
  const box = el('detected')
  const counts = analysis.counts ?? {}
  const row = (list, title) =>
    list?.length
      ? `<div><div class="stats">${title}</div><div class="swatch-row">${list
          .map((entry) => `<i style="background:${entry.color}" title="${entry.color}"></i>`)
          .join('')}</div></div>`
      : ''

  box.innerHTML =
    row(analysis.neutrals, 'neutrals') +
    row(analysis.chroma, 'accents') +
    row(analysis.plates, 'inverse panels') +
    `<div class="stats">canvas ${analysis.canvas}<br>` +
    `${counts.elements} elements · ${counts.declarations} colour rules<br>` +
    `${counts.neutrals} neutrals · ${counts.chroma} accents · ${counts.plates} plates<br>` +
    `targets: ${analysis.selectors.buttons} buttons · ${analysis.selectors.fields} fields · ` +
    `${analysis.selectors.surfaces} surfaces</div>`
}

window.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'wdt:ready') {
    state.ready = true
    if (data.themed) {
      curtain.hidden = true
    }
    apply()
    return
  }

  if (data.type === 'wdt:applied') {
    state.lastCss = data.css
    curtain.hidden = true
    const rows = data.css.split('\n').filter(Boolean).length
    el('mapping-pill').textContent = `${data.mapped} colours paired · ${rows} rules`
    setStatus(`Reskinned with ${state.themeId} · ${state.mode}`, 'good')
    if (data.analysis) renderDetected(data.analysis)
    return
  }

  if (data.type === 'wdt:error') {
    curtain.hidden = true
    setStatus(`Engine error: ${data.message}`, 'bad')
  }
})

/* ------------------------------------------------------------------ boot */

async function boot() {
  wireControls()
  setStatus('Loading studio…')
  try {
    const info = await (await fetch('/api/config')).json()
    state.fixture = info.fixture
    el('target-input').value = info.fixture
  } catch {
    setStatus('Could not reach the studio API', 'bad')
  }
  try {
    await loadLibrary()
  } catch (error) {
    setStatus(`Theme library failed: ${error.message}`, 'bad')
    return
  }
  loadTarget()
}

boot()
