/**
 * Colour primitives shared by the browser-injected engine and the Node tools.
 * Everything here is isomorphic: no DOM, no Node APIs.
 */

const NAMED = {
  transparent: 'rgba(0,0,0,0)',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  purple: '#800080',
  yellow: '#ffff00',
  orange: '#ffa500',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gold: '#ffd700',
  indigo: '#4b0082',
  violet: '#ee82ee',
  crimson: '#dc143c',
  salmon: '#fa8072',
  coral: '#ff7f50',
  khaki: '#f0e68c',
  plum: '#dda0dd',
  orchid: '#da70d6',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  snow: '#fffafa',
  azure: '#f0ffff',
  lavender: '#e6e6fa',
  linen: '#faf0e6',
  seashell: '#fff5ee',
  whitesmoke: '#f5f5f5',
  gainsboro: '#dcdcdc',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  dimgray: '#696969',
  dimgrey: '#696969',
  slategray: '#708090',
  slategrey: '#708090',
  lightslategray: '#778899',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  dodgerblue: '#1e90ff',
  skyblue: '#87ceeb',
  lightblue: '#add8e6',
  midnightblue: '#191970',
  forestgreen: '#228b22',
  seagreen: '#2e8b57',
  darkgreen: '#006400',
  limegreen: '#32cd32',
  springgreen: '#00ff7f',
  mediumseagreen: '#3cb371',
  darkred: '#8b0000',
  firebrick: '#b22222',
  indianred: '#cd5c5c',
  darkorange: '#ff8c00',
  goldenrod: '#daa520',
  darkgoldenrod: '#b8860b',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  peru: '#cd853f',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkviolet: '#9400d3',
  blueviolet: '#8a2be2',
  mediumpurple: '#9370db',
  slateblue: '#6a5acd',
  darkslateblue: '#483d8b',
  hotpink: '#ff69b4',
  deeppink: '#ff1493',
  palevioletred: '#db7093',
  lightpink: '#ffb6c1',
  tomato: '#ff6347',
  orangered: '#ff4500',
  darkseagreen: '#8fbc8f',
  cadetblue: '#5f9ea0',
  lightseagreen: '#20b2aa',
  mediumaquamarine: '#66cdaa',
  turquoise: '#40e0d0',
  mediumturquoise: '#48d1cc',
  darkturquoise: '#00ced1',
  paleturquoise: '#afeeee',
  powderblue: '#b0e0e6',
  thistle: '#d8bfd8',
  wheat: '#f5deb3',
  burlywood: '#deb887',
  rosybrown: '#bc8f8f',
  mistyrose: '#ffe4e1',
  oldlace: '#fdf5e6',
  antiquewhite: '#faebd7',
  papayawhip: '#ffefd5',
  blanchedalmond: '#ffebcd',
  bisque: '#ffe4c4',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  peachpuff: '#ffdab9',
  cornsilk: '#fff8dc',
  lemonchiffon: '#fffacd',
  lightyellow: '#ffffe0',
  lightgoldenrodyellow: '#fafad2',
  lightcyan: '#e0ffff',
  palegoldenrod: '#eee8aa',
  honeydew: '#f0fff0',
  mintcream: '#f5fffa',
  aliceblue: '#f0f8ff',
  ghostwhite: '#f8f8ff',
  floralwhite: '#fffaf0',
}

const RE_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RE_RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
const RE_HSL = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i

function channel(value) {
  const number = Number.parseFloat(value)
  return Math.max(0, Math.min(255, Math.round(number)))
}

