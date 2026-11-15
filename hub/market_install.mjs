// Installs a marketplace theme into the user folder (themes/<name>.json + icons/<name>/) and records it in market.json.
// Files go to a temporary folder first and are swapped in only when every download passed, so a failed update keeps the old version.
import fs from 'node:fs';
import path from 'node:path';
import { ICON_TYPES, ICON_NAME, MAX_BYTES, MAX_RASTER_BYTES, MAX_PACK_JSON } from './themes_loader.mjs';
import { validateTheme, resolvePalette, activeLooks } from './web/theme_schema.js';
import { fetchOk, rawBase } from './market_source.mjs';

const MAX_FILES = 100;
const MAX_TOTAL = 20 * 1024 * 1024;
const LOG = 'market.json';

/** @returns {Record<string, {source: string, version: string, installedAt: string}>} {} when the file is missing or corrupt. */
export function readInstalled(userDir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(userDir, LOG), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

function writeInstalled(userDir, data) {
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, LOG), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** The icon files of a theme that the loader would accept: `icons/<role>[-N][-blink].<ext>`, no sub-folder. */
function iconFiles(files) {
  return files.filter((f) => {
    const m = /^icons\/([^/]+)$/.exec(f);
    if (!m) return false;
    const ext = path.extname(m[1]).toLowerCase();
    return ext in ICON_TYPES && ICON_NAME.test(m[1].slice(0, -ext.length));
  });
}

async function download(fetchFn, url, cap) {
  let res;
  try { res = await fetchOk(fetchFn, url); } catch (err) { throw new Error(`${url}: ${err.message}`); }
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > cap) throw new Error(`${url}: over ${Math.round(cap / 1024)} KB`);
  return data;
}

/** Best effort: a file held open (an antivirus, an icon being served) leaves the folder behind; the next install of the theme sweeps it. */
const tryRm = (p) => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); } catch { /* swept later */ } };

/** Deletes what an earlier install of `name` left behind: `.market-tmp-<name>-*` and `icons/<name>.old-*`, nothing else. */
function sweep(userDir, name) {
  const left = (dir, prefix) => { try { return fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length))).map((n) => path.join(dir, n)); } catch { return []; } };
  for (const p of [...left(userDir, `.market-tmp-${name}-`), ...left(path.join(userDir, 'icons'), `${name}.old-`)]) tryRm(p);
}

let chain = Promise.resolve();                                   // installs and updates run one after the other
const inOrder = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };

/**
 * @param {{theme: object, userDir: string, builtinNames: Set<string>, fetchFn?: typeof fetch}} p `theme` is an entry of listSource
 * @returns {Promise<{version: string}>} rejects with a readable Error when anything fails; the installed version then stays as it was
 */
export function installTheme({ theme, userDir, builtinNames, fetchFn = fetch }) {
  return inOrder(async () => {
    const { name, source, branch } = theme;
    if (builtinNames.has(name)) throw new Error(`${name} is a built-in theme and cannot be replaced`);
    if (theme.files.length > MAX_FILES) throw new Error(`${name}: more than ${MAX_FILES} files`);
    const icons = iconFiles(theme.files);
    sweep(userDir, name);
    const tmp = path.join(userDir, `.market-tmp-${name}-${Date.now()}`);
    const base = rawBase(source, branch, name);
    try {
      fs.mkdirSync(path.join(tmp, 'icons'), { recursive: true });
      const json = await download(fetchFn, `${base}/theme.json`, MAX_BYTES);
      const checked = validateTheme(JSON.parse(json.toString('utf8')));
      if (!checked.ok) throw new Error(`${name}: ${checked.error}`);
      if (checked.theme.name !== name) throw new Error(`${name}: theme.json names ${checked.theme.name}`);
      let total = json.length;
      for (const f of icons) {
        const data = await download(fetchFn, `${base}/${f}`, path.extname(f).toLowerCase() === '.svg' ? MAX_BYTES : MAX_RASTER_BYTES);
        total += data.length;
        if (total > MAX_TOTAL) throw new Error(`${name}: more than 20 MB`);
        fs.writeFileSync(path.join(tmp, f), data);
      }
      if (icons.length && theme.files.includes('icons/pack.json')) {      // tint mode of the pack (see themes_loader.mjs), 4 KB at most
        fs.writeFileSync(path.join(tmp, 'icons', 'pack.json'), await download(fetchFn, `${base}/icons/pack.json`, MAX_PACK_JSON));
      }
      const themeFile = path.join(userDir, 'themes', `${name}.json`);
      const iconDir = path.join(userDir, 'icons', name);
      const old = `${iconDir}.old-${Date.now()}`;
      fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
      fs.mkdirSync(path.join(userDir, 'icons'), { recursive: true });
      const next = { ...JSON.parse(json.toString('utf8')), iconPack: icons.length ? name : 'robot' };
      fs.writeFileSync(path.join(tmp, 'theme.json'), JSON.stringify(next, null, 2), 'utf8');
      const hadIcons = fs.existsSync(iconDir);
      if (hadIcons) fs.renameSync(iconDir, old);
      try {
        if (icons.length) fs.renameSync(path.join(tmp, 'icons'), iconDir);   // an icon-less theme uses robot: no icons/<name> folder
        fs.copyFileSync(path.join(tmp, 'theme.json'), themeFile);
      } catch (err) {
        fs.rmSync(iconDir, { recursive: true, force: true });
        if (hadIcons) fs.renameSync(old, iconDir);
        throw err;
      }
      // The new version is live: record it first, then clean up (a cleanup failure must not report the install as failed).
      writeInstalled(userDir, { ...readInstalled(userDir), [name]: { source, version: checked.theme.version, installedAt: new Date().toISOString() } });
      if (hadIcons) tryRm(old);
      return { version: checked.theme.version };
    } finally {
      tryRm(tmp);
    }
  });
}

