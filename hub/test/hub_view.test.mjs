import test from 'node:test';
import assert from 'node:assert/strict';
import { isIdle, waitsForYou, orderSessions, pageAlert, sideAlerts, focusAlerts, autoFocus, cellsOf, quotaBars, gotoPage, widgetButtonState } from '../web/hub_view.js';
import { placeItems, bestLayout, chooseLayout, tileSize, autoCapacity, paginate, FRAME } from '../web/layout.js';
import { countStates, beepsFor } from '../web/alerts.js';

const agent = (over = {}) => ({ id: 'lead', role: 'lead', state: 'working', cmd: 'Edit app.js', age: 100, tok: 0, prev: '', prev_age: 0, ...over });
const sess = (id, dot = 'working', over = {}) => ({ id, project: id, title: '', dot, ctx_pct: 40, ctx_k: 400, plan: null, ask: null, agents: [agent({ state: dot })], ...over });

test('sessions_fit_one_page_when_they_fit_the_capacity', () => {
  const all = ['a', 'b', 'c'].map((id) => sess(id));
  assert.deepEqual(paginate(all, { max: 6 }), [all]);
  assert.deepEqual(paginate([], { max: 6 }), []);
});

test('past_the_capacity_sessions_run_on_to_more_pages_in_order', () => {
  const all = Array.from({ length: 7 }, (_, i) => sess(`s${i}`));
  assert.deepEqual(paginate(all, { max: 3 }).map((p) => p.map((s) => s.id)), [['s0', 's1', 's2'], ['s3', 's4', 's5'], ['s6']]);
});

test('idle_sessions_go_last_and_each_group_is_ordered_by_urgency', () => {
  const all = [sess('a', 'done'), sess('b'), sess('c', 'your_turn'), sess('d')];
  const rank = new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
  const idle = (s) => s.dot === 'done' || s.dot === 'your_turn';
  assert.deepEqual(orderSessions(all, rank, idle).map((s) => s.id), ['b', 'd', 'c', 'a']);
});

test('sessions_are_ordered_by_urgency_then_first_seen', () => {
  const all = [sess('a', 'done'), sess('b', 'working'), sess('c', 'your_turn'), sess('d', 'needs_you'), sess('e', 'error'), sess('f', 'done')];
  const rank = new Map(all.map((s, i) => [s.id, i]));
  assert.deepEqual(orderSessions(all, rank, () => false).map((s) => s.id), ['d', 'e', 'c', 'b', 'a', 'f']);
});

test('a_session_waiting_for_you_precedes_older_done_sessions', () => {
  const all = [sess('a', 'done'), sess('b', 'done'), sess('c', 'your_turn')];
  const rank = new Map([['a', 0], ['b', 1], ['c', 2]]);
  assert.deepEqual(orderSessions(all, rank, () => false).map((s) => s.id), ['c', 'a', 'b']);
});

test('auto_capacity_counts_the_tiles_that_fit_the_window', () => {
  assert.equal(autoCapacity(0, 0), 12, 'unknown size: the cap');
  assert.equal(autoCapacity(500, 300), 1);
  assert.equal(autoCapacity(1200, 400), 6, '3 columns x 2 rows at 0.8 scale (378 x 173)');
  assert.equal(autoCapacity(3000, 2000), 12, 'never above the cap');
});

test('a_page_is_flagged_when_a_session_needs_you_or_failed', () => {
  assert.equal(pageAlert([sess('a'), sess('b', 'needs_you')]), 'needs_you');
  assert.equal(pageAlert([sess('a', 'error'), sess('b', 'needs_you')]), 'needs_you');
  assert.equal(pageAlert([sess('a', 'error')]), 'error');
  assert.equal(pageAlert([sess('a'), sess('b', 'done')]), '');
});

