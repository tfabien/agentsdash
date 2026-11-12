import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, validRules } from '../rules.mjs';

test('matches_path_prefix', () => {
  const r = { match: '/work/prod-api', iconPack: 'cats' };
  assert.equal(matchRule([r], '/work/prod-api'), r);
  assert.equal(matchRule([r], '/work/prod-api/src/x'), r);
  assert.equal(matchRule([r], '/work/prod-api2'), null);
  assert.equal(matchRule([r], '/work'), null);
});

test('matches_glob_star', () => {
  const r = { match: '/work/*/api' };
  assert.equal(matchRule([r], '/work/a/api'), r);
  assert.equal(matchRule([r], '/work/a/b/api'), null);
  const d = { match: '/work/**/api' };
  assert.equal(matchRule([d], '/work/a/b/api'), d);
  const q = { match: '/w/?x' };
  assert.equal(matchRule([q], '/w/ax'), q);
  assert.equal(matchRule([q], '/w/abx'), null);
});

test('first_rule_wins', () => {
  const a = { match: '/work' }, b = { match: '/work/api' };
  assert.equal(matchRule([a, b], '/work/api'), a);
  assert.equal(matchRule([b, a], '/work/api'), b);
});

test('windows_path_matches_forward_slash_rule', () => {
  const r = { match: 'c:/work/prod-api' };
  assert.equal(matchRule([r], 'C:\\Work\\Prod-api'), r);
  assert.equal(matchRule([r], 'C:\\Work\\Prod-api\\src'), r);
});

test('no_cwd_matches_nothing', () => {
  const r = { match: '**' };
  assert.equal(matchRule([r], ''), null);
  assert.equal(matchRule([r], undefined), null);
  assert.equal(matchRule(undefined, '/x'), null);
});

test('validRules_rejects_bad_color_and_non_array', () => {
  assert.equal(validRules([{ match: '/a', iconPack: 'p', badgeColor: '#aBc123' }]), true);
  assert.equal(validRules([]), true);
  assert.equal(validRules({}), false);
  assert.equal(validRules(null), false);
  assert.equal(validRules([{ match: '/a', badgeColor: 'red' }]), false);
  assert.equal(validRules([{ match: '/a', badgeColor: '#abc' }]), false);
  assert.equal(validRules([{ iconPack: 'p' }]), false);
  assert.equal(validRules([{ match: '' }]), false);
  assert.equal(validRules([{ match: '/a', iconPack: 5 }]), false);
  assert.equal(validRules([null]), false);
});
