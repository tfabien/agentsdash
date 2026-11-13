import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTheme, resolvePalette, hueOf, contrastRatio } from '../web/theme_schema.js';

const base = { name: 'cat', colors: { TEXT: '#ffffff', FRAME: '#112233' } };

test('validateTheme_keeps_accent_and_variants', () => {
  const r = validateTheme({ ...base, accent: '#FF0000', variants: { dark: { label: 'Dark', colors: { TEXT: '#000000' }, accent: '#00ff00' } } });
  assert.equal(r.theme.accent, '#ff0000');
  assert.deepEqual(r.theme.variants.dark, { label: 'Dark', colors: { TEXT: '#000000' }, accent: '#00ff00' });
});

test('validateTheme_drops_bad_variant_keys_and_lists_them_in_ignored', () => {
  const r = validateTheme({ ...base, variants: { 'Bad Name': {}, ok: { colors: { TEXT: 'red', NOPE: '#000000' } } } });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.theme.variants), ['ok']);
  assert.ok(r.ignored.includes('variants.Bad Name') && r.ignored.includes('variants.ok.TEXT'));
});

test('validateTheme_caps_variants_at_12', () => {
  const variants = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`v${i}`, { colors: {} }]));
  assert.equal(Object.keys(validateTheme({ ...base, variants }).theme.variants).length, 12);
});

test('validateTheme_without_variants_is_unchanged', () => {
  const t = validateTheme(base).theme;
  assert.equal(t.accent, '');
  assert.deepEqual(t.variants, {});
});

test('resolvePalette_orders_theme_variant_override', () => {
  const t = validateTheme({ ...base, variants: { dark: { colors: { TEXT: '#000000', FRAME: '#445566' } } } }).theme;
  const p = resolvePalette(t, 'dark', { colors: { FRAME: '#abcdef' } });
  assert.deepEqual(p.colors, { TEXT: '#000000', FRAME: '#abcdef' });
});

test('resolvePalette_unknown_variant_is_the_base', () => {
  const t = validateTheme(base).theme;
  assert.deepEqual(resolvePalette(t, 'nope').colors, t.colors);
});

test('resolvePalette_accent_falls_back_override_variant_theme', () => {
  const t = validateTheme({ ...base, accent: '#111111', variants: { a: { accent: '#222222' }, b: {} } }).theme;
  assert.equal(resolvePalette(t, 'a', { accent: '#333333' }).accent, '#333333');
  assert.equal(resolvePalette(t, 'a').accent, '#222222');
  assert.equal(resolvePalette(t, 'b').accent, '#111111');
  assert.equal(resolvePalette(validateTheme(base).theme, '').accent, '');
});

test('hueOf_pure_colors', () => {
  assert.equal(hueOf('#ff0000'), 0);
  assert.equal(hueOf('#00ff00'), 120);
  assert.equal(hueOf('#0000ff'), 240);
  assert.equal(hueOf('#808080'), 0);
});

test('contrastRatio_black_on_white_is_21', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

import { toHex } from '../web/theme_editor.js';
test('toHex_reads_hex_and_rgb_css_colors', () => {
  assert.equal(toHex('#a1b2c3'), '#a1b2c3');
  assert.equal(toHex('rgb(255,0,16)'), '#ff0010');
  assert.equal(toHex('nonsense'), '#000000');
});

import { activeLooks } from '../web/theme_schema.js';
const withLooks = { name: 'lk', colors: {}, looks: { a: { label: 'A' }, b: { label: 'B', sprite: 2, accent: '#FF0000' }, c: { sprite: 3 } }, defaultLooks: ['a', 'b', 'ghost'] };

test('validateTheme_keeps_looks_and_default_looks', () => {
  const t = validateTheme(withLooks).theme;
  assert.deepEqual(t.looks.b, { label: 'B', sprite: 2, accent: '#ff0000' });
  assert.deepEqual(t.looks.a, { label: 'A', sprite: null, accent: '' });
  assert.equal(t.looks.c.label, 'c');
});

test('validateTheme_default_looks_keep_only_existing_keys', () => {
  assert.deepEqual(validateTheme(withLooks).theme.defaultLooks, ['a', 'b']);
});

test('validateTheme_drops_bad_look_fields_and_lists_them', () => {
  const r = validateTheme({ name: 'lk', colors: {}, looks: { x: { sprite: 0, accent: 'red' }, y: { sprite: 100 }, z: { sprite: 1.5 }, w: { sprite: '2' }, 'Bad Key': {}, n: null } });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.theme.looks).sort(), ['w', 'x', 'y', 'z']);
  assert.ok(Object.values(r.theme.looks).every((l) => l.sprite === null && l.accent === ''));
  for (const k of ['looks.x.sprite', 'looks.x.accent', 'looks.y.sprite', 'looks.Bad Key', 'looks.n']) assert.ok(r.ignored.includes(k), k);
});

test('validateTheme_caps_looks_at_12', () => {
  const looks = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`l${i}`, {}]));
  assert.equal(Object.keys(validateTheme({ name: 'lk', colors: {}, looks }).theme.looks).length, 12);
});

test('activeLooks_prefers_chosen_then_default_then_all', () => {
  const t = validateTheme(withLooks).theme;
  assert.deepEqual(activeLooks(t, ['c']).map((l) => l.key), ['c']);
  assert.deepEqual(activeLooks(t, ['b', 'a']).map((l) => l.key), ['a', 'b'], 'declaration order');
  assert.deepEqual(activeLooks(t).map((l) => l.key), ['a', 'b']);
  assert.deepEqual(activeLooks(validateTheme({ ...withLooks, defaultLooks: undefined }).theme).map((l) => l.key), ['a', 'b', 'c']);
});

test('activeLooks_ignores_unknown_chosen_keys', () => {
  const t = validateTheme(withLooks).theme;
  assert.deepEqual(activeLooks(t, ['ghost']).map((l) => l.key), ['a', 'b']);
  assert.deepEqual(activeLooks(t, []).map((l) => l.key), ['a', 'b']);
});

test('activeLooks_is_empty_without_looks', () => {
  assert.deepEqual(activeLooks(validateTheme({ name: 'x', colors: {} }).theme), []);
});
