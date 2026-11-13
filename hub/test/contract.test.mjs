// The contract between adapter and core: the v2 events the Claude hooks send (recorded in the adapter repository, plugin/test/tools/record_events.mjs of agentsdash-claude, and copied here)
// are replayed against a hub, and the state it publishes must follow them. A hub that fails this breaks every adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHub } from '../hub.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'events.jsonl');
const events = fs.readFileSync(FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('core_accepts_the_recorded_events', async () => {
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' } }, userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'contract-')) });
  const base = `http://127.0.0.1:${hub.port}`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (const ev of events) assert.equal((await post('/event', ev)).status, 200, `${ev.evt} of ${ev.session}`);
    const state = await (await fetch(`${base}/state`)).json();
    const bySession = new Map(state.sessions.map((s) => [s.id, s]));
    assert.deepEqual([...bySession.keys()].sort(), ['aaaa', 'bbbb']);
    // Session aaaa ended (SessionEnd after Stop): its lead is done; its sub-agent finished.
    const a = bySession.get('aaaa');
    const lead = a.agents.find((x) => x.id === 'lead');
    assert.equal(lead.state, 'done');
    assert.equal(lead.reply_first, undefined, 'a later event (SessionEnd) clears the reply of the Stop');
    // Session bbbb answered its question and stopped: the user's turn.
    const b = bySession.get('bbbb');
    assert.equal(b.agents.find((x) => x.id === 'lead').state, 'your_turn');
    assert.equal(b.project, 'other');
    assert.equal(b.agents.find((x) => x.id === 'lead').reply_first, 'Release plan written.', 'the reply of the last Stop travels');
    // The usage body shape of the quota poller is accepted.
    assert.equal((await post('/usage', { v: 1, session: '', h5_pct: 12, h5_reset_s: 3600, d7_pct: 30, d7_reset_s: 86400 })).status, 200);
    assert.equal((await (await fetch(`${base}/state`)).json()).usage.h5_pct, 12);
  } finally { await hub.close(); }
});

// The Codex adapter (agentsdash-codex, test/fixtures/events.jsonl there) sends the same wire format from Codex payloads.
test('core_accepts_the_recorded_codex_events', async () => {
  const codexFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'events-codex.jsonl');
  const codex = fs.readFileSync(codexFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' } }, userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'contract-codex-')) });
  const base = `http://127.0.0.1:${hub.port}`;
  try {
    for (const ev of codex) {
      const res = await fetch(`${base}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
      assert.equal(res.status, 200, `${ev.evt} of ${ev.session}`);
    }
    const state = await (await fetch(`${base}/state`)).json();
    assert.equal(state.sessions.length, 1);
    const [s] = state.sessions;
    assert.equal(s.project, 'codex-demo');
    assert.equal(s.agents.find((a) => a.id === 'lead').state, 'done', 'SessionEnd ends the session');
  } finally { await hub.close(); }
});
