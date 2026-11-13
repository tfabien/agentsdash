import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFirstTheme } from '../market_bootstrap.mjs';

const theme = (name) => ({ name, source: 's/r' });

test('does_nothing_when_a_theme_exists', async () => {
  let listed = false;
  const r = await installFirstTheme({ sources: ['s/r'], hasTheme: () => true, list: async () => { listed = true; return { themes: [] }; }, install: async () => {} });
  assert.equal(r, null);
  assert.equal(listed, false);
});

test('installs_the_preferred_theme_else_the_first', async () => {
  const done = [];
  const list = async () => ({ themes: [theme('cat'), theme('robot')] });
  assert.equal(await installFirstTheme({ sources: ['s/r'], hasTheme: () => false, list, install: async (t) => done.push(t.name) }), 'robot');
  assert.equal(await installFirstTheme({ sources: ['s/r'], hasTheme: () => false, list: async () => ({ themes: [theme('cat')] }), install: async (t) => done.push(t.name) }), 'cat');
  assert.deepEqual(done, ['robot', 'cat']);
});

test('tries_the_next_source_after_a_failure_and_returns_null_when_all_fail', async () => {
  const list = async (s) => { if (s === 'bad/one') throw new Error('offline'); return { themes: [theme('robot')] }; };
  assert.equal(await installFirstTheme({ sources: ['bad/one', 'good/two'], hasTheme: () => false, list, install: async () => {} }), 'robot');
  assert.equal(await installFirstTheme({ sources: ['bad/one'], hasTheme: () => false, list, install: async () => {} }), null);
  assert.equal(await installFirstTheme({ sources: ['s/r'], hasTheme: () => false, list: async () => ({ themes: [theme('robot')] }), install: async () => { throw new Error('x'); } }), null);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.mjs';

test('first_theme_comes_from_env_then_file_then_robot', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'standup-cfg-')), 'c.json');
  assert.equal(loadConfig(file, {}).first_theme, 'robot');
  fs.writeFileSync(file, JSON.stringify({ theme: 'office-modern' }));
  assert.equal(loadConfig(file, {}).first_theme, 'office-modern');
  assert.equal(loadConfig(file, { CLAUDE_GADGET_THEME: 'cat' }).first_theme, 'cat');
  assert.equal(loadConfig(file, { CLAUDE_GADGET_THEME: '../x' }).first_theme, 'office-modern');
});
