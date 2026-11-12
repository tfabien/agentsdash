import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR, rgb565 } from '../web/screen.js';
import { THEMES, applyTheme, validateTheme, activeTheme, activeIconPack, setCatalog } from '../web/themes.js';
import { ICON_PACKS, iconPack, iconPackFor, svgPack } from '../web/icon_packs.js';
import { createVectorScreen } from '../web/vector_screen.js';

function fakeCanvas() {
  const calls = [];
  const props = {};
  const ctx = new Proxy({}, {
    get(_, name) {
      if (name === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (name in props) return props[name];
      return (...args) => { calls.push({ name, args, fillStyle: props.fillStyle }); };
    },
    set(_, name, value) { props[name] = value; return true; },
  });
  return { canvas: { getContext: () => ctx }, calls };
}

test.afterEach(() => applyTheme('default'));

test('the_default_theme_keeps_the_palette_of_the_firmware', () => {
  const before = { ...COLOR };
  applyTheme('cat');
  assert.notEqual(COLOR.FRAME, before.FRAME);
  applyTheme('default');
  assert.deepEqual({ ...COLOR }, before);
});

test('cat_lemmings_office_and_pirates_change_every_color_and_the_icon_pack', () => {
  const base = { ...COLOR };
  for (const name of ['cat', 'lemmings', 'office', 'pirates']) {
    applyTheme(name);
    assert.equal(activeTheme().name, name);
    assert.equal(activeTheme().iconPack, name);
    assert.equal(activeIconPack(), ICON_PACKS[name]);
    for (const key of Object.keys(base)) assert.notEqual(COLOR[key], base[key], `${name}: ${key} is themed`);
  }
});

test('an_unknown_theme_name_falls_back_to_the_default', () => {
  applyTheme('cat');
  applyTheme('nope');
  assert.equal(activeTheme().name, 'default');
  assert.equal(activeIconPack(), ICON_PACKS.robot);
});

test('a_missing_theme_setting_falls_back_to_the_default', () => {
  applyTheme('cat');
  applyTheme(undefined);
  assert.equal(activeTheme().name, 'default');
});

test('a_missing_color_keeps_the_builtin_value_and_a_bad_one_is_dropped', () => {
  const base = { ...COLOR };
  const r = validateTheme({ name: 'mine', colors: { FRAME: '#ff0000', TEXT: 'red', BOGUS: '#000000' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ignored, ['TEXT']);
  assert.deepEqual(r.theme.colors, { FRAME: '#ff0000' });
  applyTheme(r.theme);
  assert.deepEqual(rgb565(COLOR.FRAME), [255, 0, 0]);
  assert.equal(COLOR.TEXT, base.TEXT);
  assert.equal(COLOR.PANEL, base.PANEL);
});

test('an_unknown_icon_pack_gives_the_robots', () => {
  assert.equal(validateTheme({ name: 'x', iconPack: 'ghost', colors: {} }).theme.iconPack, 'ghost', 'a well-formed name is kept, the catalog resolves it');
  assert.equal(validateTheme({ name: 'x', iconPack: 'Bad Pack', colors: {} }).theme.iconPack, 'robot');
  assert.equal(iconPack('ghost'), ICON_PACKS.robot);
});

test('an_invalid_theme_is_rejected', () => {
  for (const bad of [null, 'cat', [], {}, { name: 'Bad Name', colors: {} }, { name: 'ok' }, { name: 'ok', colors: [] }, { name: 'a'.repeat(33), colors: {} }]) {
    assert.equal(validateTheme(bad).ok, false, JSON.stringify(bad));
  }
});

test('every_icon_of_every_pack_draws_in_the_box_for_every_role_and_blink', () => {
  for (const [name, pack] of Object.entries(ICON_PACKS)) {
    for (let role = 0; role < 8; role++) for (const blink of [false, true]) {
      const { canvas, calls } = fakeCanvas();
      pack.draw(canvas.getContext('2d'), role, blink);
      assert.ok(calls.filter((c) => c.name === 'fill' || c.name === 'stroke').length >= 3, `${name} role ${role}`);
    }
  }
});

test('the_vector_screen_draws_with_the_pack_of_the_active_theme', () => {
  const eyes = (blink) => { const { canvas, calls } = fakeCanvas(); createVectorScreen(canvas).pic(blink ? 63 : 27, 0, 0); return calls; };
  const robot = eyes(false).length;
  applyTheme('lemmings');
  assert.notEqual(eyes(false).length, robot, 'another pack draws other shapes');
  assert.ok(eyes(true).some((c) => c.name === 'lineTo'), 'blink draws lines');
});

// ---- catalog from the hub ----
function stubImage(loaded) {
  const made = [];
  globalThis.Image = class { constructor() { this.complete = loaded; this.naturalWidth = loaded ? 36 : 0; made.push(this); } };
  return made;
}
function recordingCtx() {
  const calls = [];
  const props = {};
  const ctx = new Proxy({}, {
    get(_, name) { return name in props ? props[name] : (...args) => { calls.push({ name, args }); }; },
    set(_, name, value) { props[name] = value; return true; },
  });
  return { ctx, calls };
}
const catalogTheme = (name, pack) => ({ name, label: name, author: 't', version: '1', iconPack: pack, colors: { FRAME: '#123456' } });

test('setCatalog_adds_a_theme_and_applyTheme_uses_it', () => {
  const before = { ...COLOR };
  setCatalog({ themes: [catalogTheme('mine', 'robot')], packs: [], errors: [] });
  assert.equal(applyTheme('mine').name, 'mine');
  assert.notEqual(COLOR.FRAME, before.FRAME);
  const mine = COLOR.FRAME;
  setCatalog({ themes: [catalogTheme('cat', 'robot')], packs: [] });
  applyTheme('cat');
  assert.equal(COLOR.FRAME, mine, 'the catalog wins over the built-in table');
  assert.equal(activeTheme().iconPack, 'robot');
  setCatalog({ themes: [], packs: [] });
  applyTheme('default');
});

test('unknown_pack_gives_robot', () => {
  setCatalog({ themes: [catalogTheme('mine', 'ghost')], packs: [{ name: 'cat', roles: {} }] });
  assert.equal(iconPackFor('ghost'), ICON_PACKS.robot);
  applyTheme('mine');
  assert.equal(activeIconPack(), ICON_PACKS.robot);
  assert.notEqual(iconPackFor('cat'), ICON_PACKS.robot, 'a listed pack is an SVG pack');
});

test('svg_pack_missing_role_draws_robot', () => {
  const made = stubImage(true);
  const pack = svgPack('p', { lead: '/icons/p/lead.svg', 'lead-blink': '/icons/p/lead-blink.svg' });
  let r = recordingCtx();
  pack.draw(r.ctx, 0, false);
  assert.deepEqual(r.calls.map((c) => c.name), ['drawImage']);
  assert.deepEqual(r.calls[0].args.slice(1), [0, 0, 36, 42]);
  r = recordingCtx();
  pack.draw(r.ctx, 0, true);
  assert.equal(r.calls[0].args[0].src, '/icons/p/lead-blink.svg');
  r = recordingCtx();
  pack.draw(r.ctx, 1, false);                              // 'general' has no file
  assert.ok(r.calls.length > 1 && r.calls.every((c) => c.name !== 'drawImage'), 'the robot is drawn on the canvas');
  assert.equal(made.length, 2);
  stubImage(false);
  const late = svgPack('q', { lead: '/icons/q/lead.svg' });
  r = recordingCtx();
  late.draw(r.ctx, 0, false);
  assert.ok(r.calls.every((c) => c.name !== 'drawImage'), 'an image not loaded yet draws the robot');
  delete globalThis.Image;
});
