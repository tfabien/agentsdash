// Lists the themes of a GitHub repository: one folder per theme, `<name>/theme.json` plus `<name>/icons/` and an optional preview.
// Two API calls (default branch, recursive tree) and one raw download per theme.json. `fetchFn` is injected for the tests.
import { validateTheme, validatePalettes } from './web/theme_schema.js';
import { ICON_TYPES, ICON_NAME } from './themes_loader.mjs';

export const SOURCE_RE = /^[\w.-]+\/[\w.-]+$/;
const NAME = /^[a-z0-9-]{1,32}$/;
const PREVIEW = /^preview\.(png|webp|jpe?g|gif)$/i;
const MAX_JSON = 256 * 1024;
const MAX_PACK_JSON = 4096;
export const GITHUB_HEADERS = { 'User-Agent': 'agentsdash', Accept: 'application/vnd.github+json' };

/** `owner/repo` or a github.com URL to `owner/repo`; null for anything else. */
export function parseSource(text) {
  const t = String(text ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').replace(/\.git$/, '');
  return SOURCE_RE.test(t) ? t : null;
}

/** True for a path made of plain segments: no backslash, no leading slash, no `.` or `..` segment. */
export const safePath = (p) => !p.includes('\\') && !p.startsWith('/') && !p.split('/').some((s) => s === '..' || s === '.' || s === '');

const EXT_ORDER = Object.keys(ICON_TYPES);
/** `icons/<role>[-N][-blink].<ext>` files as { file name without extension: URL }, the first extension of the loader order winning. */
function iconUrls(files, base) {
  const best = {};
  for (const f of files) {
    const m = /^icons\/([^/]+)$/.exec(f);
    if (!m) continue;
    const ext = path_ext(m[1]);
    const stem = m[1].slice(0, -ext.length);
    if (!(ext in ICON_TYPES) || !ICON_NAME.test(stem)) continue;
    if (best[stem] && EXT_ORDER.indexOf(best[stem].ext) <= EXT_ORDER.indexOf(ext)) continue;
    best[stem] = { ext, url: `${base}/${f}` };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.url]));
}
const path_ext = (name) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); };

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { headers: GITHUB_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Loads the optional tint and palette definitions used by a live preview. */
async function previewPack(fetchFn, base, files) {
  if (!files.includes('icons/pack.json')) return {};
  try {
    const response = await fetchFn(`${base}/icons/pack.json`, { headers: GITHUB_HEADERS });
    if (!response.ok) return {};
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_PACK_JSON) return {};
    const pack = JSON.parse(text);
    const tint = ['svg', 'hue', 'none'].includes(pack?.tint) ? pack.tint : 'none';
    const hue = Number.isInteger(pack?.hue) && pack.hue >= 0 && pack.hue < 360 ? pack.hue : 0;
    return { tint, hue, palettes: validatePalettes(pack?.palettes).palettes };
  } catch {
    // The base artwork remains available if pack metadata cannot be downloaded or parsed.
    return {};
  }
}

/**
 * @returns {Promise<{ themes: object[], errors: string[] }>} Themes with validated theme metadata and optional preview pack.
 *   `roles` maps an icon file name
 *   (`lead`, `lead-blink`, `explore-2`...) to its raw GitHub URL, the best extension per name: the page previews a theme from them.
 */
export async function listSource(source, fetchFn = fetch) {
  try {
    const { default_branch: branch } = await getJson(fetchFn, `https://api.github.com/repos/${source}`);
    const tree = await getJson(fetchFn, `https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    if (tree.truncated) return { themes: [], errors: [`${source}: the repository tree is truncated (too many files)`] };
    const blobs = (tree.tree ?? []).filter((e) => e.type === 'blob' && typeof e.path === 'string').map((e) => e.path);
    const folders = [...new Set(blobs.filter((p) => /^[^/]+\/theme\.json$/.test(p)).map((p) => p.split('/')[0]))].filter((n) => NAME.test(n));
    const themes = [];
    const errors = [];
    for (const folder of folders) {
      const base = `https://raw.githubusercontent.com/${source}/${branch}/${folder}`;
      try {
        const res = await fetchFn(`${base}/theme.json`, { headers: GITHUB_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > MAX_JSON) throw new Error('theme.json over 256 KB');
        const v = validateTheme(JSON.parse(text));
        if (!v.ok) throw new Error(v.error);
        if (v.theme.name !== folder) throw new Error(`folder ${folder} holds the theme ${v.theme.name}`);
        const files = blobs.filter((p) => p.startsWith(`${folder}/`) && p !== `${folder}/theme.json`).map((p) => p.slice(folder.length + 1)).filter(safePath);
        const preview = files.find((f) => PREVIEW.test(f));
        const { name, label, description, keywords, author, version, colors, accent, variants, looks, defaultLooks } = v.theme;
        const pack = await previewPack(fetchFn, base, files);
        themes.push({ source, name, label, description, keywords, author, version, branch, colors, accent, variants, looks, defaultLooks,
          pack, roles: iconUrls(files, base), preview: preview ? `${base}/${preview}` : null, files });
      } catch (err) { errors.push(`${source}/${folder}: ${err.message}`); }
    }
    return { themes, errors };
  } catch (err) { return { themes: [], errors: [`${source}: ${err.message}`] }; }
}
