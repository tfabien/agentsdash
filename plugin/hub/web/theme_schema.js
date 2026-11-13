// Theme validation shared by the hub (themes_loader.mjs) and the page (themes.js). Plain ES module, no imports: works in Node and in the browser.

/** The keys of COLOR in screen.js. */
export const COLOR_KEYS = [
  'SCREEN', 'BAR', 'FRAME', 'PANEL', 'ROW', 'TEXT', 'LIGHT', 'FAINT', 'WORKING', 'NEEDS', 'ERROR', 'YOURTURN', 'WAITING', 'ACCENT', 'CHIP',
  'ACCENT_DIM', 'NEEDS_DIM',
];
/** The icon file names of a pack, in role order (index 0..7). */
export const ROLE_FILES = ['lead', 'general', 'explore', 'plan', 'review', 'test', 'code', 'generic'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[a-z0-9-]{1,32}$/;
const DEFAULT_PACK = 'robot';
const MAX_VARIANTS = 12;
const MAX_LOOKS = 12;

/**
 * Checks a theme loaded from outside (a file, a POST).
 * @returns {{ok: true, theme: object, ignored: string[]} | {ok: false, error: string}} `theme` has valid colors only and an icon pack name
 *   (a string of a-z, 0-9, -; 'robot' when the name is missing or malformed). Whether that pack exists is up to the caller.
 */
export function validateTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'a theme is an object' };
  if (typeof raw.name !== 'string' || !NAME.test(raw.name)) return { ok: false, error: 'name: 1 to 32 characters among a-z, 0-9 and -' };
  if (!raw.colors || typeof raw.colors !== 'object' || Array.isArray(raw.colors)) return { ok: false, error: 'colors: an object of KEY: "#rrggbb"' };
  const part = validatePalettePart(raw);
  const ignored = part.ignored;
  const variants = {};
  if (raw.variants && typeof raw.variants === 'object' && !Array.isArray(raw.variants)) {
    for (const [vname, v] of Object.entries(raw.variants)) {
      if (!NAME.test(vname) || !v || typeof v !== 'object' || Object.keys(variants).length >= MAX_VARIANTS) { ignored.push(`variants.${vname}`); continue; }
      const vp = validatePalettePart(v);
      for (const k of vp.ignored) ignored.push(`variants.${vname}.${k}`);
      variants[vname] = { label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 32) : vname, colors: vp.colors, accent: vp.accent ?? '' };
    }
  }
  const looks = {};
  if (raw.looks && typeof raw.looks === 'object' && !Array.isArray(raw.looks)) {
    for (const [lname, l] of Object.entries(raw.looks)) {
      if (!NAME.test(lname) || !l || typeof l !== 'object' || Array.isArray(l) || Object.keys(looks).length >= MAX_LOOKS) { ignored.push(`looks.${lname}`); continue; }
      const sprite = Number.isInteger(l.sprite) && l.sprite >= 1 && l.sprite <= 99 ? l.sprite : null;
      if (l.sprite !== undefined && sprite === null) ignored.push(`looks.${lname}.sprite`);
      const accent = typeof l.accent === 'string' && HEX.test(l.accent) ? l.accent.toLowerCase() : '';
      if (l.accent !== undefined && !accent) ignored.push(`looks.${lname}.accent`);
      looks[lname] = { label: typeof l.label === 'string' && l.label.trim() ? l.label.trim().slice(0, 32) : lname, sprite, accent };
    }
  }
  const defaultLooks = Array.isArray(raw.defaultLooks) ? raw.defaultLooks.filter((k) => typeof k === 'string' && k in looks) : [];
  const pack = typeof raw.iconPack === 'string' && NAME.test(raw.iconPack) ? raw.iconPack : DEFAULT_PACK;
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim().slice(0, 24)).slice(0, 8) : [];
  return { ok: true, ignored, theme: { name: raw.name, label: typeof raw.label === 'string' ? raw.label : raw.name, description, keywords, author: String(raw.author ?? ''), version: String(raw.version ?? ''), iconPack: pack, colors: part.colors, accent: part.accent ?? '', variants, looks, defaultLooks } };
}

/**
 * Keeps the valid parts of a palette fragment ({ colors, accent }): a theme, a variant or an override.
 * @returns {{colors: Record<string,string>, accent: string|undefined, ignored: string[]}}
 */
export function validatePalettePart(raw) {
  const ignored = [];
  const colors = {};
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const c = src.colors && typeof src.colors === 'object' && !Array.isArray(src.colors) ? src.colors : {};
  for (const key of COLOR_KEYS) {
    const v = c[key];
    if (v === undefined) continue;
    if (typeof v === 'string' && HEX.test(v)) colors[key] = v.toLowerCase(); else ignored.push(key);
  }
  let accent;
  if (src.accent !== undefined) { if (typeof src.accent === 'string' && HEX.test(src.accent)) accent = src.accent.toLowerCase(); else ignored.push('accent'); }
  return { colors, accent, ignored };
}

/**
 * The colors and the icon accent of a theme under a variant and a user override. Order: theme, variant, override. An unknown variant is the base.
 * @returns {{colors: Record<string,string>, accent: string}}
 */
export function resolvePalette(theme, variantKey, override) {
  const v = variantKey && theme.variants ? theme.variants[variantKey] : undefined;
  const colors = { ...theme.colors, ...(v?.colors ?? {}), ...(override?.colors ?? {}) };
  const accent = override?.accent || v?.accent || theme.accent || '';
  return { colors, accent };
}

/**
 * The looks agents are drawn with, in declaration order: the `chosen` keys when they name an existing look, else the theme's `defaultLooks`, else all of them.
 * @returns {{key: string, sprite: number|null, accent: string}[]} empty when the theme has no looks
 */
export function activeLooks(theme, chosen) {
  const all = Object.entries(theme.looks ?? {});
  if (!all.length) return [];
  const pick = (keys) => (Array.isArray(keys) ? all.filter(([k]) => keys.includes(k)) : []);
  const found = pick(chosen).length ? pick(chosen) : pick(theme.defaultLooks).length ? pick(theme.defaultLooks) : all;
  return found.map(([key, l]) => ({ key, sprite: l.sprite, accent: l.accent }));
}

/** Hue of a `#rrggbb` color in degrees (0..359), 0 for greys. */
export function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const w = [0.2126, 0.7152, 0.0722];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].reduce((sum, c, i) => { const x = c / 255; return sum + w[i] * (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); }, 0);
};
/** WCAG contrast ratio of two `#rrggbb` colors, 1 to 21. */
export function contrastRatio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DOTTED = /^\d+(\.\d+)*$/;
/** Orders two versions: dotted numbers part by part (missing parts are 0). Any other text is equal when identical and different (1) otherwise. */
export function compareVersions(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  if (!DOTTED.test(x) || !DOTTED.test(y)) return x === y ? 0 : 1;
  const p = x.split('.').map(Number), q = y.split('.').map(Number);
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    const d = (p[i] ?? 0) - (q[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