/**
 * Deletes a theme of the user folder (from a marketplace or written by hand) and its own icon pack `icons/<name>/`, unless another theme of the
 * folder or a pack in `keepPacks` (the packs of the rules) uses it. A pack under another name (robot, a shared or hand-made pack) is never deleted.
 * @returns {boolean} false when the user folder has no such theme; throws for a built-in theme name
 */
export function removeTheme({ name, userDir, builtinNames = new Set(), keepPacks = new Set() }) {
  if (!/^[a-z0-9-]{1,32}$/.test(name)) return false;
  if (builtinNames.has(name)) throw new Error(`${name} is a built-in theme and cannot be deleted`);
  const file = path.join(userDir, 'themes', `${name}.json`);
  if (!fs.existsSync(file)) return false;
  let pack = '';
  try { pack = String(JSON.parse(fs.readFileSync(file, 'utf8')).iconPack ?? ''); } catch { /* an unreadable theme file goes anyway */ }
  fs.rmSync(file, { force: true });
  const usedElsewhere = fs.readdirSync(path.join(userDir, 'themes')).filter((f) => f.endsWith('.json')).some((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(userDir, 'themes', f), 'utf8')).iconPack === pack; } catch { return false; }
  });
  if (pack === name && !usedElsewhere && !keepPacks.has(pack)) fs.rmSync(path.join(userDir, 'icons', pack), { recursive: true, force: true });
  const { [name]: _gone, ...rest } = readInstalled(userDir);
  writeInstalled(userDir, rest);
  return true;
}

/**
 * Writes the look of `theme` under `variant` and the user's `override` as a user theme `<userDir>/themes/<name>.json` (resolved colors and accent, no variants).
 * @returns {{path: string}} throws an Error: a built-in name, a name installed from the marketplace (its updates would revert it), an existing user theme without `overwrite`
 */
export function saveUserTheme({ name, label, theme, variant = '', override, looks, userDir, builtinNames, overwrite = false }) {
  if (!/^[a-z0-9-]{1,32}$/.test(name)) throw new Error('name: 1 to 32 characters among a-z, 0-9 and -');
  if (builtinNames.has(name)) throw new Error(`${name} is a built-in theme and cannot be replaced`);
  if (name in readInstalled(userDir)) throw new Error(`${name} comes from the marketplace, pick another name`);
  const file = path.join(userDir, 'themes', `${name}.json`);
  if (fs.existsSync(file) && !overwrite) throw new Error(`${name} exists`);
  const { colors, accent } = resolvePalette(theme, variant, override);
  const out = { name, label: label?.trim() ? label.trim().slice(0, 32) : name, description: theme.description || '', keywords: theme.keywords ?? [], author: 'user', version: '1', iconPack: theme.iconPack, ...(accent ? { accent } : {}), colors };
  const active = activeLooks(theme, looks);                       // the ticked looks become the author default of the saved theme
  if (active.length) {
    out.looks = Object.fromEntries(active.map((l) => [l.key, { label: theme.looks[l.key].label, ...(l.sprite ? { sprite: l.sprite } : {}), ...(l.accent ? { accent: l.accent } : {}), ...(l.palette ? { palette: l.palette } : {}) }]));
    out.defaultLooks = active.map((l) => l.key);
  }
  fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}
`, 'utf8');
  fs.renameSync(tmp, file);
  return { path: file };
}
