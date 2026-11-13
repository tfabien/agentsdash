// Installs a marketplace theme into the user folder (themes/<name>.json + icons/<name>/) and records it in market.json.
// Files go to a temporary folder first and are swapped in only when every download passed, so a failed update keeps the old version.
import fs from 'node:fs';
import path from 'node:path';
import { ICON_TYPES, ICON_NAME, MAX_BYTES, MAX_RASTER_BYTES } from './themes_loader.mjs';
import { validateTheme } from './web/theme_schema.js';
import { GITHUB_HEADERS } from './market_source.mjs';

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
  const res = await fetchFn(url, { headers: GITHUB_HEADERS });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > cap) throw new Error(`${url}: over ${Math.round(cap / 1024)} KB`);
  return data;
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
    const tmp = path.join(userDir, `.market-tmp-${name}-${Date.now()}`);
    const base = `https://raw.githubusercontent.com/${source}/${branch}/${name}`;
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
        fs.renameSync(path.join(tmp, 'icons'), iconDir);
        fs.copyFileSync(path.join(tmp, 'theme.json'), themeFile);
      } catch (err) {
        fs.rmSync(iconDir, { recursive: true, force: true });
        if (hadIcons) fs.renameSync(old, iconDir);
        throw err;
      }
      if (hadIcons) fs.rmSync(old, { recursive: true, force: true });
      writeInstalled(userDir, { ...readInstalled(userDir), [name]: { source, version: checked.theme.version, installedAt: new Date().toISOString() } });
      return { version: checked.theme.version };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

/**
 * Deletes a theme of the user folder (from a marketplace or written by hand) and its icon pack, unless another theme of the folder uses that pack.
 * @returns {boolean} false when the user folder has no such theme; throws for a built-in theme name
 */
export function removeTheme({ name, userDir, builtinNames = new Set() }) {
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
  if (/^[a-z0-9-]{1,32}$/.test(pack) && !usedElsewhere) fs.rmSync(path.join(userDir, 'icons', pack), { recursive: true, force: true });
  const { [name]: _gone, ...rest } = readInstalled(userDir);
  writeInstalled(userDir, rest);
  return true;
}
