import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR, rgb565 } from '../web/screen.js';
import { THEMES, applyTheme, validateTheme, activeTheme, activeIconPack, activeAccent, setCatalog } from '../web/themes.js';
import { ICON_PACKS, iconPack, iconPackFor, svgPack, variantKey, setAccent, setLooks, lookFor, currentLooks, swapPalette, clearIconCache } from '../web/icon_packs.js';
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

test('variantKey_is_stable_per_agent_and_uses_every_variant', () => {
  const roles = { lead: '/a', 'lead-2': '/b', 'lead-3': '/c', 'lead-blink': '/d', 'general-2': '/e' };
  assert.equal(variantKey(roles, 'lead', undefined), 'lead', 'no agent id: the first variant');
  assert.equal(variantKey(roles, 'lead', 'ab12'), variantKey(roles, 'lead', 'ab12'));
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(variantKey(roles, 'lead', `a${i}`));
  assert.deepEqual([...seen].sort(), ['lead', 'lead-2', 'lead-3']);
  assert.equal(variantKey(roles, 'general', 'zz'), 'general-2', 'only a numbered file');
  assert.equal(variantKey(roles, 'plan', 'zz'), 'plan', 'no file at all: the key, so the robot is drawn');
});

test('svg_pack_draws_the_variant_and_the_blink_of_that_variant', () => {
  stubImage(true);
  const pack = svgPack('p', { lead: '/l1.svg', 'lead-2': '/l2.svg', 'lead-2-blink': '/l2b.svg' });
  const id = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].find((x) => variantKey({ lead: 1, 'lead-2': 1 }, 'lead', x) === 'lead-2');
  let r = recordingCtx();
  pack.draw(r.ctx, 0, false, id);
  assert.equal(r.calls[0].args[0].src, '/l2.svg');
  r = recordingCtx();
  pack.draw(r.ctx, 0, true, id);
  assert.equal(r.calls[0].args[0].src, '/l2b.svg');
  stubImage(false);
});

// ---- marketplace metadata ----
import { compareVersions } from '../web/theme_schema.js';

test('validateTheme_keeps_and_cuts_description_and_keywords', () => {
  const ok = (extra) => validateTheme({ name: 'x', colors: {}, ...extra }).theme;
  assert.equal(ok({ description: 'a'.repeat(201) }).description.length, 200);
  assert.deepEqual(ok({ keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }).keywords.length, 8);
  assert.deepEqual(ok({ keywords: ['ok', 7, 'x'.repeat(30)] }).keywords, ['ok', 'x'.repeat(24)]);
  assert.equal(ok({}).description, '');
  assert.deepEqual(ok({}).keywords, []);
});

test('compareVersions_orders_dotted_numbers', () => {
  assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1', '2'), -1);
  assert.equal(compareVersions('beta', 'beta'), 0);
  assert.equal(compareVersions('beta', 'rc'), 1);
  assert.equal(compareVersions('', '1'), -1);
});

// ---- variants and accent ----
const variantTheme = { name: 'vt', label: 'vt', author: 't', version: '1', iconPack: 'robot', accent: '#ff0000', colors: { FRAME: '#111111' },
  variants: { dark: { label: 'Dark', colors: { FRAME: '#222222' }, accent: '' }, light: { label: 'Light', colors: {}, accent: '#0000ff' } } };
const frame = () => ({ ...COLOR }).FRAME;
const rgbOf = (hex) => { applyTheme({ name: 'x', colors: { FRAME: hex } }); return frame(); };

test('applyTheme_applies_variant_colors', () => {
  setCatalog({ themes: [variantTheme], packs: [] });
  applyTheme('vt', 'dark');
  assert.equal(frame(), rgbOf('#222222'));
});

test('applyTheme_applies_override_of_the_exact_variant_key_only', () => {
  setCatalog({ themes: [variantTheme], packs: [] });
  const overrides = { 'vt/dark': { colors: { FRAME: '#abcdef' } } };
  applyTheme('vt', 'dark', overrides);
  assert.equal(frame(), rgbOf('#abcdef'));
  setCatalog({ themes: [variantTheme], packs: [] });
  applyTheme('vt', 'light', overrides);
  assert.equal(frame(), rgbOf('#111111'));
  applyTheme('vt', '', overrides);
  assert.equal(frame(), rgbOf('#111111'));
});

