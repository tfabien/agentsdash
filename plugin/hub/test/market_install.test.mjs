import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installTheme, removeTheme, readInstalled } from '../market_install.mjs';

const RAW = 'https://raw.githubusercontent.com/o/r/main';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'standup-market-'));
const themeJson = (name, version = '1.0.0') => JSON.stringify({ name, version, label: name, colors: { FRAME: '#112233' } });
const entry = (name, files, version = '1.0.0') => ({ source: 'o/r', name, branch: 'main', version, files });

/** Serves `files` (path under the branch -> Buffer or string); a missing path is a 404. */
const fakeRaw = (files) => async (url) => {
  const body = files[url.slice(RAW.length + 1)];
  return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
};
const none = new Set();

test('install_writes_theme_icons_and_the_log', async () => {
  const userDir = tmp();
  const f = fakeRaw({ 'cat/theme.json': themeJson('cat', '2.0.0'), 'cat/icons/lead.png': Buffer.from('png'), 'cat/icons/lead-blink.png': Buffer.from('png2') });
  const r = await installTheme({ theme: entry('cat', ['icons/lead.png', 'icons/lead-blink.png', 'icons/other.txt', 'icons/sub/lead.png', 'preview.png']), userDir, builtinNames: none, fetchFn: f });
  assert.deepEqual(r, { version: '2.0.0' });
  const saved = JSON.parse(fs.readFileSync(path.join(userDir, 'themes', 'cat.json'), 'utf8'));
  assert.equal(saved.iconPack, 'cat');
  assert.deepEqual(fs.readdirSync(path.join(userDir, 'icons', 'cat')).sort(), ['lead-blink.png', 'lead.png']);
  assert.equal(readInstalled(userDir).cat.source, 'o/r');
  assert.equal(readInstalled(userDir).cat.version, '2.0.0');
  assert.deepEqual(fs.readdirSync(userDir).filter((n) => n.startsWith('.market-tmp')), []);
});

test('a_built_in_name_is_refused', async () => {
  const userDir = tmp();
  await assert.rejects(installTheme({ theme: entry('default', []), userDir, builtinNames: new Set(['default']), fetchFn: fakeRaw({}) }), /built-in/);
});

test('a_failed_update_keeps_the_installed_version_and_leaves_no_temp_folder', async () => {
  const userDir = tmp();
  await installTheme({ theme: entry('cat', ['icons/lead.png']), userDir, builtinNames: none, fetchFn: fakeRaw({ 'cat/theme.json': themeJson('cat', '1.0.0'), 'cat/icons/lead.png': 'old' }) });
  const before = fs.readFileSync(path.join(userDir, 'themes', 'cat.json'), 'utf8');
  const f = fakeRaw({ 'cat/theme.json': themeJson('cat', '1.1.0'), 'cat/icons/lead.png': 'new' });   // lead-blink.png is missing: 404
  await assert.rejects(installTheme({ theme: entry('cat', ['icons/lead.png', 'icons/lead-blink.png'], '1.1.0'), userDir, builtinNames: none, fetchFn: f }), /404/);
  assert.equal(fs.readFileSync(path.join(userDir, 'themes', 'cat.json'), 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(userDir, 'icons', 'cat', 'lead.png'), 'utf8'), 'old');
  assert.equal(readInstalled(userDir).cat.version, '1.0.0');
  assert.deepEqual(fs.readdirSync(userDir).filter((n) => n.startsWith('.market-tmp')), []);
});

test('an_update_replaces_the_icons_of_the_old_version', async () => {
  const userDir = tmp();
  await installTheme({ theme: entry('cat', ['icons/lead.png', 'icons/plan.png']), userDir, builtinNames: none, fetchFn: fakeRaw({ 'cat/theme.json': themeJson('cat'), 'cat/icons/lead.png': 'a', 'cat/icons/plan.png': 'b' }) });
  await installTheme({ theme: entry('cat', ['icons/lead.png'], '1.1.0'), userDir, builtinNames: none, fetchFn: fakeRaw({ 'cat/theme.json': themeJson('cat', '1.1.0'), 'cat/icons/lead.png': 'c' }) });
  assert.deepEqual(fs.readdirSync(path.join(userDir, 'icons', 'cat')), ['lead.png']);
  assert.deepEqual(fs.readdirSync(path.join(userDir, 'icons')), ['cat']);
});

test('limits_fail_the_install', async () => {
  const userDir = tmp();
  const big = Buffer.alloc(1024 * 1024 + 1);
  await assert.rejects(installTheme({ theme: entry('cat', ['icons/lead.png']), userDir, builtinNames: none, fetchFn: fakeRaw({ 'cat/theme.json': themeJson('cat'), 'cat/icons/lead.png': big }) }), /over/);
  const many = Array.from({ length: 101 }, (_, i) => `icons/lead-${i + 2}.png`);
  await assert.rejects(installTheme({ theme: entry('cat', many), userDir, builtinNames: none, fetchFn: fakeRaw({}) }), /100 files/);
  assert.equal(fs.existsSync(path.join(userDir, 'themes', 'cat.json')), false);
});

test('remove_deletes_a_theme_of_the_user_folder_and_its_unused_pack', async () => {
  const userDir = tmp();
  await installTheme({ theme: entry('cat', ['icons/lead.png']), userDir, builtinNames: none, fetchFn: fakeRaw({ 'cat/theme.json': themeJson('cat'), 'cat/icons/lead.png': 'a' }) });
  assert.equal(removeTheme({ name: 'cat', userDir }), true);
  assert.equal(fs.existsSync(path.join(userDir, 'themes', 'cat.json')), false);
  assert.equal(fs.existsSync(path.join(userDir, 'icons', 'cat')), false);
  assert.deepEqual(readInstalled(userDir), {});
  assert.equal(removeTheme({ name: 'cat', userDir }), false);
});

test('remove_deletes_a_hand_made_theme_and_keeps_a_pack_another_theme_uses', () => {
  const userDir = tmp();
  fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
  fs.mkdirSync(path.join(userDir, 'icons', 'shared'), { recursive: true });
  fs.writeFileSync(path.join(userDir, 'icons', 'shared', 'lead.png'), 'a');
  for (const n of ['one', 'two']) fs.writeFileSync(path.join(userDir, 'themes', `${n}.json`), JSON.stringify({ name: n, iconPack: 'shared', colors: {} }));
  assert.equal(removeTheme({ name: 'one', userDir }), true);
  assert.equal(fs.existsSync(path.join(userDir, 'icons', 'shared', 'lead.png')), true, 'two still uses the pack');
  assert.equal(removeTheme({ name: 'two', userDir }), true);
  assert.equal(fs.existsSync(path.join(userDir, 'icons', 'shared')), false);
});

test('remove_refuses_a_built_in_name_and_a_bad_name', () => {
  const userDir = tmp();
  assert.throws(() => removeTheme({ name: 'default', userDir, builtinNames: new Set(['default']) }), /built-in/);
  assert.equal(removeTheme({ name: '../x', userDir }), false);
});

test('readInstalled_gives_an_empty_object_for_a_missing_or_corrupt_file', () => {
  const userDir = tmp();
  assert.deepEqual(readInstalled(userDir), {});
  fs.writeFileSync(path.join(userDir, 'market.json'), '{oops');
  assert.deepEqual(readInstalled(userDir), {});
});
