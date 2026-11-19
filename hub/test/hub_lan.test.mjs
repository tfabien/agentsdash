import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';
import { privateAddresses } from '../lan.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hubl-'));

/** A request with a chosen Host header (fetch cannot set it). */
function call(hub, { method = 'GET', p = '/', host, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, method, path: p, headers: { Host: host ?? `lan.test:${hub.port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function withLan(fn) {
  const userDir = tmp();
  const hub = await startHub({ port: 0, userDir, config: { relay: { mode: 'none' }, quotas: false }, lan: { enabled: true, treatAllAsRemote: true, hosts: ['lan.test'] } });
  const token = fs.readFileSync(path.join(userDir, 'lan-token'), 'utf8').trim();
  try { await fn(hub, token); } finally { await hub.close(); }
}
const cookie = (t) => ({ Cookie: `agentsdash_token=${t}` });

test('remote_without_cookie_is_401', () => withLan(async (hub) => {
  assert.equal((await call(hub, { p: '/state' })).status, 401);
}));

test('pair_with_bad_token_is_401', () => withLan(async (hub) => {
  assert.equal((await call(hub, { p: '/pair?t=bad' })).status, 401);
}));

test('pair_sets_cookie_and_state_is_readable_without_the_token', () => withLan(async (hub, token) => {
  const r = await call(hub, { p: `/pair?t=${token}` });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/phone');
  const set = r.headers['set-cookie'][0];
  assert.match(set, /agentsdash_token=/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  const s = await call(hub, { p: '/state', headers: cookie(token) });
  assert.equal(s.status, 200);
  assert.ok(!s.body.includes(token), 'the token never appears in the state');
}));

test('token_in_query_on_another_route_does_not_authenticate', () => withLan(async (hub, token) => {
  assert.equal((await call(hub, { p: `/state?t=${token}` })).status, 401);
}));

test('foreign_host_is_403_even_with_cookie', () => withLan(async (hub, token) => {
  assert.equal((await call(hub, { p: '/state', host: 'evil.example', headers: cookie(token) })).status, 403);
}));

test('remote_cannot_write_or_use_other_methods', () => withLan(async (hub, token) => {
  for (const p of ['/event', '/settings', '/shutdown']) {
    assert.equal((await call(hub, { method: 'POST', p, headers: { ...cookie(token), 'Content-Type': 'application/json' }, body: '{}' })).status, 403, p);
  }
  assert.equal((await call(hub, { method: 'OPTIONS', p: '/state', headers: cookie(token) })).status, 403);
  assert.equal((await call(hub, { p: '/market', headers: cookie(token) })).status, 403);
}));

test('remote_cannot_read_pair_info', () => withLan(async (hub, token) => {
  assert.equal((await call(hub, { p: '/pair-info', headers: cookie(token) })).status, 403);
}));

test('default_hub_has_no_pair_url_and_loopback_is_unchanged', async () => {
  const hub = await startHub({ port: 0, userDir: tmp(), config: { relay: { mode: 'none' }, quotas: false } });
  try {
    const r = await fetch(`http://127.0.0.1:${hub.port}/pair-info`);
    assert.deepEqual(await r.json(), { enabled: false, url: null, urls: [] });
    assert.equal((await fetch(`http://127.0.0.1:${hub.port}/state`)).status, 200);
    assert.equal(hub.host, '127.0.0.1');
  } finally { await hub.close(); }
});

test('lan_hub_binds_the_configured_address', async () => {
  const hub = await startHub({ port: 0, userDir: tmp(), config: { relay: { mode: 'none' }, quotas: false }, lan: { enabled: true, bind: '127.0.0.1' } });
  try { assert.equal(hub.host, '127.0.0.1'); } finally { await hub.close(); }
});