test('applyTheme_ignores_overrides_of_unknown_theme_or_variant', () => {
  setCatalog({ themes: [variantTheme], packs: [] });
  applyTheme('vt', 'nope', { 'ghost/x': { colors: { FRAME: '#abcdef' } }, 'vt/nope': { colors: { FRAME: '#abcdef' } } });
  assert.equal(frame(), rgbOf('#111111'));
});

test('activeAccent_follows_variant_then_theme', () => {
  setCatalog({ themes: [variantTheme], packs: [] });
  applyTheme('vt');
  assert.equal(activeAccent(), '#ff0000');
  applyTheme('vt', 'dark');
  assert.equal(activeAccent(), '#ff0000');
  applyTheme('vt', 'light');
  assert.equal(activeAccent(), '#0000ff');
  applyTheme('default');
  assert.equal(activeAccent(), '');
});

function filterCtx() {
  const calls = [];
  let filter = 'none';
  const ctx = { get filter() { return filter; }, set filter(v) { filter = v; }, save() {}, restore() { filter = 'none'; }, drawImage(...a) { calls.push({ filter, a }); } };
  return { ctx, calls };
}

test('svgPack_hue_mode_sets_ctx_filter_with_the_hue_difference', () => {
  stubImage(true);
  const pack = svgPack('p', { lead: '/l.png' }, { tint: 'hue', hue: 120 });
  setAccent('#0000ff');                                       // hue 240
  const r = filterCtx();
  pack.draw(r.ctx, 0, false);
  assert.equal(r.calls[0].filter, 'hue-rotate(120deg)');
  setAccent('');
  delete globalThis.Image;
});

test('svgPack_none_mode_never_sets_a_filter', () => {
  stubImage(true);
  const pack = svgPack('p', { lead: '/l.png' });
  setAccent('#0000ff');
  const r = filterCtx();
  pack.draw(r.ctx, 0, false);
  assert.equal(r.calls[0].filter, 'none');
  setAccent('');
  delete globalThis.Image;
});

// ---- looks ----
const looksTheme = { name: 'lt', label: 'lt', author: 't', version: '1', iconPack: 'robot', colors: {},
  looks: { a: { label: 'A', sprite: null, accent: '' }, b: { label: 'B', sprite: 2, accent: '#0000ff' }, c: { label: 'C', sprite: null, accent: '#ff0000' } }, defaultLooks: ['a', 'b'] };
const L = [{ key: 'a', sprite: null, accent: '' }, { key: 'b', sprite: 2, accent: '#0000ff' }, { key: 'c', sprite: null, accent: '#ff0000' }];

test('lookFor_is_stable_per_agent_and_uses_every_look', () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) { const k = lookFor(L, `agent-${i}`).key; assert.equal(k, lookFor(L, `agent-${i}`).key); seen.add(k); }
  assert.equal(seen.size, 3);
});

test('lookFor_without_agent_id_uses_the_first_look_and_nothing_without_looks', () => {
  assert.equal(lookFor(L, undefined).key, 'a');
  assert.equal(lookFor([], 'x'), null);
});

test('variantKey_with_sprite_picks_the_numbered_file_or_falls_back', () => {
  const roles = { lead: '/a', 'lead-2': '/b', general: '/c' };
  assert.equal(variantKey(roles, 'lead', 'x', 2), 'lead-2');
  assert.equal(variantKey(roles, 'lead', 'x', 1), 'lead');
  assert.equal(variantKey(roles, 'general', 'x', 2), 'general', 'no such number: the unnumbered file');
  assert.equal(variantKey(roles, 'lead', 'x', 3), 'lead');
});

test('svgPack_look_sprite_draws_the_numbered_file', () => {
  const made = stubImage(true);
  const pack = svgPack('p', { lead: '/l1.png', 'lead-2': '/l2.png' });
  setLooks([{ key: 'b', sprite: 2, accent: '' }]);
  const r = recordingCtx();
  pack.draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].args[0].src, '/l2.png');
  setLooks([]);
  assert.equal(made.length, 1);
  delete globalThis.Image;
});

