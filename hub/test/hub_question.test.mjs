import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

const EV = { v: 2, session: 'abcd', project: 'proj', agent: 'lead', role: 'lead', evt: 'PreToolUse', state: 'needs_you', cmd: 'AskUserQuestion', detail: '', question: 'Which color?', options: 'Red | Blue' };
const QS = [{ question: 'Which color?', header: 'Color', options: ['Red', 'Blue'] }, { question: 'Which sizes?', header: 'Size', options: ['S', 'M', 'L'], multi: true }];
const REQ = { session: 'abcd', agent: 'lead', questions: QS, wait_s: 30 };
const post = (hub, p, body, init = {}) => fetch(`http://127.0.0.1:${hub.port}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init,
});
const state = async (hub) => (await fetch(`http://127.0.0.1:${hub.port}/state`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withHub(fn) {
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hubu-')) });
  try { await fn(hub); } finally { await hub.close(); }
}

/** Waits until the state shows (or stops showing) a quest on session abcd. */
async function questOf(hub, want = true) {
  for (let i = 0; i < 50; i++) {
    const s = (await state(hub)).sessions.find((x) => x.id === 'abcd');
    if (Boolean(s?.quest) === want) return s?.quest ?? null;
    await sleep(20);
  }
  throw new Error(`quest ${want ? 'never showed' : 'never cleared'}`);
}

test('post_question_then_answer_returns_the_picks', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/question', REQ);
  const q = await questOf(hub);
  assert.equal(q.questions.length, 2);
  assert.deepEqual(q.questions[1], { question: 'Which sizes?', header: 'Size', options: ['S', 'M', 'L'], multi: true });
  assert.equal((await post(hub, '/question/answer', { id: q.id, picks: [[1], [0, 2]] })).status, 200);
  assert.deepEqual(await (await held).json(), { picks: [[1], [0, 2]] });
  await questOf(hub, false);
  assert.equal((await post(hub, '/question/answer', { id: q.id, picks: [[0], [0]] })).status, 404, 'a late answer is a no-op');
}));

test('terminal_hands_the_question_back', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/question', REQ);
  const q = await questOf(hub);
  assert.equal((await post(hub, '/question/answer', { id: q.id, terminal: true })).status, 200);
  assert.deepEqual(await (await held).json(), { none: true });
}));

test('picks_that_do_not_fit_get_404_and_the_question_stays', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/question', REQ);
  const q = await questOf(hub);
  assert.equal((await post(hub, '/question/answer', { id: q.id, picks: [[5], [0]] })).status, 404);
  assert.equal((await post(hub, '/question/answer', { id: q.id })).status, 400);
  assert.ok(await questOf(hub));
  await post(hub, '/question/answer', { id: q.id, terminal: true });
  await held;
}));

test('delay_returns_none', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const r = await post(hub, '/question', { ...REQ, wait_s: 1 });
  assert.deepEqual(await r.json(), { none: true });
}));

test('closed_connection_removes_the_question', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const ctl = new AbortController();
  const held = post(hub, '/question', REQ, { signal: ctl.signal }).catch(() => null);
  await questOf(hub);
  ctl.abort();
  await held;
  await questOf(hub, false);
}));

test('stop_of_the_lead_clears_but_a_post_tool_use_does_not', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const held = post(hub, '/question', REQ);
  await questOf(hub);
  await post(hub, '/event', { ...EV, evt: 'PostToolUse', state: 'working', cmd: 'Read x', question: '', options: '' });
  await post(hub, '/event', { ...EV, agent: 'ab12', role: 'Explore', evt: 'Stop', state: 'done', question: '', options: '' });
  await sleep(50);
  assert.ok(await questOf(hub), 'a parallel tool or another agent leaves the question');
  await post(hub, '/event', { ...EV, evt: 'Stop', state: 'your_turn', question: '', options: '' });
  assert.deepEqual(await (await held).json(), { none: true });
}));

test('dismiss_and_reset_clear_the_question', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  const a = post(hub, '/question', REQ);
  await questOf(hub);
  await post(hub, '/dismiss', { session: 'abcd' });
  assert.deepEqual(await (await a).json(), { none: true });
  await post(hub, '/event', EV);
  const b = post(hub, '/question', REQ);
  await questOf(hub);
  await post(hub, '/reset', {});
  assert.deepEqual(await (await b).json(), { none: true });
}));

test('bad_bodies_get_400', () => withHub(async (hub) => {
  assert.equal((await post(hub, '/question', { session: 'abcd', agent: 'lead' })).status, 400);
  assert.equal((await post(hub, '/question', { ...REQ, questions: [{ question: 'q', options: ['only'] }] })).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${hub.port}/question`, { method: 'POST', body: '{nope' })).status, 400);
}));

test('foreign_origin_is_refused', () => withHub(async (hub) => {
  const r = await post(hub, '/question/answer', { id: 'x', terminal: true }, { headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
}));
