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

/**
 * Checks a theme loaded from outside (a file, a POST).
 * @returns {{ok: true, theme: object, ignored: string[]} | {ok: false, error: string}} `theme` has valid colors only and an icon pack name
 *   (a string of a-z, 0-9, -; 'robot' when the name is missing or malformed). Whether that pack exists is up to the caller.
 */
export function validateTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'a theme is an object' };
  if (typeof raw.name !== 'string' || !NAME.test(raw.name)) return { ok: false, error: 'name: 1 to 32 characters among a-z, 0-9 and -' };
  if (!raw.colors || typeof raw.colors !== 'object' || Array.isArray(raw.colors)) return { ok: false, error: 'colors: an object of KEY: "#rrggbb"' };
  const ignored = [];
  const colors = {};
  for (const key of COLOR_KEYS) {
    const v = raw.colors[key];
    if (v === undefined) continue;
    if (typeof v === 'string' && HEX.test(v)) colors[key] = v.toLowerCase(); else ignored.push(key);
  }
  const pack = typeof raw.iconPack === 'string' && NAME.test(raw.iconPack) ? raw.iconPack : DEFAULT_PACK;
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim().slice(0, 24)).slice(0, 8) : [];
  return { ok: true, ignored, theme: { name: raw.name, label: typeof raw.label === 'string' ? raw.label : raw.name, description, keywords, author: String(raw.author ?? ''), version: String(raw.version ?? ''), iconPack: pack, colors } };
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
