import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { isPrivateIp, checkRelayHost, parseRelay, sameRelay } from '../relay_config.mjs';
import { startHub } from '../hub.mjs';

const lookupTo = (...addresses) => async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
const post = (hub, p, body) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const get = (hub, p) => fetch(`http://127.0.0.1:${hub.port}${p}`);
const quiet = { relay: { mode: 'none' }, quotas: false };

test('private_ranges_are_accepted_and_public_ones_are_not', () => {
  for (const ip of ['10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.100', '169.254.1.1', 'fd12::1', 'fe80::1', '::ffff:192.168.1.5']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '2001:db8::1', 'example.com', '']) assert.equal(isPrivateIp(ip), false, ip);
});

test('relay_host_must_be_a_local_device', async () => {
  assert.equal(await checkRelayHost('192.168.1.100'), '');
  assert.equal(await checkRelayHost('192.168.1.100:8080'), '');
  assert.equal(await checkRelayHost(' 192.168.1.100 '), '', 'surrounding spaces are trimmed');
  assert.equal(await checkRelayHost('[fd12::1]:80'), '');
  assert.equal(await checkRelayHost('esp32.local', lookupTo('192.168.1.7')), '');
  assert.match(await checkRelayHost('esp32.local', lookupTo('192.168.1.7', '8.8.8.8')), /outside the local network/);
  assert.match(await checkRelayHost('esp32.local', async () => { throw new Error('ENOTFOUND'); }), /does not resolve/);
  assert.match(await checkRelayHost('8.8.8.8'), /local network/);
  assert.match(await checkRelayHost('127.0.0.1:8765'), /loopback/);
  assert.match(await checkRelayHost('example.com'), /\.local/);
  for (const bad of ['http://192.168.1.1', '192.168.1.1/x', 'user@192.168.1.1', '192.168.1.1:99999', '', undefined]) assert.notEqual(await checkRelayHost(bad), '', String(bad));
});

test('parse_relay_checks_each_mode', async () => {
  assert.deepEqual(await parseRelay({ mode: 'none' }), { relay: { mode: 'none' } });
  assert.deepEqual(await parseRelay({ mode: 'http', host: ' 10.0.0.9 ' }), { relay: { mode: 'http', host: '10.0.0.9' } });
  assert.deepEqual(await parseRelay({ mode: 'serial', port: 'COM3' }), { relay: { mode: 'serial', port: 'COM3' } });
  assert.deepEqual(await parseRelay({ mode: 'serial', port: '/dev/ttyUSB0' }), { relay: { mode: 'serial', port: '/dev/ttyUSB0' } });
  assert.ok((await parseRelay({ mode: 'serial', port: 'C:\\evil' })).error);
  assert.ok((await parseRelay({ mode: 'serial', port: '/dev/x y' })).error);
  assert.ok((await parseRelay({ mode: 'udp' })).error);
  assert.ok((await parseRelay(null)).error);
});

test('same_relay_compares_mode_and_target', () => {
  assert.equal(sameRelay({ mode: 'none' }, { mode: 'none' }), true);
  assert.equal(sameRelay({ mode: 'http', host: 'a' }, { mode: 'http', host: 'a' }), true);
  assert.equal(sameRelay({ mode: 'http', host: 'a' }, { mode: 'http', host: 'b' }), false);
  assert.equal(sameRelay({ mode: 'serial', port: 'COM3' }, { mode: 'http', host: 'COM3' }), false);
});

