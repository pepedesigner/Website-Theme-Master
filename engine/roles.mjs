/**
 * The role vocabulary.
 *
 * A reskin tool cannot know a site's design tokens, so instead of inventing
 * per-site mappings we reduce every theme to the same small set of roles, and
 * every analysed site to the same set. Colour transfer is then a question of
 * pairing one set with the other.
 */

/** Neutrals form a ramp — ordered by luminance, they carry the site's structure. */
export const NEUTRAL_ROLES = ['canvas', 'surface', 'surfaceAlt', 'border', 'borderStrong', 'muted', 'text']

/** Chromatic roles carry meaning and are paired by hue. */
export const CHROMA_ROLES = ['accent', 'highlight', 'positive', 'warning', 'danger']

/** Everything a theme must define, per mode. */
export const ALL_ROLES = [
  ...NEUTRAL_ROLES,
  ...CHROMA_ROLES,
  'accentFg',
  'highlightFg',
  'plate',
  'plateFg',
  'codeBg',
  'codeFg',
  'codeKeyword',
  'codeFunction',
  'codeNumber',
  'codeMuted',
]

export const ROLE_LABELS = {
  canvas: 'Canvas',
  surface: 'Surface',
  surfaceAlt: 'Surface alt',
  border: 'Border',
  borderStrong: 'Border strong',
  muted: 'Muted text',
  text: 'Text',
  accent: 'Accent',
  accentFg: 'On accent',
  highlight: 'Highlight',
  highlightFg: 'On highlight',
  positive: 'Positive',
  warning: 'Warning',
  danger: 'Danger',
  plate: 'Dark plate',
  plateFg: 'On plate',
  codeBg: 'Code surface',
  codeFg: 'Code text',
  codeKeyword: 'Code keyword',
  codeFunction: 'Code function',
  codeNumber: 'Code number',
  codeMuted: 'Code muted',
}

/**
 * Fallback theme — a complete, legible role set. Used as the base every theme is
 * layered onto, so a partial theme file (or an import that misses a token) still
 * produces a coherent result instead of holes.
 */
export const BASE_THEME = {
  light: {
    canvas: '#F2F0F3',
    surface: '#FFFFFF',
    surfaceAlt: '#E7E4EA',
    border: '#DBD8DF',
    borderStrong: '#0E0B1A',
    muted: '#5D5969',
    text: '#0E0B1A',
    accent: '#5A3AEB',
    accentFg: '#FFFFFF',
    highlight: '#D9FF43',
    highlightFg: '#0E0B1A',
    positive: '#356B12',
    warning: '#8A5A00',
    danger: '#AD2C1C',
    plate: '#0E0B1A',
    plateFg: '#F2F0F3',
    codeBg: '#0E0B1A',
    codeFg: '#F2F0F3',
    codeKeyword: '#C9B8FF',
    codeFunction: '#D9FF43',
    codeNumber: '#FFCF6B',
    codeMuted: '#A29EA9',
  },
  dark: {
    canvas: '#0E0B1A',
    surface: '#241D44',
    surfaceAlt: '#2E2656',
    border: '#332D4F',
    borderStrong: '#F2F0F3',
    muted: '#A29EA9',
    text: '#F2F0F3',
    accent: '#D9FF43',
    accentFg: '#0E0B1A',
    highlight: '#8B6FFF',
    highlightFg: '#0E0B1A',
    positive: '#D9FF43',
    warning: '#FFCF6B',
    danger: '#FF8A80',
    plate: '#1E1936',
    plateFg: '#F2F0F3',
    codeBg: '#3A3070',
    codeFg: '#F2F0F3',
    codeKeyword: '#C9B8FF',
    codeFunction: '#D9FF43',
    codeNumber: '#FFCF6B',
    codeMuted: '#B3AFC1',
  },
}

export const MODES = ['light', 'dark']
