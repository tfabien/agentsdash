import test from 'node:test';
import assert from 'node:assert/strict';
import { gridShape, bestGrid, packRows, fillLastRow, bestLayout, isIdle, paginate, orderSessions, autoCapacity, pageAlert, cellsOf, tileModel, quotaBars, summaryText } from '../web/hub_view.js';
import { countStates, beepsFor } from '../web/alerts.js';

const agent = (over = {}) => ({ id: 'lead', role: 'lead', state: 'working', cmd: 'Edit app.js', age: 100, tok: 0, prev: '', prev_age: 0, ...over });
const sess = (id, dot = 'working', over = {}) => ({ id, project: id, title: '', dot, ctx_pct: 40, ctx_k: 400, plan: null, ask: null, agents: [agent({ state: dot })], ...over });

test('grid_fits_the_session_count', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 9, 10, 16].map((n) => gridShape(n)), [
    { cols: 1, rows: 1 }, { cols: 1, rows: 1 }, { cols: 2, rows: 1 }, { cols: 3, rows: 1 }, { cols: 2, rows: 2 },
    { cols: 3, rows: 2 }, { cols: 3, rows: 3 }, { cols: 4, rows: 3 }, { cols: 4, rows: 4 }]);
});

test('sessions_fit_one_page_when_they_fit_the_capacity', () => {
  const all = ['a', 'b', 'c'].map((id) => sess(id));
  assert.deepEqual(paginate(all, { max: 6 }), [all]);
  assert.deepEqual(paginate([], { max: 6 }), []);
});

test('past_the_capacity_sessions_run_on_to_more_pages_in_order', () => {
  const all = Array.from({ length: 7 }, (_, i) => sess(`s${i}`));
  assert.deepEqual(paginate(all, { max: 3 }).map((p) => p.map((s) => s.id)), [['s0', 's1', 's2'], ['s3', 's4', 's5'], ['s6']]);
});

test('idle_sessions_go_last_and_each_group_keeps_its_first_seen_order', () => {
  const all = [sess('a', 'done'), sess('b'), sess('c', 'your_turn'), sess('d')];
  const rank = new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
  const idle = (s) => s.dot === 'done' || s.dot === 'your_turn';
  assert.deepEqual(orderSessions(all, rank, idle).map((s) => s.id), ['b', 'd', 'a', 'c']);
});

test('auto_capacity_counts_the_tiles_that_fit_the_window', () => {
  assert.equal(autoCapacity(0, 0, 472, 216), 12, 'unknown size: the cap');
  assert.equal(autoCapacity(500, 300, 472, 216), 1);
  assert.equal(autoCapacity(1200, 400, 472, 216), 6, '3 columns x 2 rows at 0.8 scale (378 x 173)');
  assert.equal(autoCapacity(3000, 2000, 472, 216), 12, 'never above the cap');
});

test('a_page_is_flagged_when_a_session_needs_you_or_failed', () => {
  assert.equal(pageAlert([sess('a'), sess('b', 'needs_you')]), 'needs_you');
  assert.equal(pageAlert([sess('a', 'error'), sess('b', 'needs_you')]), 'needs_you');
  assert.equal(pageAlert([sess('a', 'error')]), 'error');
  assert.equal(pageAlert([sess('a'), sess('b', 'done')]), '');
});

test('tile_says_what_the_session_does', () => {
  const s = sess('dotfiles', 'needs_you', {
    ctx_pct: 88, agents: [agent({ state: 'needs_you', age: 130 }), agent({ id: 'x', state: 'working' }), agent({ id: 'y', state: 'done' })],
    ask: { question: 'Which hook?', options: 'PreToolUse|PermissionRequest| Both ' },
  });
  const t = tileModel(s, 5);
  assert.equal(t.title, 'dotfiles');
  assert.equal(t.stateKey, 'needs_you');
  assert.equal(t.stateText, 'needs you 2m15');
  assert.equal(t.needsYou, true);
  assert.equal(t.ctxLevel, 'bad');
  assert.deepEqual(t.dots, ['needs_you', 'working', 'done']);
  assert.deepEqual(t.ask, { question: 'Which hook?', options: ['PreToolUse', 'PermissionRequest', 'Both'] });
});

