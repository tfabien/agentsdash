import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog } from '../themes_loader.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'themes-'));
const put = (dir, rel, content) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
};
const theme = (name, extra = {}) => ({ name, colors: { FRAME: '#112233' }, ...extra });

test('loads_builtin_and_user_themes', () => {
  const b = tmp(), u = tmp();
  put(b, 'themes/a.json', theme('a'));
  put(u, 'themes/b.json', theme('b'));
  const c = loadCatalog({ builtinDir: b, userDir: u });
  assert.deepEqual(c.themes.map((t) => t.name).sort(), ['a', 'b']);
  assert.deepEqual(c.errors, []);
});

test('user_overrides_builtin_of_same_name', () => {
  const b = tmp(), u = tmp();
  put(b, 'themes/a.json', theme('a', { label: 'Built-in' }));
  put(u, 'themes/mine.json', theme('a', { label: 'User' }));
  const c = loadCatalog({ builtinDir: b, userDir: u });
  assert.equal(c.themes.length, 1);
  assert.equal(c.themes[0].label, 'User');
});

test('invalid_json_and_bad_name_are_skipped_with_error', () => {
  const b = tmp();
  put(b, 'themes/ok.json', theme('ok'));
  put(b, 'themes/broken.json', '{ nope');
  put(b, 'themes/bad.json', theme('Bad Name'));
  put(b, 'themes/big.json', JSON.stringify(theme('big', { label: 'x'.repeat(300 * 1024) })));
  const c = loadCatalog({ builtinDir: b, userDir: tmp() });
  assert.deepEqual(c.themes.map((t) => t.name), ['ok']);
  assert.equal(c.errors.length, 3);
  assert.ok(c.errors.some((e) => e.includes('broken.json')));
  assert.ok(c.errors.some((e) => e.includes('bad.json')));
  assert.ok(c.errors.some((e) => e.includes('big.json')));
});

test('pack_with_subset_of_roles_lists_only_present_files', () => {
  const b = tmp();
  put(b, 'icons/cats/lead.svg', '<svg/>');
  put(b, 'icons/cats/lead-blink.svg', '<svg/>');
  put(b, 'icons/cats/code.svg', '<svg/>');
  put(b, 'icons/cats/other.svg', '<svg/>');
  put(b, 'icons/cats/notes.txt', 'x');
  const c = loadCatalog({ builtinDir: b, userDir: tmp() });
  assert.equal(c.packs.length, 1);
  assert.equal(c.packs[0].name, 'cats');
  assert.deepEqual(c.packs[0].roles, {
    lead: '/icons/cats/lead.svg', 'lead-blink': '/icons/cats/lead-blink.svg', code: '/icons/cats/code.svg',
  });
});

test('missing_directories_give_empty_catalog', () => {
  const c = loadCatalog({ builtinDir: path.join(os.tmpdir(), 'nope-1'), userDir: path.join(os.tmpdir(), 'nope-2') });
  assert.deepEqual(c, { themes: [], packs: [], errors: [] });
});

test('unknown_icon_pack_in_theme_falls_back_to_robot', () => {
  const b = tmp();
  put(b, 'themes/a.json', theme('a', { iconPack: 'Not A Pack' }));
  put(b, 'themes/b.json', theme('b'));
  const c = loadCatalog({ builtinDir: b, userDir: tmp() });
  assert.deepEqual(c.themes.map((t) => t.iconPack), ['robot', 'robot']);
});

test('raster_icons_are_listed_and_svg_wins_over_png_for_the_same_role', () => {
  const b = tmp();
  put(b, 'icons/mix/lead.png', 'png');
  put(b, 'icons/mix/lead.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  put(b, 'icons/mix/plan.gif', 'gif');
  put(b, 'icons/mix/plan-blink.webp', 'webp');
  put(b, 'icons/mix/test.bmp', 'bmp');
  const c = loadCatalog({ builtinDir: b, userDir: null });
  assert.deepEqual(c.packs[0].roles, { lead: '/icons/mix/lead.svg', plan: '/icons/mix/plan.gif', 'plan-blink': '/icons/mix/plan-blink.webp' });
});

test('raster_icon_over_1_mb_is_skipped_with_an_error', () => {
  const b = tmp();
  put(b, 'icons/big/lead.gif', Buffer.alloc(1024 * 1024 + 1).toString('latin1'));
  put(b, 'icons/big/plan.gif', 'ok');
  const c = loadCatalog({ builtinDir: b, userDir: null });
  assert.deepEqual(Object.keys(c.packs[0].roles), ['plan']);
  assert.equal(c.errors.length, 1);
});

test('role_variants_and_their_blink_files_are_listed', () => {
  const b = tmp();
  for (const f of ['explore.svg', 'explore-2.png', 'explore-2-blink.png', 'explore-12.gif', 'explore-1.svg', 'explore-100.svg', 'explore-x.svg']) put(b, `icons/v/${f}`, 'x');
  const c = loadCatalog({ builtinDir: b, userDir: null });
  assert.deepEqual(Object.keys(c.packs[0].roles).sort(), ['explore', 'explore-12', 'explore-2', 'explore-2-blink']);
});
