import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.mjs';
import { setLan, isLoopback, loadOrCreateToken, tokenMatches, lanHosts, parseCookie, isRemoteStatic, REMOTE_ROUTES } from '../lan.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lan-'));

test('config_lan_default_is_off', () => {
  const c = loadConfig(path.join(tmp(), 'none.json'), {});
  assert.deepEqual(c.lan, { enabled: false, bind: '0.0.0.0' });
});

test('config_lan_env_enables', () => {
  const c = loadConfig(path.join(tmp(), 'none.json'), { AGENTSDASH_LAN: '1' });
  assert.equal(c.lan.enabled, true);
});

test('config_lan_from_file_keeps_string_bind', () => {
  const file = path.join(tmp(), 'c.json');
  fs.writeFileSync(file, JSON.stringify({ lan: { enabled: true, bind: '192.168.1.5' } }));
  assert.deepEqual(loadConfig(file, {}).lan, { enabled: true, bind: '192.168.1.5' });
  fs.writeFileSync(file, JSON.stringify({ lan: { enabled: true, bind: 7 } }));
  assert.equal(loadConfig(file, {}).lan.bind, '0.0.0.0');
});

test('isLoopback_covers_mapped_ipv4', () => {
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('192.168.1.5'), false);
  assert.equal(isLoopback(undefined), false);
});

test('token_is_created_stable_and_recovers_from_empty_file', () => {
  const file = path.join(tmp(), 'sub', 'lan-token');
  const t = loadOrCreateToken(file);
  assert.match(t, /^[0-9a-f]{32}$/);
  assert.equal(loadOrCreateToken(file), t);
  fs.writeFileSync(file, '');
  assert.match(loadOrCreateToken(file), /^[0-9a-f]{32}$/);
});

test('tokenMatches_handles_length_mismatch', () => {
  assert.equal(tokenMatches('abc', 'abcd'), false);
  assert.equal(tokenMatches(undefined, 'abcd'), false);
  assert.equal(tokenMatches('abcd', 'abcd'), true);
});

test('lanHosts_has_loopback_names', () => {
  const h = lanHosts(8765, ['lan.test']);
  assert.ok(h.has('127.0.0.1:8765'));
  assert.ok(h.has('localhost:8765'));
  assert.ok(h.has('lan.test:8765'));
});

test('parseCookie', () => {
  assert.equal(parseCookie('a=1; agentsdash_token=xyz', 'agentsdash_token'), 'xyz');
  assert.equal(parseCookie(undefined, 'x'), undefined);
});

test('remote_routes_and_static', () => {
  assert.ok(REMOTE_ROUTES.has('GET /state'));
  assert.ok(!REMOTE_ROUTES.has('POST /event'));
  assert.equal(isRemoteStatic('/hub_page.js'), true);
  assert.equal(isRemoteStatic('/hub.css'), true);
  assert.equal(isRemoteStatic('/manifest.webmanifest'), true);
  assert.equal(isRemoteStatic('/shutdown'), false);
  assert.equal(isRemoteStatic('/../config.mjs'), false);
});

test('setLan_toggles_and_keeps_other_keys', () => {
  const f = path.join(tmp(), 'c.json');
  assert.equal(setLan(f, false), false, 'nothing to turn off');
  assert.equal(setLan(f, true), true);
  assert.equal(setLan(f, true), false);
  fs.writeFileSync(f, JSON.stringify({ host: 'h:1', ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  assert.equal(setLan(f, false), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { host: 'h:1', lan: { enabled: false } });
});
