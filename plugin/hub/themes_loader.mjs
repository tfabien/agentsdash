// Scans theme folders: <dir>/themes/*.json (themes) and <dir>/icons/<pack>/<role>[-blink].svg (icon packs).
// The user folder overrides the built-in one by theme or pack name. A bad file is skipped and listed in `errors`.
import fs from 'node:fs';
import path from 'node:path';
import { validateTheme, ROLE_FILES } from './web/theme_schema.js';

const MAX_BYTES = 256 * 1024;
const PACK_NAME = /^[a-z0-9-]{1,32}$/;
const ICON_FILES = new Set(ROLE_FILES.flatMap((r) => [r, `${r}-blink`]));

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
    for (const e of list(path.join(dir, 'icons', d.name))) {
      if (!e.isFile() || !e.name.endsWith('.svg')) continue;
      const base = e.name.slice(0, -4);
      if (!ICON_FILES.has(base)) continue;
      const file = path.join(dir, 'icons', d.name, e.name);
      try {
        if (fs.statSync(file).size > MAX_BYTES) { errors.push(`${file}: over 256 KB`); continue; }
      } catch (err) { errors.push(`${file}: ${err.message}`); continue; }
      roles[base] = `/icons/${d.name}/${e.name}`;
    }
    if (Object.keys(roles).length) out.push({ name: d.name, roles });
  }
  return out;
}

/**
 * @returns {{ themes: object[], packs: {name: string, roles: Record<string, string>}[], errors: string[] }}
 *   `roles` maps a file name (a ROLE_FILES entry, or `<role>-blink`) to its `/icons/<pack>/<file>.svg` URL.
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
