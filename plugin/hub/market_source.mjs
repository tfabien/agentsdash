// Lists the themes of a GitHub repository: one folder per theme, `<name>/theme.json` plus `<name>/icons/` and an optional preview.
// Two API calls (default branch, recursive tree) and one raw download per theme.json. `fetchFn` is injected for the tests.
import { validateTheme } from './web/theme_schema.js';

export const SOURCE_RE = /^[\w.-]+\/[\w.-]+$/;
const NAME = /^[a-z0-9-]{1,32}$/;
const PREVIEW = /^preview\.(png|webp|jpe?g|gif)$/i;
const MAX_JSON = 256 * 1024;
export const GITHUB_HEADERS = { 'User-Agent': 'standup-bot', Accept: 'application/vnd.github+json' };

/** `owner/repo` or a github.com URL to `owner/repo`; null for anything else. */
export function parseSource(text) {
  const t = String(text ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').replace(/\.git$/, '');
  return SOURCE_RE.test(t) ? t : null;
}

/** True for a path made of plain segments: no backslash, no leading slash, no `.` or `..` segment. */
export const safePath = (p) => !p.includes('\\') && !p.startsWith('/') && !p.split('/').some((s) => s === '..' || s === '.' || s === '');

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { headers: GITHUB_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{ themes: object[], errors: string[] }>} each theme: { source, name, label, description, keywords, author, version, branch,
 *   preview: string | null, files: string[] } with `files` relative to the theme folder (theme.json left out).
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
        const { name, label, description, keywords, author, version } = v.theme;
        themes.push({ source, name, label, description, keywords, author, version, branch, preview: preview ? `${base}/${preview}` : null, files });
      } catch (err) { errors.push(`${source}/${folder}: ${err.message}`); }
    }
    return { themes, errors };
  } catch (err) { return { themes: [], errors: [`${source}: ${err.message}`] }; }
}