test('svgPack_look_accent_sets_the_hue_filter_for_that_agent_and_none_mode_ignores_it', () => {
  stubImage(true);
  setLooks([{ key: 'c', sprite: null, accent: '#0000ff' }]);
  let r = filterCtx();
  svgPack('p', { lead: '/l.png' }, { tint: 'hue', hue: 120 }).draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].filter, 'hue-rotate(120deg)');
  r = filterCtx();
  svgPack('p', { lead: '/l.png' }).draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].filter, 'none');
  setLooks([]);
  delete globalThis.Image;
});

test('applyTheme_sets_the_active_looks_from_chosen_then_default', () => {
  setCatalog({ themes: [looksTheme], packs: [] });
  const seen = (chosen) => { applyTheme('lt', '', {}, chosen); const out = new Set(); for (let i = 0; i < 40; i++) out.add(lookFor(currentLooks(), `x${i}`).key); return [...out].sort().join(); };
  assert.equal(seen(undefined), 'a,b');
  assert.equal(seen(['c']), 'c');
  applyTheme('default');
});

// ---- palette swaps ----
// A 4 pixel image: brown hair, semi-transparent brown, skin, transparent brown.
const PIXELS = () => new Uint8ClampedArray([0x3b, 0x24, 0x1c, 255, 0x3b, 0x24, 0x1c, 128, 0xf2, 0xcf, 0xae, 255, 0x3b, 0x24, 0x1c, 0]);
const BLOND = { '#3b241c': '#6b4b12' };
function pixelStubs({ failRead = false } = {}) {
  const made = [];
  globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 2; this.naturalHeight = 2; this.pixels = PIXELS(); made.push(this); } };
  const canvases = [];
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.pixels = new Uint8ClampedArray(w * h * 4); canvases.push(this); }
    getContext() {
      const c = this;
      return {
        drawImage(img) { c.pixels.set(img.pixels); },
        getImageData() { if (failRead) throw new Error('tainted'); return { data: c.pixels }; },
        putImageData() {},
      };
    }
  };
  return { made, canvases };
}
const unstub = () => { delete globalThis.Image; delete globalThis.OffscreenCanvas; setLooks([]); setAccent(''); clearIconCache(); };
const palettePack = (extra = {}) => svgPack('p', { lead: '/l1.png', 'lead-2': '/l2.png' }, { palettes: { 'hair-blond': BLOND, 'hair-red': { '#3b241c': '#8d3424' } }, ...extra });
const lk = (palette, sprite = null, accent = '') => ({ key: palette ?? 'plain', sprite, accent, ...(palette ? { palette } : {}) });

test('swapPalette_replaces_exact_rgb_keeps_alpha_and_unmapped_pixels', () => {
  const px = swapPalette(PIXELS(), BLOND);
  assert.deepEqual([...px], [0x6b, 0x4b, 0x12, 255, 0x6b, 0x4b, 0x12, 128, 0xf2, 0xcf, 0xae, 255, 0x6b, 0x4b, 0x12, 0]);
  const near = swapPalette(new Uint8ClampedArray([0x3b, 0x24, 0x1d, 255]), BLOND);
  assert.deepEqual([...near], [0x3b, 0x24, 0x1d, 255], 'one unit off: no match');
});

test('svgPack_look_palette_draws_the_swapped_image_and_leaves_the_source_alone', () => {
  const { made } = pixelStubs();
  setLooks([lk('hair-blond')]);
  const r = recordingCtx();
  palettePack().draw(r.ctx, 0, false, 'agent');
  const drawn = r.calls[0].args[0];
  assert.deepEqual([...drawn.pixels.slice(0, 4)], [0x6b, 0x4b, 0x12, 255]);
  assert.deepEqual([...made[0].pixels.slice(0, 4)], [0x3b, 0x24, 0x1c, 255], 'the loaded image is untouched');
  assert.deepEqual(r.calls[0].args.slice(1), [0, 0, 36, 42], 'drawn through the usual 36x42 path');
  unstub();
});

test('svgPack_without_palette_or_with_an_unknown_one_draws_the_original_image', () => {
  const { made } = pixelStubs();
  for (const look of [lk(null), lk('ghost'), lk('constructor')]) {
    setLooks([look]);
    const r = recordingCtx();
    palettePack().draw(r.ctx, 0, false, 'agent');
    assert.equal(r.calls[0].args[0], made[0]);
  }
  unstub();
});

