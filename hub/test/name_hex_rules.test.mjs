// The name rule (themes, packs, variants, looks) and the #rrggbb rule live once, in web/theme_schema.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isName, NAME_RULE, OVERRIDE_KEY, isHex } from '../web/theme_schema.js';
import { validRule } from '../web/rules.js';

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('isName_accepts_a_z_0_9_dash_up_to_32', () => {
  assert.equal(isName('robot'), true);
  assert.equal(isName('my-pack2'), true);
  assert.equal(isName('a'.repeat(32)), true);
  for (const bad of ['', '../x', 'A', 'a b', 'a'.repeat(33), 5, null, undefined]) assert.equal(isName(bad), false, String(bad));
  assert.equal(NAME_RULE, '1 to 32 characters among a-z, 0-9 and -');
});

test('override_key_is_a_theme_or_theme_slash_variant', () => {
  assert.equal(OVERRIDE_KEY.test('robot'), true);
  assert.equal(OVERRIDE_KEY.test('robot/dark'), true);
  assert.equal(OVERRIDE_KEY.test('robot/'), false);
  assert.equal(OVERRIDE_KEY.test('a/b/c'), false);
  assert.equal(OVERRIDE_KEY.test('Robot/dark'), false);
});

test('isHex_accepts_rrggbb_in_any_case', () => {
  assert.equal(isHex('#abcdef'), true);
  assert.equal(isHex('#ABCDEF'), true);
  for (const bad of ['#abc', 'red', '#abcdefa', 'abcdef', 5, undefined]) assert.equal(isHex(bad), false, String(bad));
});

test('validRule_checks_one_rule', () => {
  assert.equal(validRule({ match: '/a', badgeColor: '#ABCDEF' }), true);
  assert.equal(validRule({ match: '/a', badgeColor: '#abc' }), false);
  assert.equal(validRule({ match: '/a', iconPack: 'Bad Pack' }), false);
  assert.equal(validRule({ match: '/a', iconPack: 'cats' }), true);
  assert.equal(validRule({ match: '' }), false);
  assert.equal(validRule(null), false);
});

test('name_and_hex_patterns_are_written_only_in_theme_schema', () => {
  const files = [
    ...fs.readdirSync(HUB).filter((f) => f.endsWith('.mjs')).map((f) => path.join(HUB, f)),
    ...fs.readdirSync(path.join(HUB, 'web')).filter((f) => f.endsWith('.js')).map((f) => path.join(HUB, 'web', f)),
  ];
  const hits = (re) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(HUB, f).replace(/\\/g, '/'));
  assert.deepEqual(hits(/a-z0-9-\]\{1,32\}/), ['web/theme_schema.js']);
  assert.deepEqual(hits(/#\[0-9a-f(A-F)?\]\{6\}/), ['web/theme_schema.js']);
  assert.deepEqual(hits(/1 to 32 characters/), ['web/theme_schema.js']);
});