test('post_lan_turns_phone_access_on_and_off_while_the_hub_runs', async () => {
  const userDir = tmp();
  const configFile = path.join(userDir, 'config.json');
  const hub = await startHub({ port: 0, userDir, configFile, config: { relay: { mode: 'none' }, quotas: false }, lan: { bind: '0.0.0.0' } });
  const base = `http://127.0.0.1:${hub.port}`;
  const lanPost = (enabled) => fetch(`${base}/lan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
  try {
    assert.deepEqual(await (await fetch(`${base}/pair-info`)).json(), { enabled: false, url: null, urls: [] });
    const on = await lanPost(true);
    assert.deepEqual(await on.json(), { ok: true, enabled: true });
    assert.equal((await fetch(`${base}/health`)).status, 200, 'the hub still answers on its port after the rebind');
    assert.equal((await (await fetch(`${base}/pair-info`)).json()).enabled, true);
    assert.match(fs.readFileSync(path.join(userDir, 'lan-token'), 'utf8').trim(), /^[0-9a-f]{32}$/);
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).lan.enabled, true);
    const off = await lanPost(false);
    assert.deepEqual(await off.json(), { ok: true, enabled: false });
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/pair-info`)).json(), { enabled: false, url: null, urls: [] });
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).lan.enabled, false);
  } finally { await hub.close(); }
});