test('svgPack_palette_cache_has_one_entry_per_url_and_palette_and_clearIconCache_empties_it', () => {
  const { canvases } = pixelStubs();
  const pack = palettePack();
  const draw = (look) => { setLooks([look]); const r = recordingCtx(); pack.draw(r.ctx, 0, false, 'agent'); return r.calls[0].args[0]; };
  const blond = draw(lk('hair-blond'));
  assert.equal(draw(lk('hair-blond')), blond, 'cached');
  const red = draw(lk('hair-red'));
  assert.notEqual(red, blond);
  assert.deepEqual([...red.pixels.slice(0, 3)], [0x8d, 0x34, 0x24]);
  assert.notEqual(draw(lk('hair-blond', 2)), blond, 'another sprite is another entry');
  assert.equal(canvases.length, 3);
  clearIconCache();
  assert.notEqual(draw(lk('hair-blond')), blond, 'rebuilt after the cache was cleared');
  unstub();
});

test('svgPack_palette_falls_back_to_the_original_when_pixels_cannot_be_read', () => {
  const { made } = pixelStubs({ failRead: true });
  setLooks([lk('hair-blond')]);
  const r = recordingCtx();
  palettePack().draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].args[0], made[0]);
  unstub();
});

test('svgPack_look_combines_sprite_palette_and_accent_then_hue_tint', () => {
  pixelStubs();
  setLooks([lk('hair-blond', 2, '#0000ff')]);
  let filter = 'none';
  const calls = [];
  const ctx = { get filter() { return filter; }, set filter(v) { filter = v; }, save() {}, restore() { filter = 'none'; }, drawImage(img) { calls.push({ img, filter }); } };
  palettePack({ tint: 'hue', hue: 120 }).draw(ctx, 0, false, 'agent');
  assert.deepEqual([...calls[0].img.pixels.slice(0, 3)], [0x6b, 0x4b, 0x12], 'palette applied');
  assert.equal(calls[0].filter, 'hue-rotate(120deg)', 'then the hue tint on the swapped image');
  unstub();
});

test('svgPack_palette_leaves_svg_files_unchanged', () => {
  pixelStubs();
  setLooks([lk('hair-blond')]);
  const r = recordingCtx();
  svgPack('p', { lead: '/l.svg' }, { palettes: { 'hair-blond': BLOND } }).draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].args[0].src, '/l.svg');
  unstub();
});

test('svgPack_palette_look_is_stable_per_agent_and_covers_every_look', () => {
  const { canvases } = pixelStubs();
  setLooks([lk(null), lk('hair-blond'), lk('hair-red')]);
  const pack = palettePack();
  const pixelOf = (id) => { const r = recordingCtx(); pack.draw(r.ctx, 0, false, id); return r.calls[0].args[0].pixels[0]; };
  const first = Array.from({ length: 40 }, (_, i) => pixelOf(`agent-${i}`));
  assert.deepEqual(first, Array.from({ length: 40 }, (_, i) => pixelOf(`agent-${i}`)));
  assert.equal(new Set(first).size, 3, 'original, blond and red all appear');
  assert.equal(canvases.length, 4, 'two palettes x two numbered files (the hash also picks the file), never more');
  unstub();
});

test('svgPack_palette_with_an_animated_extension_never_throws_and_draws_an_image', () => {
  pixelStubs();                                                // no ImageDecoder: the animation settles as static and the first frame is drawn
  setLooks([lk('hair-blond')]);
  const r = recordingCtx();
  svgPack('p', { lead: '/l.gif' }, { palettes: { 'hair-blond': BLOND } }).draw(r.ctx, 0, false, 'agent');
  assert.equal(r.calls[0].name, 'drawImage');
  unstub();
});

test('setCatalog_hands_pack_palettes_to_the_pack', () => {
  pixelStubs();
  setCatalog({ themes: [], packs: [{ name: 'pp', roles: { lead: '/icons/pp/lead.png' }, tint: 'none', hue: 0, palettes: { 'hair-blond': BLOND } }] });
  setLooks([lk('hair-blond')]);
  const r = recordingCtx();
  iconPackFor('pp').draw(r.ctx, 0, false, 'agent');
  assert.deepEqual([...r.calls[0].args[0].pixels.slice(0, 3)], [0x6b, 0x4b, 0x12]);
  setCatalog({ themes: [], packs: [] });
  unstub();
});
