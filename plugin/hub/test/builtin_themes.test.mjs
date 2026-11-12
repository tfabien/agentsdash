import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES } from '../web/themes.js';
import { ICON_PACKS } from '../web/icon_packs.js';
import { ROLE_FILES, validateTheme } from '../web/theme_schema.js';
import { loadCatalog } from '../themes_loader.mjs';
import { svgContext } from '../tools/export_builtin.mjs';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = Object.keys(ICON_PACKS);
const svg = (pack, file) => fs.readFileSync(path.join(HUB, 'icons', pack, `${file}.svg`), 'utf8');

// The files are the source of truth (edit them freely); the old THEMES table only has to keep a valid `default`.
test('every_builtin_theme_json_validates_and_names_a_shipped_pack', () => {
  const files = fs.readdirSync(path.join(HUB, 'themes')).filter((f) => f.endsWith('.json'));
  assert.ok(files.includes('default.json'));
  for (const f of files) {
    const r = validateTheme(JSON.parse(fs.readFileSync(path.join(HUB, 'themes', f), 'utf8')));
    assert.equal(r.ok, true, f);
    assert.deepEqual(r.ignored, [], f);
    assert.equal(r.theme.name, f.replace(/\.json$/, ''));
    assert.ok(PACKS.includes(r.theme.iconPack), `${f} names pack ${r.theme.iconPack}`);
  }
});

test('every_pack_has_8_role_svgs_and_8_blink_svgs', () => {
  for (const pack of PACKS) {
    const files = fs.readdirSync(path.join(HUB, 'icons', pack)).sort();
    const want = ROLE_FILES.flatMap((r) => [`${r}.svg`, `${r}-blink.svg`]).sort();
    assert.deepEqual(files, want, pack);
  }
});

test('svgs_have_viewbox_36x42_and_no_script', () => {
  for (const pack of PACKS) {
    for (const r of ROLE_FILES) {
      for (const file of [r, `${r}-blink`]) {
        const s = svg(pack, file);
        assert.match(s, /viewBox="0 0 36 42"/, `${pack}/${file}`);
        assert.match(s, /width="36" height="42"/, `${pack}/${file}`);
        assert.doesNotMatch(s, /<script|onload|onerror/i, `${pack}/${file}`);
        assert.match(s, /<(path|rect|circle|ellipse|image)\b/, `${pack}/${file} draws nothing`);
      }
    }
  }
});

test('blink_differs_from_open_eyes_for_the_robot_lead', () => {
  assert.notEqual(svg('robot', 'lead'), svg('robot', 'lead-blink'));
});

test('catalog_of_the_hub_folder_has_5_themes_and_5_packs_with_16_files', () => {
  const c = loadCatalog({ builtinDir: HUB });
  assert.deepEqual(c.errors, []);
  assert.equal(c.themes.length, 5);
  assert.equal(c.packs.length, 5);
  for (const p of c.packs) assert.equal(Object.keys(p.roles).length, 16, p.name);
});

test('svgContext_throws_on_an_unsupported_call', () => {
  const { ctx } = svgContext();
  assert.throws(() => ctx.bezierCurveTo(0, 0, 1, 1, 2, 2), /unsupported/);
  assert.throws(() => { ctx.shadowBlur = 3; }, /unsupported/);
});

test('svgContext_records_a_filled_and_a_stroked_path', () => {
  const { ctx, toSvg } = svgContext();
  ctx.beginPath(); ctx.arc(10, 10, 5, 0, Math.PI * 2); ctx.fillStyle = '#ff0000'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 4); ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.stroke();
  const s = toSvg();
  assert.match(s, /fill="#ff0000"/);
  assert.match(s, /stroke="#00ff00" stroke-width="2"/);
});
