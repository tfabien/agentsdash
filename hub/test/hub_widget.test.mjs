import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

/** A hub whose widget never spawns a process: `launch` records the URL and answers `code`. */
async function withHub(fn, { code = 0, status = { supported: true, built: true }, lan } = {}) {
  const calls = [];
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubw-'));
  const hub = await startHub({ userDir,
    port: 0, config: { relay: { mode: 'none' }, quotas: false },
    widget: { status: () => status, launch: (url) => { calls.push(url); return code; } },
    ...(lan ? { lan } : {}),
  });
  try { await fn(hub, calls, userDir); } finally { await hub.close(); }
}
const local = (hub, p, method = 'GET') => fetch(`http://127.0.0.1:${hub.port}${p}`, { method });

test('get_widget_returns_status', () => withHub(async (hub) => {
  const r = await local(hub, '/widget');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { supported: true, built: false });
}, { status: { supported: true, built: false } }));

test('post_widget_launches_with_the_hub_url', () => withHub(async (hub, calls) => {
  const r = await local(hub, '/widget', 'POST');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(calls, [`http://127.0.0.1:${hub.port}/`]);
}));

test('post_widget_not_built_is_409', () => withHub(async (hub) => {
  const r = await local(hub, '/widget', 'POST');
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'not built' });
}, { code: 4 }));

test('post_widget_unsupported_is_501', () => withHub(async (hub) => {
  const r = await local(hub, '/widget', 'POST');
  assert.equal(r.status, 501);
  assert.deepEqual(await r.json(), { error: 'unsupported' });
}, { code: 2 }));

test('post_widget_twice_launches_twice', () => withHub(async (hub, calls) => {
  assert.equal((await local(hub, '/widget', 'POST')).status, 200);
  assert.equal((await local(hub, '/widget', 'POST')).status, 200);
  assert.equal(calls.length, 2);
}));

test('remote_client_cannot_use_widget_routes', () => withHub(async (hub, calls, userDir) => {
  const token = fs.readFileSync(path.join(userDir, 'lan-token'), 'utf8').trim();
  const call = (method) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, method, path: '/widget', headers: { Host: `lan.test:${hub.port}`, Cookie: `agentsdash_token=${token}` } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(await call('POST'), 403);
  assert.equal(await call('GET'), 403);
  assert.deepEqual(calls, []);
}, { lan: { enabled: true, treatAllAsRemote: true, hosts: ['lan.test'] } }));
