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