test('tile_title_prefers_the_session_title_and_caps_dots', () => {
  const s = sess('p', 'working', { title: 'Fix login', agents: Array.from({ length: 9 }, (_, i) => agent({ id: `a${i}` })) });
  const t = tileModel(s, 0);
  assert.equal(t.title, 'Fix login');
  assert.equal(t.dots.length, 5);
  assert.equal(t.moreDots, 4);
});

test('tile_plan_segments_and_labels', () => {
  const seq = tileModel(sess('a', 'working', { plan: { done: 2, total: 4, cur: 'Build it', next: 'Test it', state: '' } }), 0).plan;
  assert.equal(seq.label, 'PLAN 2/4');
  assert.deepEqual(seq.segs, ['d', 'd', 'r', 't']);
  assert.equal(seq.cur, 'Build it');
  assert.equal(seq.next, 'Test it');
  const par = tileModel(sess('a', 'working', { plan: { done: 1, total: 3, cur: '', next: '', state: 'drt' } }), 0).plan;
  assert.deepEqual(par.segs, ['d', 'r', 't']);
  const big = tileModel(sess('a', 'working', { plan: { done: 10, total: 40, cur: 'x', next: '', state: '' } }), 0).plan;
  assert.equal(big.segs, null);
  assert.equal(big.frac, 0.25);
  assert.equal(tileModel(sess('a'), 0).plan, null);
});

test('tile_context_level_follows_the_ring_colors', () => {
  const lvl = (p) => tileModel(sess('a', 'working', { ctx_pct: p }), 0).ctxLevel;
  assert.deepEqual([null, 10, 60, 80].map(lvl), ['unknown', 'ok', 'warn', 'bad']);
});

test('quota_bars_come_from_usage_once', () => {
  const usage = { age_s: 5, h5_pct: 48, h5_reset_s: 4800, h5_proj: 70, h5_empty_s: -1, d7_pct: 61, d7_reset_s: 187000, d7_proj: 90, d7_empty_s: -1 };
  const bars = quotaBars(usage, 0);
  assert.deepEqual(bars.map((b) => [b.label, b.pct, b.level, b.text, b.stale]), [['5h', 48, 'ok', '48% reset 1h20', false], ['Week', 61, 'tight', '61% reset 2d03h', false]]);
  assert.equal(quotaBars(undefined, 0).length, 0);
  assert.equal(quotaBars({ ...usage, age_s: 20 * 60 }, 0)[0].stale, true);
});

test('summary_counts_sessions_and_needs_you', () => {
  assert.equal(summaryText([]), 'no session');
  assert.equal(summaryText([sess('a')]), '1 session');
  assert.equal(summaryText([sess('a'), sess('b', 'needs_you'), sess('c', 'needs_you')]), '3 sessions, 2 need you');
});

test('beeps_follow_the_gadget_rule', () => {
  const calm = countStates([sess('a')]);
  const asks = countStates([sess('a', 'needs_you')]);
  const turn = countStates([sess('a', 'your_turn')]);
  assert.equal(beepsFor(null, asks, 'ask'), 0);                 // first state: no beep
  assert.equal(beepsFor(calm, asks, 'ask'), 2);
  assert.equal(beepsFor(calm, asks, 'off'), 0);
  assert.equal(beepsFor(calm, turn, 'ask'), 0);
  assert.equal(beepsFor(calm, turn, 'all'), 1);
  assert.equal(beepsFor(asks, asks, 'all'), 0);
});

test('bestGrid_picks_the_columns_that_make_the_screens_biggest', () => {
  const aspect = 468 / 216;
  assert.deepEqual(bestGrid(1, 800, 600, aspect), { cols: 1, rows: 1 });
  assert.deepEqual(bestGrid(3, 800, 600, aspect), { cols: 1, rows: 3 }, 'a tall box stacks the screens');
  assert.deepEqual(bestGrid(3, 2000, 300, aspect), { cols: 3, rows: 1 }, 'a wide box puts them side by side');
  assert.deepEqual(bestGrid(4, 1000, 800, aspect), { cols: 2, rows: 2 });
});

