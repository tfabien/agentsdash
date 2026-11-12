// Writes the built-in themes and icon packs as files: themes/<name>.json and icons/<pack>/<role>[-blink].svg.
// The canvas drawings of web/icon_packs.js run against a recording context that emits SVG. Run: node plugin/hub/tools/export_builtin.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_PACKS } from '../web/icon_packs.js';
import { THEMES } from '../web/themes.js';
import { ROLE_FILES } from '../web/theme_schema.js';

const HUB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const num = (n) => String(Math.round(n * 1000) / 1000);
const FULL = Math.PI * 2;
const METHODS = ['beginPath', 'moveTo', 'lineTo', 'closePath', 'roundRect', 'arc', 'ellipse', 'quadraticCurveTo', 'fill', 'stroke'];
const PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin'];

/**
 * A 2D context that records what icon_packs.js draws. Only the calls the packs use exist: anything else throws, so nothing is dropped silently.
 * @returns {{ ctx: object, toSvg: () => string }}
 */
export function svgContext() {
  const items = [];
  let d = [];                       // path data of the current path
  let open = false;                 // true when the current subpath has a point (arc then joins it with a line)
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };

  const arcTo = (cx, cy, rx, ry, a0, a1) => {
    const sx = cx + rx * Math.cos(a0), sy = cy + ry * Math.sin(a0);
    d.push(open ? `L${num(sx)} ${num(sy)}` : `M${num(sx)} ${num(sy)}`);
    const span = a1 - a0;
    if (Math.abs(span) >= FULL - 1e-9) {              // a full turn is two half turns in SVG
      const mx = cx - rx * Math.cos(a0), my = cy - ry * Math.sin(a0);
      d.push(`A${num(rx)} ${num(ry)} 0 1 1 ${num(mx)} ${num(my)}`, `A${num(rx)} ${num(ry)} 0 1 1 ${num(sx)} ${num(sy)}`);
    } else {
      const ex = cx + rx * Math.cos(a1), ey = cy + ry * Math.sin(a1);
      d.push(`A${num(rx)} ${num(ry)} 0 ${Math.abs(span) > Math.PI ? 1 : 0} ${span > 0 ? 1 : 0} ${num(ex)} ${num(ey)}`);
    }
    open = true;
  };

  const api = {
    beginPath() { d = []; open = false; },
    moveTo(x, y) { d.push(`M${num(x)} ${num(y)}`); open = true; },
    lineTo(x, y) { d.push(`${open ? 'L' : 'M'}${num(x)} ${num(y)}`); open = true; },
    closePath() { d.push('Z'); },
    quadraticCurveTo(cx, cy, x, y) { d.push(`Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`); },
    arc(cx, cy, r, a0, a1) { arcTo(cx, cy, r, r, a0, a1); },
    ellipse(cx, cy, rx, ry, rot, a0, a1) {
      if (rot !== 0) throw new Error('svgContext: ellipse rotation is not supported');
      arcTo(cx, cy, rx, ry, a0, a1);
    },
    roundRect(x, y, w, h, r) {
      if (typeof r !== 'number') throw new Error('svgContext: roundRect radius must be a number');
      r = Math.min(r, w / 2, h / 2);
      d.push(`M${num(x + r)} ${num(y)}H${num(x + w - r)}A${num(r)} ${num(r)} 0 0 1 ${num(x + w)} ${num(y + r)}V${num(y + h - r)}`
        + `A${num(r)} ${num(r)} 0 0 1 ${num(x + w - r)} ${num(y + h)}H${num(x + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x)} ${num(y + h - r)}`
        + `V${num(y + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x + r)} ${num(y)}Z`);
      open = true;
    },
    fill() { if (d.length) items.push(`<path d="${d.join('')}" fill="${state.fillStyle}"/>`); },
    stroke() {
      if (d.length) items.push(`<path d="${d.join('')}" fill="none" stroke="${state.strokeStyle}" stroke-width="${num(state.lineWidth)}" stroke-linecap="${state.lineCap}" stroke-linejoin="${state.lineJoin}"/>`);
    },
  };

  const ctx = new Proxy(api, {
    get(t, k) {
      if (PROPS.includes(k)) return state[k];
      if (METHODS.includes(k)) return t[k];
      throw new Error(`svgContext: unsupported ${String(k)}`);
    },
    set(t, k, v) {
      if (!PROPS.includes(k)) throw new Error(`svgContext: unsupported property ${String(k)}`);
      state[k] = v;
      return true;
    },
  });

  return {
    ctx,
    toSvg: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 42" width="36" height="42">\n${items.join('\n')}\n</svg>\n`,
  };
}

/** Renders one role of a canvas pack as an SVG string. */
export function renderIcon(pack, role, blink) {
  const { ctx, toSvg } = svgContext();
  ICON_PACKS[pack].draw(ctx, role, blink);
  return toSvg();
}

/** Writes the 5 themes and the 5 packs under `hubDir`. @returns {number} files written */
export function exportBuiltin(hubDir = HUB_DIR) {
  let count = 0;
  fs.mkdirSync(path.join(hubDir, 'themes'), { recursive: true });
  for (const t of Object.values(THEMES)) {
    const { name, label, author, version, iconPack, colors } = t;
    fs.writeFileSync(path.join(hubDir, 'themes', `${name}.json`), `${JSON.stringify({ name, label, author, version, iconPack, colors }, null, 2)}\n`);
    count++;
  }
  for (const pack of Object.keys(ICON_PACKS)) {
    const dir = path.join(hubDir, 'icons', pack);
    fs.mkdirSync(dir, { recursive: true });
    ROLE_FILES.forEach((file, role) => {
      fs.writeFileSync(path.join(dir, `${file}.svg`), renderIcon(pack, role, false));
      fs.writeFileSync(path.join(dir, `${file}-blink.svg`), renderIcon(pack, role, true));
      count += 2;
    });
  }
  return count;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`wrote ${exportBuiltin()} files`);
}
