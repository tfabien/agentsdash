import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

/** A hub that never spawns a process: `launchWindow` records the URL and answers `code`. */
async function withHub(fn, { code = 0, browser = true, lan } = {}) {
  const calls = [];
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubw-'));
  const hub = await startHub({ userDir,
    port: 0, config: { relay: { mode: 'none' }, quotas: false },
    dashboard: { hasBrowser: () => browser, launchWindow: (url) => { calls.push(url); return code; }, createShortcut: () => 'C:/Desktop/Agentsdash.lnk' },
    ...(lan ? { lan } : {}),
  });
  try { await fn(hub, calls, userDir); } finally { await hub.close(); }
}
const local = (hub, p, method = 'GET') => fetch(`http://127.0.0.1:${hub.port}${p}`, { method });

test('get_shortcut_offers_it_until_it_is_created', () => withHub(async (hub) => {
  const r = await local(hub, '/shortcut');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { offer: true });
}));

test('get_shortcut_without_a_browser_offers_nothing', () => withHub(async (hub) => {
  assert.deepEqual(await (await local(hub, '/shortcut')).json(), { offer: false });
}, { browser: false }));

test('post_dashboard_opens_the_window_on_the_hub_url', () => withHub(async (hub, calls) => {
  const r = await local(hub, '/dashboard', 'POST');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(calls, [`http://127.0.0.1:${hub.port}/`]);
}));

test('post_dashboard_without_a_browser_is_409', () => withHub(async (hub) => {
  const r = await local(hub, '/dashboard', 'POST');
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'no browser' });
}, { code: 4 }));

test('post_dashboard_twice_opens_twice', () => withHub(async (hub, calls) => {
  await local(hub, '/dashboard', 'POST');
  await local(hub, '/dashboard', 'POST');
  assert.equal(calls.length, 2);
}));

test('remote_client_cannot_use_dashboard_routes', () => withHub(async (hub, calls, userDir) => {
  const token = fs.readFileSync(path.join(userDir, 'lan-token'), 'utf8').trim();
  const call = (method, route) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, method, path: route, headers: { Host: `lan.test:${hub.port}`, Cookie: `agentsdash_token=${token}` } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(await call('POST', '/dashboard'), 403);
  assert.equal(await call('GET', '/shortcut'), 403);
  assert.deepEqual(calls, []);
}, { lan: { enabled: true, treatAllAsRemote: true, hosts: ['lan.test'] } }));

test('post_shortcut_creates_it_and_stops_the_offer', async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubw-'));
  const hub = await startHub({ userDir, port: 0, config: { relay: { mode: 'none' }, quotas: false },
    dashboard: { hasBrowser: () => true, launchWindow: () => 0, createShortcut: () => 'C:/Desktop/Agentsdash.lnk' } });
  try {
    assert.equal((await (await local(hub, '/shortcut')).json()).offer, true);
    const r = await local(hub, '/shortcut', 'POST');
    assert.deepEqual(await r.json(), { ok: true, path: 'C:/Desktop/Agentsdash.lnk' });
    assert.equal((await (await local(hub, '/shortcut')).json()).offer, false, 'created: no more offer');
  } finally { await hub.close(); }
});
