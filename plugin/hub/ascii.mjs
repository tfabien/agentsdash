// Text bound for a device screen: the USART HMI fonts hold ASCII glyphs only, so every string is reduced to 7-bit ASCII.
// The hub keeps the full Unicode for the web page and applies this just before the relays (relay_http.mjs, relay_serial.mjs).

const MAP = new Map(Object.entries({
  '‘': "'", '’': "'", '‚': ',', '‛': "'", '′': "'", '“': '"', '”': '"', '„': '"', '″': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-',
  '…': '...', '•': '*', '·': '*', '×': 'x', '÷': '/', '→': '->', '←': '<-',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  'œ': 'oe', 'Œ': 'OE', 'æ': 'ae', 'Æ': 'AE', 'ß': 'ss', 'ø': 'o', 'Ø': 'O',
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'Th',
  '€': 'EUR', '£': 'GBP', '©': '(c)', '®': '(r)', '™': '(tm)',
}));
const INVISIBLE = /[​-‏⁠﻿]/;    // zero-width characters and joiners: dropped, not shown as "?"

/** Accents are stripped, typographic punctuation is mapped to ASCII, any other character becomes "?". */
export function toAscii(text) {
  let out = '';
  for (const ch of String(text).normalize('NFD').replace(/\p{M}/gu, '')) {
    if (ch.charCodeAt(0) < 0x80) out += ch;
    else if (MAP.has(ch)) out += MAP.get(ch);
    else if (!INVISIBLE.test(ch)) out += '?';
  }
  return out;
}

/** A copy of `value` (JSON data) with every string, keys included, reduced to ASCII. */
export function asciiDeep(value) {
  if (typeof value === 'string') return toAscii(value);
  if (Array.isArray(value)) return value.map(asciiDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [toAscii(k), asciiDeep(v)]));
  return value;
}
