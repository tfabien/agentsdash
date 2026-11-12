import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCache, STALE_MS } from '../web/session_cache.js';

const sess = (id, age = 5) => ({ id, project: 'p', dot: 'working', agents: [{ id: 'lead', age }] });
const st = (boot, ...ids) => ({ boot, sessions: ids.map((id) => sess(id)) });
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('restart_keeps_unconfirmed_sessions_as_stale', () => {
  let t = 0;
  const c = createSessionCache(mem(), () => t);
  assert.equal(c.merge(st(1, 'a', 'b', 'c')).sessions.length, 3);
  t = 30000;
  const after = c.merge(st(2));                                     // new hub, empty
  assert.deepEqual(after.sessions.map((s) => [s.id, s.stale]), [['a', true], ['b', true], ['c', true]]);
  assert.equal(after.sessions[0].agents[0].age, 35, 'age moves on while the hub was away');
  t = 31000;
  const later = c.merge(st(2, 'a'));                                // a reports again, b and c still unconfirmed
  assert.deepEqual(later.sessions.map((s) => [s.id, !!s.stale]), [['a', false], ['b', true], ['c', true]]);
});

test('stale_sessions_expire_after_the_limit', () => {
  let t = 0;
  const c = createSessionCache(mem(), () => t);
  c.merge(st(1, 'a', 'b'));
  t = STALE_MS - 1;
  assert.equal(c.merge(st(2)).sessions.length, 2);
  t = STALE_MS + 1;
  assert.equal(c.merge(st(2)).sessions.length, 0);
});

test('same_hub_dropping_a_session_means_it_ended_or_was_dismissed', () => {
  const c = createSessionCache(mem(), () => 0);
  c.merge(st(1, 'a', 'b'));
  assert.deepEqual(c.merge(st(1, 'a')).sessions.map((s) => s.id), ['a']);
  c.merge(st(2));                                                   // restart: a is carried
  c.merge(st(2, 'a'));                                              // confirmed by hub 2
  assert.equal(c.merge(st(2)).sessions.length, 0, 'confirmed by hub 2 then gone: ended');
});

test('forget_and_restore_follow_the_storage', () => {
  const storage = mem();
  const c = createSessionCache(storage, () => 1000);
  c.merge(st(1, 'a', 'b'));
  c.forget('b');
  const reloaded = createSessionCache(storage, () => 2000);          // page reload
  assert.deepEqual(reloaded.restore().map((s) => [s.id, s.stale]), [['a', true]]);
  assert.equal(createSessionCache(null).merge(st(1, 'a')).sessions.length, 1, 'works without storage');
});
