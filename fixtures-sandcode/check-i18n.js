#!/usr/bin/env node
/* Sandcode i18n dictionary check — no dependencies.
   There is one dictionary per language (i18n-<code>.js) and the engine matches a
   key against a whole normalized text node (or a placeholder/title/aria-label
   value, or a JS string literal), so this lint has to do the same: exact lookup,
   never substring containment. Substring matching passed any short key ("The",
   "Run", "Date") that happened to occur inside unrelated copy, which hid real
   orphans. It reports:
     1. orphan keys    — a key that no page or script ever produces
     2. duplicate keys — the same key defined twice inside one language
     3. coverage       — a key another language has and this one does not
   Usage: node check-i18n.js   (exit 1 when findings exist) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const isDict = f => /^i18n-[a-z]{2}\.js$/.test(f);
const DICTS = fs.readdirSync(ROOT).filter(isDict).sort();
const HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
// every root script whose string literals end up in the DOM, minus the
// dictionaries themselves (self-references would mask orphans) and this tool.
// i18n.js belongs here: it builds the language picker and sets that control's
// aria-label, so its literals are strings the engine really does look up.
const JS = fs.readdirSync(ROOT).filter(f =>
  f.endsWith('.js') && !isDict(f) && f !== 'check-i18n.js');
// The attributes i18n.js actually swaps, plus data-toast (which becomes a
// toast's text). `content` is deliberately absent: the engine never touches it,
// so counting <meta content> as translatable would hide a key that is never
// applied. Keep this list in step with ATTRS in i18n.js.
const attrRe = () => /(?:data-toast|placeholder|title|aria-label)="([^"]*)"/g;

// The engine reads decoded DOM text, so anything the HTML can spell must decode
// here too — an unknown entity is left verbatim and would read as a false orphan.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  middot: '\u00b7', times: '\u00d7', divide: '\u00f7', hellip: '\u2026',
  mdash: '\u2014', ndash: '\u2013', minus: '\u2212',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  laquo: '\u00ab', raquo: '\u00bb', bull: '\u2022', dagger: '\u2020',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', deg: '\u00b0', plusmn: '\u00b1',
  larr: '\u2190', rarr: '\u2192', uarr: '\u2191', darr: '\u2193',
  sect: '\u00a7', para: '\u00b6', eacute: '\u00e9'
};
const decode = (whole, body) => {
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    return String.fromCodePoint(parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10));
  }
  return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : whole;
};
// the same normalization the engine applies before a dictionary lookup
const norm = s => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decode).replace(/\s+/g, ' ').trim();

// ---- collect every string the engine could look up ----
const snippets = new Set();
const add = s => { const n = norm(s); if (n) snippets.add(n); };

// markup (real HTML, or an HTML fragment a script builds — chrome.js emits the
// nav, footer, sidebar and topbar as strings): text nodes + translated attrs
const addMarkup = src => {
  for (const m of src.matchAll(/>([^<>]+)</g)) add(m[1]);
  for (const m of src.matchAll(attrRe())) add(m[1]);
};

for (const f of HTML) addMarkup(fs.readFileSync(path.join(ROOT, f), 'utf8'));
for (const f of JS) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
    const lit = m[1] !== undefined ? m[1] : m[2];
    add(lit);        // the literal itself (toast copy, row labels, …)
    addMarkup(lit);  // …or markup built from it
  }
}

// ---- collect dictionary keys, per language ----
const byLang = new Map(); // file -> Map(key -> occurrences)
for (const f of DICTS) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm; // keys start the line
  const seen = new Map();
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = (m[1] !== undefined ? m[1] : m[2]).replace(/\\(['"\\])/g, '$1');
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  byLang.set(f, seen);
}

// ---- report ----
let bad = 0;
const union = new Set();
for (const seen of byLang.values()) for (const k of seen.keys()) union.add(k);

for (const [f, seen] of byLang) {
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  for (const [key, n] of dupes) console.warn(`DUPLICATE  ${f}  "${key}"  ×${n}`);
  if (dupes.length) bad++;

  const orphans = [...seen.keys()].filter(k => !snippets.has(k));
  for (const k of orphans) console.warn(`ORPHAN     ${f}  "${k}"`);
  if (orphans.length) bad++;

  // a key another language translates and this one does not means the page
  // silently falls back to English for that string
  const missing = [...union].filter(k => !seen.has(k));
  for (const k of missing) console.warn(`MISSING    ${f}  "${k}"`);
  if (missing.length) bad++;
}

console.log(`checked ${union.size} keys across ${DICTS.length} languages ` +
  `(${DICTS.map(f => f.replace(/^i18n-|\.js$/g, '')).join(', ')}) ` +
  `against ${HTML.length} pages + ${JS.length} js files`);
if (bad) { console.error(`✗ ${bad} finding${bad === 1 ? '' : 's'}`); process.exit(1); }
console.log('✓ dictionaries clean and aligned');