test('hub_swaps_the_relay_while_running_and_saves_it_without_touching_the_other_keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relaycfg-'));
  const configFile = path.join(dir, 'agent-gadget.json');
  fs.writeFileSync(configFile, JSON.stringify({ host: '127.0.0.1:9999', quotas: false }));
  const sent = [];
  const fetchImpl = async (url) => { sent.push(String(url)); return new Response('ok'); };
  const hub = await startHub({ port: 0, config: quiet, configFile, lookup: lookupTo('192.168.1.7'), http: { fetchImpl, lockFile: path.join(dir, 'no-lock') } });
  try {
    assert.equal((await post(hub, '/relay', { mode: 'http', host: '8.8.8.8' })).status, 400, 'public host refused');
    assert.equal((await post(hub, '/relay', { mode: 'http', host: '127.0.0.1:1' })).status, 400, 'loopback refused');
    assert.equal((await (await get(hub, '/state')).json()).relay, undefined, 'a refused choice changes nothing');
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).relay, undefined);

    const ok = await post(hub, '/relay', { mode: 'http', host: 'esp32.local' });
    assert.deepEqual(await ok.json(), { ok: true, saved: true });
    const st = await (await get(hub, '/state')).json();
    assert.equal(st.relay.mode, 'http');
    assert.equal(st.relay.host, 'esp32.local');
    assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), { host: '127.0.0.1:9999', quotas: false, relay: { mode: 'http', host: 'esp32.local' } });
    assert.ok(sent.includes('http://esp32.local/settings'), 'the new device gets the beep setting at once');

    await post(hub, '/event', { v: 2, session: 'abcd', project: 'p', agent: 'lead', role: 'lead', evt: 'PreToolUse', state: 'working', cmd: 'x', detail: '' });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(sent.includes('http://esp32.local/event'), 'events reach the new device');

    assert.equal((await post(hub, '/relay', { mode: 'none' })).status, 200);
    assert.equal((await (await get(hub, '/state')).json()).relay, undefined);
    assert.deepEqual(await (await get(hub, '/relay')).json(), { mode: 'none' });
    const count = sent.length;
    await post(hub, '/event', { v: 2, session: 'abcd', project: 'p', agent: 'lead', role: 'lead', evt: 'PreToolUse', state: 'working', cmd: 'y', detail: '' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sent.length, count, 'nothing is sent after the relay is switched off');
  } finally { await hub.close(); }
});

test('without_a_config_file_the_choice_holds_but_is_not_saved', async () => {
  const hub = await startHub({ port: 0, config: quiet, lookup: lookupTo('192.168.1.7') });
  try {
    assert.deepEqual(await (await post(hub, '/relay', { mode: 'http', host: '192.168.1.9' })).json(), { ok: true, saved: false });
    assert.equal((await (await get(hub, '/state')).json()).relay.host, '192.168.1.9');
  } finally { await hub.close(); }
});

test('test_button_asks_the_device_for_its_state_and_reports_the_error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relaytest-'));
  const calls = [];
  let fail = false;
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/state') && fail) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    return new Response('{}', { status: 200 });
  };
  const hub = await startHub({ port: 0, config: { relay: { mode: 'http', host: '192.168.1.50' }, quotas: false }, http: { fetchImpl, lockFile: path.join(dir, 'no-lock') } });
  try {
    assert.equal((await (await post(hub, '/relay/test')).json()).ok, true);
    assert.ok(calls.includes('http://192.168.1.50/state'));
    fail = true;
    assert.deepEqual(await (await post(hub, '/relay/test')).json(), { ok: false, error: 'ECONNREFUSED' });
  } finally { await hub.close(); }
  const idle = await startHub({ port: 0, config: quiet });
  try { assert.deepEqual(await (await post(idle, '/relay/test')).json(), { ok: false, error: 'no device configured' }); } finally { await idle.close(); }
});

test('test_button_waits_while_a_screen_upload_holds_the_lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relaylock-'));
  const lockFile = path.join(dir, 'lock');
  fs.writeFileSync(lockFile, '');
  const stateCalls = [];
  const fetchImpl = async (url) => { if (String(url).endsWith('/state')) stateCalls.push(url); return new Response('ok'); };
  const hub = await startHub({ port: 0, config: { relay: { mode: 'http', host: '192.168.1.50' }, quotas: false }, http: { lockFile, fetchImpl } });
  try {
    const r = await (await post(hub, '/relay/test')).json();
    assert.equal(r.ok, false);
    assert.match(r.error, /upload/);
    assert.equal(stateCalls.length, 0);
  } finally { await hub.close(); }
});

test('ports_list_comes_from_the_injected_function_and_never_fails', async () => {
  const hub = await startHub({ port: 0, config: quiet, listPorts: async () => ({ ports: [{ path: 'COM3', label: 'USB-SERIAL' }] }) });
  try { assert.deepEqual(await (await get(hub, '/relay/ports')).json(), { ports: [{ path: 'COM3', label: 'USB-SERIAL' }] }); } finally { await hub.close(); }
  const bare = await startHub({ port: 0, config: quiet });
  try {
    const r = await get(bare, '/relay/ports');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray((await r.json()).ports));
  } finally { await bare.close(); }
});

test('relay_routes_refuse_a_foreign_origin', async () => {
  const hub = await startHub({ port: 0, config: quiet });
  try {
    const r = await fetch(`http://127.0.0.1:${hub.port}/relay`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: JSON.stringify({ mode: 'none' }) });
    assert.equal(r.status, 403);
  } finally { await hub.close(); }
});