test('quota_bars_come_from_usage_once', () => {
  const usage = { age_s: 5, h5_pct: 48, h5_reset_s: 4800, h5_proj: 70, h5_empty_s: -1, d7_pct: 61, d7_reset_s: 187000, d7_proj: 90, d7_empty_s: -1 };
  const bars = quotaBars(usage, 0);
  assert.deepEqual(bars.map((b) => [b.label, b.pct, b.level, b.text, b.stale]), [['5h', 48, 'ok', '48% reset 1h20', false], ['Week', 61, 'tight', '61% reset 2d03h', false]]);
  assert.equal(quotaBars(undefined, 0).length, 0);
  assert.equal(quotaBars({ ...usage, age_s: 20 * 60 }, 0)[0].stale, true);
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

test('bestLayout_picks_the_columns_that_make_the_screens_biggest', () => {
  const ones = (n) => Array(n).fill(1);
  assert.deepEqual(bestLayout(ones(1), 800, 600), { cols: 1, rows: 1 });
  assert.deepEqual(bestLayout(ones(3), 800, 600), { cols: 2, rows: 2 }, 'a tall box: 2 columns (0.83 against 0.89 stacked), the last tile is wide');
  assert.deepEqual(bestLayout(ones(3), 500, 1000), { cols: 1, rows: 3 }, 'a narrow tall box stacks the screens');
  assert.deepEqual(bestLayout(ones(3), 2000, 300), { cols: 3, rows: 1 }, 'a wide box puts them side by side');
  assert.deepEqual(bestLayout(ones(4), 1000, 800), { cols: 2, rows: 2 });
});

test('bestLayout_prefers_tall_tiles_while_their_scale_stays_within_80_percent_of_the_best', () => {
  assert.deepEqual(bestLayout([1, 1], 1011, 560), { cols: 2, rows: 1 }, 'two sessions: side by side (scale 1.06 against 1.27 stacked), not two short wide tiles');
  assert.deepEqual(bestLayout([1, 1], 500, 1000), { cols: 1, rows: 2 }, 'a narrow box cannot hold two columns: stacked');
});

test('bestLayout_stops_rewarding_size_past_the_cap_and_prefers_columns_on_a_tie', () => {
  assert.deepEqual(bestLayout([1, 1], 2000, 1000, { maxScale: 700 / FRAME.w }), { cols: 2, rows: 1 });
});

test('tileSize_scales_both_axes_alike_and_stretches_the_frame_up_to_its_limits', () => {
  const lone = tileSize(3000, 2000);
  assert.equal(lone.k, 1.5, 'a lone tile stops at MAX_SCALE');
  assert.equal(lone.fw, FRAME.w * 2.2, 'the frame is at most 2.2 times wider');
  assert.equal(lone.fh, FRAME.h * 2, 'and 2 times taller');
  const wide = tileSize(2000, 216);
  assert.equal(wide.k, 1);
  assert.equal(wide.fw, FRAME.w * 2.2, 'one column: capped at 2.2 times');
  assert.ok(Math.abs(tileSize(2000, 216, { span: 2 }).fw - FRAME.w * 3.4) < 1e-6, 'a tile widened to 2 columns stretches to 3.4 times');
  const full = tileSize(1500, 700, { focus: true });
  assert.deepEqual([full.fw * full.k, full.fh * full.k], [1500, 700], 'full screen fills the cell');
});

test('isIdle_after_five_minutes_waiting_for_the_user_only', () => {
  const s = (dot, age) => ({ dot, agents: [{ age }] });
  assert.equal(isIdle(s('your_turn', 299)), false);
  assert.equal(isIdle(s('your_turn', 299), 1), true, 'the seconds since the state arrived count');
  assert.equal(isIdle(s('done', 400)), true);
  assert.equal(isIdle(s('working', 900)), false, 'a working session is never idle');
  assert.equal(isIdle(s('needs_you', 900)), false);
});

test('waitsForYou_on_your_turn_and_done_only', () => {
  const s = (dot) => ({ dot, agents: [{ age: 0 }] });
  assert.deepEqual(['your_turn', 'done', 'working', 'needs_you', 'error', 'waiting_subs'].map((d) => waitsForYou(s(d))), [true, true, false, false, false, false]);
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

test('a_team_takes_two_columns_and_wraps_to_the_next_row', () => {
  const rows = (spans, cols) => placeItems(spans, cols).rows;
  assert.equal(rows([1, 1, 1], 3), 1);
  assert.equal(rows([1, 2, 1], 3), 2);
  assert.equal(rows([1, 1, 2], 3), 2, 'the pair would straddle two rows, so it starts the next one');
  assert.equal(rows([2, 2, 1], 2), 3);
  assert.deepEqual(bestLayout([2], 800, 300, { maxScale: 700 / FRAME.w }), { cols: 2, rows: 1 }, 'a lone team: lead and team side by side');
  assert.ok(bestLayout([1, 2, 1, 2], 1200, 500, { maxScale: 700 / FRAME.w }).cols >= 2, 'never narrower than a team');
  assert.deepEqual(bestLayout([], 800, 600), { cols: 1, rows: 1 });
  assert.deepEqual(bestLayout([1, 1, 1], 1000, 520), { cols: 2, rows: 2 }, '3 tiles: 2 columns (the last one is wide), not a column of short wide frames');
});

test('items_fill_holes_and_the_last_single_tile_of_a_short_row_widens', () => {
  const spans = (s, cols) => placeItems(s, cols).cells.map((c) => c.span);
  const at = (s, cols) => placeItems(s, cols).cells.map((c) => `${c.row}:${c.col}`);
  assert.deepEqual(spans([1, 1, 1], 2), [1, 1, 2], 'the third tile takes the free column');
  assert.deepEqual(spans([1, 1, 1, 1], 2), [1, 1, 1, 1]);
  assert.deepEqual(spans([1, 1, 1, 1, 1], 3), [1, 1, 1, 1, 2]);
  assert.deepEqual(spans([1, 2, 1], 3), [1, 2, 3], 'a team keeps its width, a lone last tile takes its whole row');
  assert.deepEqual(spans([2, 1], 3), [2, 1]);
  assert.deepEqual(spans([1], 1), [1]);
  assert.deepEqual(spans([1, 2], 2), [2, 2], 'a tile before a team that wraps takes the free column of its row');
  assert.deepEqual(spans([1, 1, 2, 1], 3), [1, 1, 2, 1], 'the last single tile fills the hole beside the first two');
  assert.deepEqual(spans([1, 2, 1], 2), [1, 2, 1], 'single, team, single in 2 columns: the singles share the first row');
  assert.deepEqual(at([1, 2, 1], 2), ['0:0', '1:0', '0:1'], 'the team goes full width under them');
  assert.deepEqual(placeItems([], 2), { cells: [], rows: 0 });
});

test('focus_alerts_name_the_other_sessions_that_need_you', () => {
  const ss = [{ id: 'a', dot: 'error' }, { id: 'b', dot: 'working' }, { id: 'c', dot: 'needs_you' }, { id: 'd', dot: 'needs_you' }, { id: 'e', dot: 'done' }];
  assert.deepEqual(focusAlerts(ss, 'd').map((s) => s.id), ['c', 'a']);      // the full-screen one is left out, needs you before error
  assert.deepEqual(focusAlerts(ss.filter((s) => s.id === 'b' || s.id === 'e'), 'b'), []);
});

test('side_alerts_color_the_page_arrows_toward_a_session_that_needs_you', () => {
  const p = (dot) => [{ id: dot, dot }];
  const pages = [p('error'), p('working'), p('working'), p('needs_you')];
  assert.deepEqual(sideAlerts(pages, 1), { prev: 'error', next: 'needs_you' });
  assert.deepEqual(sideAlerts(pages, 3), { prev: 'error', next: '' }, 'the page on screen does not count');
  assert.deepEqual(sideAlerts([p('working'), p('done')], 0), { prev: '', next: '' });
});

test('page_has_the_jump_arrow_for_a_full_screen_session', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../web/hub.html', import.meta.url), 'utf8');
  assert.match(html, /<button id="jump" class="nav edge" hidden>/);
  assert.doesNotMatch(html, /focus-alert/, 'the banner is gone');
  const page = fs.readFileSync(new URL('../web/hub_page.js', import.meta.url), 'utf8');
  assert.match(page, /renderFocusAlert\(sessions\)/);
});

test('auto_focus_opens_a_request_and_restores_the_view_before', () => {
  const done = new Set();
  const idle = [{ id: 'a' }, { id: 'b' }];
  const asking = [{ id: 'a' }, { id: 'b', quest: { id: 'q1' } }];
  let r = autoFocus(idle, null, null, done);
  assert.deepEqual(r, { focus: null, auto: null }, 'nothing asks');
  r = autoFocus(asking, null, null, done);
  assert.deepEqual(r, { focus: 'b', auto: { id: 'b', req: 'qq1', from: null } }, 'the question opens full screen from the grid');
  r = autoFocus(asking, r.focus, r.auto, done);
  assert.equal(r.focus, 'b', 'stays while the question waits');
  r = autoFocus(idle, r.focus, r.auto, done);
  assert.deepEqual(r, { focus: null, auto: null }, 'answered: back to the grid');
});

test('auto_focus_returns_to_the_session_shown_before', () => {
  const done = new Set();
  let r = autoFocus([{ id: 'a' }, { id: 'b', perm: { id: 7 } }], 'a', null, done);
  assert.deepEqual(r, { focus: 'b', auto: { id: 'b', req: 'p7', from: 'a' } });
  r = autoFocus([{ id: 'a' }, { id: 'b' }], r.focus, r.auto, done);
  assert.deepEqual(r, { focus: 'a', auto: null });
});

test('auto_focus_leaves_a_request_the_user_closed', () => {
  const done = new Set();
  const asking = [{ id: 'a' }, { id: 'b', quest: { id: 'q1' } }];
  let r = autoFocus(asking, null, null, done);
  r = autoFocus(asking, null, r.auto, done);                // Back pressed: focus null while the question still waits
  assert.deepEqual(r, { focus: null, auto: null }, 'not opened again');
  r = autoFocus([{ id: 'a', quest: { id: 'q2' } }, { id: 'b', quest: { id: 'q1' } }], null, null, done);
  assert.equal(r.focus, 'a', 'a new request opens');
});

test('goto_page_keeps_the_grid_page_while_a_session_is_full_screen', () => {
  assert.equal(gotoPage(3, 2, 1, true), 2, 'arrow or swipe in full screen: the grid page stays');
  assert.equal(gotoPage(3, 2, 4, false), 3);
  assert.equal(gotoPage(9, 2, 4, false), 3);
  assert.equal(gotoPage(-1, 0, 4, false), 0);
});

test('widget_button_hidden_when_unsupported_or_unknown', () => {
  assert.equal(widgetButtonState(null).hidden, true);
  assert.equal(widgetButtonState({ supported: false, built: false }).hidden, true);
});

test('widget_button_offers_the_download_when_not_built', () => {
  assert.equal(widgetButtonState({ supported: true, built: false, downloadable: true }).disabled, false);
});

test('widget_button_disabled_with_build_hint_when_not_built', () => {
  assert.deepEqual(widgetButtonState({ supported: true, built: false }), { hidden: false, disabled: true, title: 'Build it once: node hub/widget/build.mjs' });
});

test('widget_button_enabled_when_built', () => {
  assert.deepEqual(widgetButtonState({ supported: true, built: true }), { hidden: false, disabled: false, title: 'Open the floating widget' });
});

test('chooseLayout_stacks_a_team_under_its_lead_in_a_narrow_window', () => {
  assert.deepEqual(chooseLayout([1], 420, 300), { stacked: false, cols: 1, rows: 1 }, 'no team: nothing to stack');
  const w = chooseLayout([2], 420, 700);
  assert.equal(w.stacked, true, 'the widget at 420 x 700: two full-width rows beat two 204 px columns');
  assert.equal(w.cols, 1);
  assert.equal(chooseLayout([2], 1200, 500).stacked, false, 'a wide window keeps lead and team side by side');
  assert.equal(chooseLayout([2], 420, 300).stacked, true, 'the default widget (420 x 300): 0.67x stacked against 0.43x side by side');
  assert.equal(chooseLayout([2], 1200, 300).stacked, false, 'a short wide window: stacking halves the height, so side by side stays');
  assert.equal(chooseLayout([2], 0, 0).stacked, false, 'box size unknown (page hidden)');
});

test('chooseLayout_does_not_depend_on_the_number_of_sub_agents', () => {
  // a team is one tile whatever its size (rows of the team list change, not the cells): 1 to 4 sub-agents give the same cells
  assert.deepEqual(chooseLayout([2, 1], 420, 900), chooseLayout([2, 1], 420, 900));
  const two = chooseLayout([2, 2], 420, 1000), one = chooseLayout([2], 420, 1000);
  assert.equal(two.stacked, true);
  assert.equal(one.stacked, true);
  assert.equal(two.cols, 1);
  assert.equal(two.rows, 2, 'two sessions with a team: one stacked cell each');
});
