import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

const EV = { v: 2, session: 'abcd', project: 'proj', agent: 'lead', role: 'lead', evt: 'PermissionRequest', state: 'needs_you', cmd: 'Approve? Bash git status', detail: '' };
const REQ = { session: 'abcd', agent: 'lead', tool: 'Bash', cmd: 'git status', detail: 'git status', wait_s: 30 };
const post = (hub, p, body, raw, init = {}) => fetch(`http://127.0.0.1:${hub.port}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body), ...init,
});
const state = async (hub) => (await fetch(`http://127.0.0.1:${hub.port}/state`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withHub(fn) {
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hubu-')) });
  try { await fn(hub); } finally { await hub.close(); }
}

/** Waits until the state shows (or stops showing) a perm on session abcd. */
async function permOf(hub, want = true) {
  for (let i = 0; i < 50; i++) {
    const s = (await state(hub)).sessions.find((x) => x.id === 'abcd');
    if (Boolean(s?.perm) === want) return s?.perm ?? null;
    await sleep(20);
  }
  throw new Error(`perm ${want ? 'never showed' : 'never cleared'}`);
}

test('post_permission_then_answer_allow', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', REQ);
  const perm = await permOf(hub);
  assert.equal(perm.tool, 'Bash');
  assert.equal(perm.cmd, 'git status');
  const r = await post(hub, '/permission/answer', { id: perm.id, decision: 'allow' });
  assert.equal(r.status, 200);
  assert.deepEqual(await (await held).json(), { decision: 'allow' });
  await permOf(hub, false);
}));

test('answer_deny', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', REQ);
  const perm = await permOf(hub);
  await post(hub, '/permission/answer', { id: perm.id, decision: 'deny' });
  assert.deepEqual(await (await held).json(), { decision: 'deny' });
}));

test('delay_returns_none', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const r = await post(hub, '/permission', { ...REQ, wait_s: 1 });
  assert.deepEqual(await r.json(), { decision: 'none' });
  await permOf(hub, false);
}));

test('closed_connection_removes_perm', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const ctl = new AbortController();
  const held = post(hub, '/permission', REQ, undefined, { signal: ctl.signal }).catch(() => null);
  await permOf(hub);
  ctl.abort();
  await held;
  await permOf(hub, false);
}));

test('post_tool_use_event_returns_none', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', REQ);
  await permOf(hub);
  await post(hub, '/event', { ...EV, evt: 'PostToolUse', state: 'working', cmd: 'Bash git status' });
  assert.deepEqual(await (await held).json(), { decision: 'none' });
}));

test('dismiss_returns_none', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', REQ);
  await permOf(hub);
  await post(hub, '/dismiss', { session: 'abcd' });
  assert.deepEqual(await (await held).json(), { decision: 'none' });
}));

test('reset_returns_none', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', REQ);
  await permOf(hub);
  await post(hub, '/reset', {});
  assert.deepEqual(await (await held).json(), { decision: 'none' });
}));

test('answer_unknown_id_is_404', () => withHub(async (hub) => {
  const r = await post(hub, '/permission/answer', { id: 'nope', decision: 'allow' });
  assert.equal(r.status, 404);
}));

test('answer_bad_decision_is_400', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/permission', { ...REQ, wait_s: 1 });
  const perm = await permOf(hub);
  const r = await post(hub, '/permission/answer', { id: perm.id, decision: 'maybe' });
  assert.equal(r.status, 400);
  await held;
}));

test('missing_fields_is_400', () => withHub(async (hub) => {
  assert.equal((await post(hub, '/permission', { agent: 'lead', tool: 'Bash' })).status, 400);
  assert.equal((await post(hub, '/permission', { session: 'abcd', tool: 'Bash' })).status, 400);
  assert.equal((await post(hub, '/permission', { session: 'abcd', agent: 'lead' })).status, 400);
  assert.equal((await post(hub, '/permission', null, '{not json')).status, 400);
}));

test('each_event_that_moves_the_session_on_returns_none', async () => {
  for (const [evt, st] of [['PostToolUseFailure', 'error'], ['PermissionDenied', 'working'], ['Stop', 'your_turn'], ['SessionEnd', 'done']]) {
    await withHub(async (hub) => {
      await post(hub, '/event', EV);
      const held = post(hub, '/permission', REQ);
      await permOf(hub);
      assert.equal((await post(hub, '/event', { ...EV, evt, state: st, cmd: '' })).status, 200, evt);
      assert.deepEqual(await (await held).json(), { decision: 'none' }, evt);
    });
  }
});

test('a_sub_agent_tool_end_keeps_the_lead_request', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  let settled = false;
  const held = post(hub, '/permission', REQ).then((r) => { settled = true; return r; });
  await permOf(hub);
  await post(hub, '/event', { ...EV, agent: 'ab12', role: 'Explore', evt: 'PostToolUse', state: 'working', cmd: 'Read x' });
  await post(hub, '/event', { ...EV, agent: 'ab12', role: 'Explore', evt: 'SubagentStop', state: 'done', cmd: 'Done.' });
  await sleep(50);
  assert.equal(settled, false, 'another agent of the session does not end the request');
  assert.ok(await permOf(hub), 'the tile keeps Allow/Deny');
  await post(hub, '/event', { ...EV, evt: 'PostToolUse', state: 'working', cmd: 'Bash git status' });
  assert.deepEqual(await (await held).json(), { decision: 'none' }, 'the same agent moving on ends it');
}));

test('the_lead_stop_keeps_a_sub_agent_request_until_its_subagent_stop', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  await post(hub, '/event', { ...EV, agent: 'ab12', role: 'Explore' });
  let settled = false;
  const held = post(hub, '/permission', { ...REQ, agent: 'ab12' }).then((r) => { settled = true; return r; });
  await permOf(hub);
  await post(hub, '/event', { ...EV, evt: 'Stop', state: 'your_turn', cmd: '' });
  await sleep(50);
  assert.equal(settled, false, 'the lead Stop leaves a background sub-agent request alone');
  await post(hub, '/event', { ...EV, agent: 'ab12', role: 'Explore', evt: 'SubagentStop', state: 'done', cmd: 'Done.' });
  assert.deepEqual(await (await held).json(), { decision: 'none' });
}));

test('a_long_session_id_is_cut_like_the_event_so_the_tile_shows_the_request', () => withHub(async (hub) => {
  await post(hub, '/event', { ...EV, session: 'abcdef', agent: 'leadXX' });
  const held = post(hub, '/permission', { ...REQ, session: 'abcdef', agent: 'leadXX' });
  assert.equal((await permOf(hub)).tool, 'Bash', 'tile abcd shows the request of session abcdef');
  await post(hub, '/event', { ...EV, session: 'abcdef', agent: 'leadXX', evt: 'PostToolUse', state: 'working', cmd: 'Bash git status' });
  assert.deepEqual(await (await held).json(), { decision: 'none' }, 'the clearing event matches the cut ids too');
}));

test('permission_routes_answer_413_for_a_body_too_large_and_400_for_null', () => withHub(async (hub) => {
  const big = JSON.stringify({ session: 'x'.repeat(70 * 1024) });
  for (const route of ['/permission', '/permission/answer']) {
    const r = await post(hub, route, null, big);
    assert.equal(r.status, 413, route);
    assert.equal(await r.text(), 'body too large', route);
  }
  assert.equal((await post(hub, '/permission/answer', null, 'null')).status, 400);
}));