test('bestGrid_with_stretch_keeps_wide_cells_when_they_make_the_biggest_screens', () => {
  const aspect = 472 / 216;
  assert.deepEqual(bestGrid(5, 1008, 500, aspect, 12, 708, 1.5), { cols: 2, rows: 3 }, 'wide cells are filled by stretching');
  assert.deepEqual(bestGrid(2, 2000, 300, aspect, 12, 708, 1.5), { cols: 2, rows: 1 });
});

test('bestGrid_stops_rewarding_size_past_the_cap_and_prefers_columns_on_a_tie', () => {
  assert.deepEqual(bestGrid(2, 2000, 1000, 468 / 216, 12, 700), { cols: 2, rows: 1 });
});

test('isIdle_after_five_minutes_waiting_for_the_user_only', () => {
  const s = (dot, age) => ({ dot, agents: [{ age }] });
  assert.equal(isIdle(s('your_turn', 299)), false);
  assert.equal(isIdle(s('your_turn', 299), 1), true, 'the seconds since the state arrived count');
  assert.equal(isIdle(s('done', 400)), true);
  assert.equal(isIdle(s('working', 900)), false, 'a working session is never idle');
  assert.equal(isIdle(s('needs_you', 900)), false);
});

test('a_session_with_sub_agents_takes_two_cells_and_is_never_split_across_pages', () => {
  const team = (id, dot) => sess(id, dot, { agents: [agent({ state: dot }), agent({ id: 'x1', parent: 'lead', state: 'working' })] });
  assert.equal(cellsOf(sess('a')), 1);
  assert.equal(cellsOf(team('b', 'working')), 2);
  const all = [team('t1', 'working'), team('t2', 'your_turn'), sess('s1', 'needs_you')];
  assert.equal(paginate(all, { max: 5, cost: cellsOf }).length, 1, '2 + 2 + 1 cells fit in 5');
  assert.deepEqual(paginate(all, { max: 4, cost: cellsOf }).map((p) => p.map((s) => s.id)), [['t1', 't2'], ['s1']]);
  assert.deepEqual(paginate(all, { max: 3, cost: cellsOf }).map((p) => p.map((s) => s.id)), [['t1'], ['t2', 's1']]);
  assert.deepEqual(paginate(all, { max: 1, cost: cellsOf }).map((p) => p.map((s) => s.id)), [['t1'], ['t2'], ['s1']], 'a team alone on a page when the capacity is 1');
});

test('a_team_takes_two_columns_and_wraps_to_the_next_row_with_its_lead', () => {
  assert.equal(packRows([1, 1, 1], 3), 1);
  assert.equal(packRows([1, 2, 1], 3), 2, '1 + 2 fills the row, the last one wraps');
  assert.equal(packRows([1, 1, 2], 3), 2, 'the pair would straddle two rows, so it starts the next one');
  assert.equal(packRows([2, 2, 1], 2), 3);
  assert.deepEqual(bestLayout([2], 800, 300, 472 / 216, 12, 700, 1.8), { cols: 2, rows: 1 }, 'a lone team: lead and team side by side');
  assert.ok(bestLayout([1, 2, 1, 2], 1200, 500, 472 / 216, 12, 700, 1.8).cols >= 2, 'never narrower than a team');
  assert.deepEqual(bestLayout([], 800, 600, 2), { cols: 1, rows: 1 });
  assert.deepEqual(bestLayout([1, 1, 1], 1000, 520, 472 / 216, 12, 708, 2.2), { cols: 2, rows: 2 }, '3 tiles: 2 columns (the last one is wide), not a column of short wide frames');
  assert.deepEqual(fillLastRow([1, 1, 1], 2), [1, 1, 2], 'the third tile takes the free column');
  assert.deepEqual(fillLastRow([1, 1, 1, 1], 2), [1, 1, 1, 1]);
  assert.deepEqual(fillLastRow([1, 1, 1, 1, 1], 3), [1, 1, 1, 1, 2]);
  assert.deepEqual(fillLastRow([1, 2, 1], 3), [1, 2, 3], 'a team keeps its width, a lone last tile takes its whole row');
  assert.deepEqual(fillLastRow([2, 1], 3), [2, 1]);
  assert.deepEqual(fillLastRow([1], 1), [1]);
});