test('post_lan_refuses_a_bad_body', async () => {
  const hub = await startHub({ port: 0, userDir: tmp(), config: { relay: { mode: 'none' }, quotas: false } });
  try {
    const r = await fetch(`http://127.0.0.1:${hub.port}/lan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: 'yes' }) });
    assert.equal(r.status, 400);
  } finally { await hub.close(); }
});

test('remote_cannot_post_lan', () => withLan(async (hub, token) => {
  const r = await call(hub, { method: 'POST', p: '/lan', headers: { ...cookie(token), 'Content-Type': 'application/json' }, body: '{"enabled":false}' });
  assert.equal(r.status, 403);
}));

test('lan_client_cannot_answer_or_open_permission', () => withLan(async (hub, token) => {
  for (const p of ['/permission', '/permission/answer', '/question', '/question/release']) {
    const r = await call(hub, { method: 'POST', p, headers: { ...cookie(token), 'Content-Type': 'application/json' }, body: '{"id":"x","decision":"allow","session":"abcd","agent":"lead","tool":"Bash"}' });
    assert.equal(r.status, 403, p);
  }
}));

test('paired_phone_loads_its_routes_and_not_the_hub_page', () => withLan(async (hub, token) => {
  for (const p of ['/phone', '/phone.html', '/manifest.webmanifest', '/health', '/state', '/icons/line/code.svg']) assert.equal((await call(hub, { p, headers: cookie(token) })).status, 200, p);
  for (const p of ['/', '/hub', '/hub.html']) assert.equal((await call(hub, { p, headers: cookie(token) })).status, 403, p);
  const events = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, path: '/events', headers: { Host: `lan.test:${hub.port}`, ...cookie(token) } }, (res) => {
      resolve({ status: res.statusCode, type: res.headers['content-type'] });
      req.destroy();                                          // the stream never ends: close it so the hub can stop
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    req.end();
  });
  assert.deepEqual([events.status, events.type?.split(';')[0]], [200, 'text/event-stream']);
}));

test('paired_phone_loads_every_file_of_its_page', () => withLan(async (hub, token) => {
  // Follows the page's href/src values and every relative import of each module, as the phone browser does.
  const page = await call(hub, { p: '/phone', headers: cookie(token) });
  assert.equal(page.status, 200);
  const queue = [...page.body.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  const seen = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const r = await call(hub, { p: url, headers: cookie(token) });
    assert.equal(r.status, 200, `${url} answers ${r.status} to a paired phone`);
    if (!url.endsWith('.js')) continue;
    for (const m of r.body.matchAll(/(?:from|import)\s*\(?\s*['"]\.\/([^'"]+)['"]/g)) queue.push(`/${m[1]}`);
  }
  assert.ok(seen.size > 20, `only ${seen.size} files followed: the page or the import pattern changed`);
}));

test('lan_socket_open_before_phone_access_turns_off_is_refused_after', { skip: privateAddresses().length === 0 && 'no private address on this machine' }, async () => {
  // A LAN client starts a request while phone access is on and ends it, naming loopback in Host, after it is turned off.
  const hub = await startHub({ port: 0, userDir: tmp(), config: { relay: { mode: 'none' }, quotas: false }, lan: { enabled: true, bind: '0.0.0.0' } });
  const base = `http://127.0.0.1:${hub.port}`;
  try {
    const sock = net.connect(hub.port, privateAddresses()[0]);
    await once(sock, 'connect');
    let reply = '';
    sock.setEncoding('utf8');
    sock.on('data', (c) => { reply += c; });
    sock.on('error', () => {});
    sock.write('POST /settings HTTP/1.1\r\n');
    await new Promise((r) => setTimeout(r, 100));
    const off = await fetch(`${base}/lan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"enabled":false}' });
    assert.equal(off.status, 200);
    const body = '{"sound":"off"}';
    sock.write(`Host: 127.0.0.1:${hub.port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
    await Promise.race([once(sock, 'close'), new Promise((r) => setTimeout(r, 3000))]);
    sock.destroy();
    assert.match(reply, /^HTTP\/1\.1 403/);
    assert.notEqual((await (await fetch(`${base}/state`)).json()).settings?.sound, 'off');
  } finally { await hub.close(); }
});

test('post_lan_on_a_bind_that_fails_reports_off_and_saves_off', async () => {
  // 10.255.255.1 is not an address of the machine: the bind fails with EADDRNOTAVAIL and the hub stays on 127.0.0.1.
  const userDir = tmp();
  const configFile = path.join(userDir, 'config.json');
  const hub = await startHub({ port: 0, userDir, configFile, config: { relay: { mode: 'none' }, quotas: false }, lan: { bind: '10.255.255.1' } });
  const base = `http://127.0.0.1:${hub.port}`;
  try {
    const on = await fetch(`${base}/lan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"enabled":true}' });
    assert.deepEqual(await on.json(), { ok: true, enabled: false });
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await (await fetch(`${base}/pair-info`)).json()).enabled, false);
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).lan.enabled, false);
  } finally { await hub.close(); }
});

test('host_and_origin_match_whatever_the_case', () => withLan(async (hub, token) => {
  assert.equal((await call(hub, { p: '/health', host: `LAN.Test:${hub.port}`, headers: { ...cookie(token), Origin: `http://Lan.TEST:${hub.port}` } })).status, 200);
  assert.equal((await call(hub, { p: '/health', host: `${os.hostname().toLowerCase()}:${hub.port}`, headers: cookie(token) })).status, 200);
  assert.equal((await call(hub, { p: '/health', host: `${os.hostname().toUpperCase()}:${hub.port}`, headers: cookie(token) })).status, 200);
}));

test('pair_info_lists_every_pairing_url', async () => {
  const hub = await startHub({ port: 0, userDir: tmp(), config: { relay: { mode: 'none' }, quotas: false }, lan: { enabled: true, bind: '127.0.0.1' } });
  try {
    const info = await (await fetch(`http://127.0.0.1:${hub.port}/pair-info`)).json();
    assert.ok(Array.isArray(info.urls));
    assert.equal(info.urls[0] ?? null, info.url);
    assert.equal(info.urls.length, privateAddresses().length);
    for (const u of info.urls) assert.match(u, new RegExp(`^http://[0-9.]+:${hub.port}/pair\\?t=[0-9a-f]{32}$`));
  } finally { await hub.close(); }
});

test('paired_phone_may_answer_a_question_and_nothing_else_that_writes', () => withLan(async (hub, token) => {
  const r = await call(hub, { method: 'POST', p: '/question/answer', headers: { ...cookie(token), 'Content-Type': 'application/json' }, body: '{"id":"x","picks":[[0]]}' });
  assert.equal(r.status, 404, 'allowed through, then unknown question');
}));
