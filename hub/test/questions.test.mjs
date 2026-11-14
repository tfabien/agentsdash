import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestions, cleanQuestions, validPicks } from '../questions.mjs';

const QS = [
  { question: 'Which color?', header: 'Color', options: ['Red', 'Blue'], multi: false },
  { question: 'Which sizes?', header: 'Size', options: ['S', 'M', 'L'], multi: true },
];
const REQ = { session: 'abcd', agent: 'lead', questions: QS, wait_s: 60 };

/** A store with a manual clock: timers fire only when `fire()` is called. */
function fake() {
  const timers = new Map();
  let n = 0;
  const quests = createQuestions({
    now: () => 1000,
    setTimer: (fn, ms) => { timers.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => timers.delete(id),
  });
  return { quests, timers, fire: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } } };
}

test('answer_resolves_the_picks', async () => {
  const { quests } = fake();
  const { id, promise } = quests.open(REQ);
  assert.equal(quests.answer(id, [[1], [0, 2]]), true);
  assert.deepEqual(await promise, [[1], [0, 2]]);
  assert.equal(quests.view('abcd'), null);
});

test('second_answer_is_a_no_op', () => {
  const { quests } = fake();
  const { id } = quests.open(REQ);
  assert.equal(quests.answer(id, [[0], [1]]), true);
  assert.equal(quests.answer(id, [[1], [1]]), false);
  assert.equal(quests.release(id), false);
});

test('picks_that_do_not_fit_are_refused_and_keep_the_question', () => {
  const { quests } = fake();
  const { id } = quests.open(REQ);
  for (const bad of [[[0]], [[0, 1], [1]], [[2], [1]], [[0], []], [[0], [1, 1]], [[0], ['1']], 'x']) assert.equal(quests.answer(id, bad), false, JSON.stringify(bad));
  assert.ok(quests.view('abcd'));
});

test('release_and_delay_resolve_null', async () => {
  const { quests, fire } = fake();
  const a = quests.open(REQ);
  assert.equal(quests.release(a.id), true);
  assert.equal(await a.promise, null);
  const b = quests.open(REQ);
  fire();
  assert.equal(await b.promise, null);
});

test('wait_is_clamped_and_shown_as_until', () => {
  const { quests, timers } = fake();
  quests.open({ ...REQ, wait_s: 9999 });
  assert.equal([...timers.values()][0].ms, 300000);
  assert.equal(quests.view('abcd').until, 1000 + 300000);
  quests.open({ ...REQ, wait_s: 'x' });
  assert.equal(quests.view('abcd').until, 1000 + 60000);
});

test('a_new_question_of_the_same_agent_replaces_the_old_one', async () => {
  const { quests } = fake();
  const a = quests.open(REQ);
  const b = quests.open(REQ);
  assert.equal(await a.promise, null);
  assert.equal(quests.view('abcd').id, b.id);
});

test('clear_by_agent_keeps_other_agents', async () => {
  const { quests } = fake();
  const lead = quests.open(REQ);
  const sub = quests.open({ ...REQ, agent: 'ab12' });
  assert.equal(quests.clear('abcd', 'ab12'), true);
  assert.equal(await sub.promise, null);
  assert.equal(quests.view('abcd').id, lead.id);
  quests.clear('abcd');
  assert.equal(await lead.promise, null);
});

test('on_change_fires_on_open_answer_and_release', () => {
  const { quests } = fake();
  let n = 0;
  quests.onChange(() => n++);
  const { id } = quests.open(REQ);
  quests.answer(id, [[0], [1]]);
  quests.release(quests.open(REQ).id);
  assert.equal(n, 4);
});

test('clean_questions_checks_counts_and_cuts_options', () => {
  assert.equal(cleanQuestions([]), null);
  assert.equal(cleanQuestions('x'), null);
  assert.equal(cleanQuestions([{ question: 'q', options: ['a'] }]), null);
  assert.equal(cleanQuestions(Array(5).fill({ question: 'q', options: ['a', 'b'] })), null);
  const [q] = cleanQuestions([{ question: 'q', header: 'h', options: ['a', 'b', 'c', 'd', 'e'], multi: true }]);
  assert.deepEqual(q, { question: 'q', header: 'h', options: ['a', 'b', 'c', 'd'], multi: true });
});

test('valid_picks', () => {
  assert.equal(validPicks(QS, [[0], [0, 1, 2]]), true);
  assert.equal(validPicks(QS, [[0, 1], [0]]), false, 'two picks for a single choice');
});
