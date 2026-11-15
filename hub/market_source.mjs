// Lists the themes of a GitHub repository: one folder per theme, `<name>/theme.json` plus `<name>/icons/` and an optional preview.
// Two API calls (default branch, recursive tree) and one raw download per theme.json. `fetchFn` is injected for the tests.
import { validateTheme, NAME } from './web/theme_schema.js';
import { ICON_TYPES, ICON_NAME, MAX_BYTES, MAX_PACK_JSON, packFromJson } from './themes_loader.mjs';

export const SOURCE_RE = /^[\w.-]+\/[\w.-]+$/;
const PREVIEW = /^preview\.(png|webp|jpe?g|gif)$/i;
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

/** The raw.githubusercontent.com folder of `folder` on `branch`; each branch segment is encoded, so `a#b` stays one path segment. */
export const rawBase = (source, branch, folder) => `https://raw.githubusercontent.com/${source}/${String(branch).split('/').map(encodeURIComponent).join('/')}/${folder}`;

/** Fetches `url` with the GitHub headers; throws `HTTP <status>` on a failed response. */
export async function fetchOk(fetchFn, url) {
  const res = await fetchFn(url, { headers: GITHUB_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const getJson = async (fetchFn, url) => (await fetchOk(fetchFn, url)).json();

/** The tint mode of a listed pack from its icons/pack.json (4 KB at most), read as the loader reads an installed one; any failure keeps the defaults. */
async function remotePack(fetchFn, url) {
  try {
    const buf = Buffer.from(await (await fetchOk(fetchFn, url)).arrayBuffer());
    if (buf.length > MAX_PACK_JSON) return { tint: 'none', hue: 0 };
    return packFromJson(JSON.parse(buf.toString('utf8')), url, []);
  } catch { return { tint: 'none', hue: 0 }; }
}

/**
 * @returns {Promise<{ themes: object[], errors: string[], sourceError?: true }>} `sourceError` when the repository itself failed (HTTP, network,
 *   truncated tree), absent when only some themes failed. Each theme: { source, name, label, description, keywords, author, version, branch, colors,
 *   accent, variants, looks, defaultLooks, pack: { tint, hue, palettes? }, roles, preview: string | null, files: string[] } with `files` relative to the theme folder (theme.json left out). `roles` maps an icon file name
 *   (`lead`, `lead-blink`, `explore-2`...) to its raw GitHub URL, the best extension per name: the page previews a theme from them.
 */
export async function listSource(source, fetchFn = fetch) {
  try {
    const { default_branch: branch } = await getJson(fetchFn, `https://api.github.com/repos/${source}`);
    const tree = await getJson(fetchFn, `https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    if (tree.truncated) return { themes: [], errors: [`${source}: the repository tree is truncated (too many files)`], sourceError: true };
    const blobs = (tree.tree ?? []).filter((e) => e.type === 'blob' && typeof e.path === 'string').map((e) => e.path);
    const folders = [...new Set(blobs.filter((p) => /^[^/]+\/theme\.json$/.test(p)).map((p) => p.split('/')[0]))].filter((n) => NAME.test(n));
    const themes = [];
    const errors = [];
    for (const folder of folders) {
      const base = rawBase(source, branch, folder);
      try {
        const buf = Buffer.from(await (await fetchOk(fetchFn, `${base}/theme.json`)).arrayBuffer());
        if (buf.length > MAX_BYTES) throw new Error('theme.json over 256 KB');      // bytes, as the install and the loader count
        const v = validateTheme(JSON.parse(buf.toString('utf8')));
        if (!v.ok) throw new Error(v.error);
        if (v.theme.name !== folder) throw new Error(`folder ${folder} holds the theme ${v.theme.name}`);
        const files = blobs.filter((p) => p.startsWith(`${folder}/`) && p !== `${folder}/theme.json`).map((p) => p.slice(folder.length + 1)).filter(safePath);
        const preview = files.find((f) => PREVIEW.test(f));
        const { name, label, description, keywords, author, version, colors, accent, variants, looks, defaultLooks } = v.theme;
        const pack = files.includes('icons/pack.json') ? await remotePack(fetchFn, `${base}/icons/pack.json`) : { tint: 'none', hue: 0 };
        themes.push({ source, name, label, description, keywords, author, version, branch, colors, accent, variants, looks, defaultLooks, pack,
          roles: iconUrls(files, base), preview: preview ? `${base}/${preview}` : null, files });
      } catch (err) { errors.push(`${source}/${folder}: ${err.message}`); }
    }
    return { themes, errors };
  } catch (err) { return { themes: [], errors: [`${source}: ${err.message}`], sourceError: true }; }
}