function alpha(value) {
  if (value === undefined) return 1
  const text = String(value).trim()
  return text.endsWith('%')
    ? Math.max(0, Math.min(1, Number.parseFloat(text) / 100))
    : Math.max(0, Math.min(1, Number.parseFloat(text)))
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360
  const sat = s / 100
  const light = l / 100
  if (sat === 0) {
    const v = Math.round(light * 255)
    return { r: v, g: v, b: v }
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const toChannel = (t) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return {
    r: Math.round(toChannel(hue + 1 / 3) * 255),
    g: Math.round(toChannel(hue) * 255),
    b: Math.round(toChannel(hue - 1 / 3) * 255),
  }
}

/** Parse any CSS colour the browser might hand us. Returns null when unknown. */
export function parseColor(input) {
  if (input === null || input === undefined) return null
  const text = String(input).trim().toLowerCase()
  if (!text) return null

  if (RE_HEX.test(text)) {
    let body = text.slice(1)
    if (body.length === 3 || body.length === 4) {
      body = body.split('').map((c) => c + c).join('')
    }
    const int = Number.parseInt(body.slice(0, 6), 16)
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
      a: body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1,
    }
  }

  const rgb = text.match(RE_RGB)
  if (rgb) return { r: channel(rgb[1]), g: channel(rgb[2]), b: channel(rgb[3]), a: alpha(rgb[4]) }

  const hsl = text.match(RE_HSL)
  if (hsl) {
    const { r, g, b } = hslToRgb(Number.parseFloat(hsl[1]), Number.parseFloat(hsl[2]), Number.parseFloat(hsl[3]))
    return { r, g, b, a: alpha(hsl[4]) }
  }

  if (NAMED[text]) return parseColor(NAMED[text])
  return null
}

/**
 * Serialise to `#rrggbb`. Accepts either a CSS string or an already-parsed
 * {r,g,b} — the arithmetic helpers below build objects, so both have to work.
 */
export function toHex(color) {
  const parsed =
    color !== null && typeof color === 'object' ? color : parseColor(color)
  const { r = 0, g = 0, b = 0 } = parsed ?? {}
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`
}

/** `#rrggbb` plus a separate alpha, so the engine can keep transparency intact. */
export function toCss(color) {
  const parsed = parseColor(color)
  if (!parsed) return String(color)
  if (parsed.a >= 1) return toHex(parsed)
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${Number(parsed.a.toFixed(3))})`
}

export function rgba(color, a) {
  const parsed = parseColor(color)
  if (!parsed) return String(color)
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${a})`
}

export function withAlpha(color, a) {
  const parsed = parseColor(color)
  if (!parsed) return String(color)
  return { ...parsed, a }
}

export function mix(a, b, t) {
  const left = parseColor(a)
  const right = parseColor(b)
  if (!left || !right) return toHex(a)
  const at = Math.max(0, Math.min(1, t))
  return toHex({
    r: left.r + (right.r - left.r) * at,
    g: left.g + (right.g - left.g) * at,
    b: left.b + (right.b - left.b) * at,
  })
}

/** Flatten a translucent colour onto a solid backdrop. */
export function composite(color, backdrop) {
  const fg = parseColor(color)
  if (!fg) return toHex(backdrop ?? '#000000')
  if (fg.a >= 1) return toHex(fg)
  const bg = parseColor(backdrop ?? '#000000') ?? { r: 0, g: 0, b: 0 }
  return toHex({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  })
}

export function luminance(color) {
  const parsed = parseColor(color)
  if (!parsed) return 1
  const ch = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(parsed.r) + 0.7152 * ch(parsed.g) + 0.0722 * ch(parsed.b)
}

export function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** HSL, used to sort chromatic colours by hue for rank pairing. */
export function toHsl(color) {
  const { r, g, b, a } = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 }
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l, a }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s, l, a }
}

/** A colour's "colourfulness", 0 for pure greys. */
export function chroma(color) {
  const { s, l } = toHsl(color)
  const parsed = parseColor(color)
  if (!parsed) return 0
  const max = Math.max(parsed.r, parsed.g, parsed.b)
  const min = Math.min(parsed.r, parsed.g, parsed.b)
  return ((max - min) / 255) * (1 - Math.abs(l - 0.5) * 1.2)
}

/** Ink that reads on a given fill, preferring the theme's own text colour. */
export function readableOn(background, preferred) {
  if (preferred) {
    const chosen = parseColor(preferred)
    if (chosen) {
      const flat = composite(chosen, background)
      if (contrast(flat, background) >= 3) return toHex(chosen)
    }
  }
  return contrast(background, '#FFFFFF') >= contrast(background, '#0E0B1A') ? '#FFFFFF' : '#0E0B1A'
}
