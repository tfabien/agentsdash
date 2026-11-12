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

// Field lengths of the gadget firmware (buffer length minus the NUL). The hub keeps full text; the relays cut it here, per wire key.
const DEVICE_LIMITS = { session: 4, agent: 4, project: 14, role: 23, evt: 23, cmd: 63, detail: 60, title: 30, model: 40, plan_cur: 47, plan_next: 47, plan_state: 16, question: 120, options: 100 };

/** What a gadget receives for `route`: ASCII only, and for /event every text field cut to the firmware's buffer. */
export function forDevice(route, body) {
  const out = asciiDeep(body);
  if (route === '/event' && out && typeof out === 'object') {
    delete out.cwd;                                  // the path stays on the hub (rules); a gadget has no use for it
    for (const [key, n] of Object.entries(DEVICE_LIMITS)) if (typeof out[key] === 'string') out[key] = out[key].slice(0, n);
  }
  return out;
}
