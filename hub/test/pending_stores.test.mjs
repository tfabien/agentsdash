// The permission store and the question store share one pending-store machinery (hub/pending.mjs).
// The same table of cases runs against both: replace on reopen, timer expiry, release, clear, clearAll, and no timer left behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPermissions } from '../permissions.mjs';
import { createQuestions } from '../questions.mjs';

const STORES = [
  {
    name: 'permissions',
    create: createPermissions,
    none: 'none',
    req: (agent = 'lead', session = 'abcd') => ({ session, agent, tool: 'Bash', cmd: 'ls', detail: 'ls', wait_s: 30 }),
    good: 'allow',
    waitMs: 30_000,
  },
  {
    name: 'questions',
    create: createQuestions,
    none: null,
    req: (agent = 'lead', session = 'abcd') => ({ session, agent, questions: [{ question: 'Q?', header: 'H', options: ['a', 'b'] }], wait_s: 30 }),
    good: [[0]],
    waitMs: 30_000,
  },
];

function fake(create) {
  const timers = new Map();
  let n = 0;
  let changes = 0;
  const store = create({
    now: () => 1000,
    setTimer: (fn, ms) => { timers.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => timers.delete(id),
  });
  store.onChange(() => { changes++; });
  return { store, timers, changes: () => changes, fire: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } } };
}

for (const S of STORES) {
  test(`${S.name}: reopen for the same agent resolves the older one with the none value`, async () => {
    const { store, timers } = fake(S.create);
    const a = store.open(S.req());
    const b = store.open(S.req());
    assert.equal(await a.promise, S.none);
    assert.equal(store.view('abcd').id, b.id);
    assert.equal(timers.size, 1);
    assert.equal(store.answer(b.id, S.good), true);
    assert.deepEqual(await b.promise, S.good);
    assert.equal(timers.size, 0);
  });

  test(`${S.name}: another agent of the session keeps its own entry`, async () => {
    const { store, timers } = fake(S.create);
    const a = store.open(S.req('lead'));
    const b = store.open(S.req('sub1'));
    assert.equal(store.view('abcd').id, b.id);
    assert.equal(timers.size, 2);
    store.clearAll();
    assert.equal(await a.promise, S.none);
    assert.equal(await b.promise, S.none);
  });

  test(`${S.name}: the timer resolves the none value, clears the view and reports a change`, async () => {
    const { store, timers, changes, fire } = fake(S.create);
    const { id, promise } = store.open(S.req());
    assert.equal([...timers.values()][0].ms, S.waitMs);
    assert.equal(store.view('abcd').until, 1000 + S.waitMs);
    const before = changes();
    fire();
    assert.equal(await promise, S.none);
    assert.equal(store.view('abcd'), null);
    assert.equal(changes(), before + 1);
    assert.equal(store.answer(id, S.good), false);
  });

  test(`${S.name}: release resolves the none value once and returns whether it ended one`, async () => {
    const { store, timers } = fake(S.create);
    const { id, promise } = store.open(S.req());
    assert.equal(store.release(id), true);
    assert.equal(await promise, S.none);
    assert.equal(store.release(id), false);
    assert.equal(store.release('unknown'), false);
    assert.equal(timers.size, 0);
  });

  test(`${S.name}: clear(session, agent) ends one agent, clear(session) ends every agent`, async () => {
    const { store, timers } = fake(S.create);
    const a = store.open(S.req('lead'));
    const b = store.open(S.req('sub1'));
    const c = store.open(S.req('lead', 'other'));
    assert.equal(store.clear('abcd', 'sub1'), true);
    assert.equal(await b.promise, S.none);
    assert.equal(store.clear('abcd', 'sub1'), false);
    assert.equal(store.view('abcd').id, a.id);
    assert.equal(store.clear('abcd'), true);
    assert.equal(await a.promise, S.none);
    assert.equal(store.view('abcd'), null);
    assert.equal(store.view('other').id, c.id);
    assert.equal(timers.size, 1);
  });

  test(`${S.name}: clearAll ends every entry and reports one change only when something ended`, async () => {
    const { store, timers, changes } = fake(S.create);
    const a = store.open(S.req('lead', 's1'));
    const b = store.open(S.req('lead', 's2'));
    const before = changes();
    store.clearAll();
    assert.equal(changes(), before + 1);
    assert.equal(await a.promise, S.none);
    assert.equal(await b.promise, S.none);
    assert.equal(timers.size, 0);
    store.clearAll();
    assert.equal(changes(), before + 1);
  });

  test(`${S.name}: wait_s is clamped to [1, max] and defaults when missing`, () => {
    const { store, timers } = fake(S.create);
    store.open({ ...S.req('a'), wait_s: 0 });
    store.open({ ...S.req('b'), wait_s: 1e9 });
    store.open({ ...S.req('c'), wait_s: undefined });
    const ms = [...timers.values()].map((t) => t.ms);
    assert.equal(ms[0], 1000);
    assert.ok(ms[1] >= ms[2] && ms[1] <= 600_000);
    assert.ok(ms[2] >= 1000);
  });
}
