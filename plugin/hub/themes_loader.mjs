// Scans theme folders: <dir>/themes/*.json (themes) and <dir>/icons/<pack>/<role>[-blink].(svg|png|webp|gif|jpg) (icon packs).
// The user folder overrides the built-in one by theme or pack name. A bad file is skipped and listed in `errors`.
import fs from 'node:fs';
import path from 'node:path';
import { validateTheme, ROLE_FILES } from './web/theme_schema.js';

export const MAX_BYTES = 256 * 1024;
export const MAX_RASTER_BYTES = 1024 * 1024;                          // a GIF with frames is bigger than a vector file
// Image types of an icon, best first: when a role has several files the first extension wins.
export const ICON_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const EXT_ORDER = Object.keys(ICON_TYPES);
const PACK_NAME = /^[a-z0-9-]{1,32}$/;
// <role>, <role>-blink, and variants <role>-2 .. <role>-99 (with their -blink): several characters for one role.
export const ICON_NAME = new RegExp(`^(${ROLE_FILES.join('|')})(-[2-9]|-[1-9][0-9])?(-blink)?$`);

const list = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

function scanThemes(dir, errors) {
  const out = [];
  for (const e of list(path.join(dir, 'themes'))) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const file = path.join(dir, 'themes', e.name);
    try {
      if (fs.statSync(file).size > MAX_BYTES) { errors.push(`${file}: over 256 KB`); continue; }
      const r = validateTheme(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (r.ok) out.push(r.theme); else errors.push(`${file}: ${r.error}`);
    } catch (err) { errors.push(`${file}: ${err.message}`); }
  }
  return out;
}

function scanPacks(dir, errors) {
  const out = [];
  for (const d of list(path.join(dir, 'icons'))) {
    if (!d.isDirectory() || !PACK_NAME.test(d.name)) continue;
    const roles = {};
    const rank = {};                                             // role file name -> index of the extension kept
    for (const e of list(path.join(dir, 'icons', d.name))) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      const base = e.name.slice(0, -ext.length);
      if (!(ext in ICON_TYPES) || !ICON_NAME.test(base)) continue;
      const order = EXT_ORDER.indexOf(ext);
      if (rank[base] !== undefined && rank[base] < order) continue;
      const file = path.join(dir, 'icons', d.name, e.name);
      try {
        if (fs.statSync(file).size > (ext === '.svg' ? MAX_BYTES : MAX_RASTER_BYTES)) { errors.push(`${file}: too big`); continue; }
      } catch (err) { errors.push(`${file}: ${err.message}`); continue; }
      rank[base] = order;
      roles[base] = `/icons/${d.name}/${e.name}`;
    }
    if (Object.keys(roles).length) out.push({ name: d.name, roles });
  }
  return out;
}

/**
 * @returns {{ themes: object[], packs: {name: string, roles: Record<string, string>}[], errors: string[] }}
 *   `roles` maps a file name (a ROLE_FILES entry, or `<role>-blink`) to its `/icons/<pack>/<file>` URL.
 */
export function loadCatalog({ builtinDir, userDir }) {
  const errors = [];
  const themes = new Map();
  const packs = new Map();
  for (const dir of [builtinDir, userDir]) {
    if (!dir) continue;
    for (const t of scanThemes(dir, errors)) themes.set(t.name, t);
    for (const p of scanPacks(dir, errors)) packs.set(p.name, p);
  }
  return { themes: [...themes.values()], packs: [...packs.values()], errors };
}
