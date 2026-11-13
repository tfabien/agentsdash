import test from 'node:test';
import assert from 'node:assert/strict';
import { annotate, createUpdater } from '../market_update.mjs';

const listed = (name, version, source = 'o/r') => ({ source, name, version, files: [] });
const rec = (version, source = 'o/r') => ({ source, version, installedAt: 'x' });

test('annotate_marks_updatable_only_for_a_newer_version_of_the_same_source', () => {
  const r = annotate([listed('a', '1.1.0'), listed('b', '1.0.0'), listed('c', '2.0.0', 'x/y'), listed('d', '1.0.0')], { a: rec('1.0.0'), b: rec('1.0.0'), c: rec('1.0.0') });
  assert.deepEqual(r.map((t) => [t.name, t.installed, t.installedVersion, t.updatable]), [['a', true, '1.0.0', true], ['b', true, '1.0.0', false], ['c', true, '1.0.0', false], ['d', false, '', false]]);
});

function setup({ installed, themes, failOn = null, errors = [] }) {
  const calls = { list: 0, installed: [], done: [] };
  const u = createUpdater({
    getInstalled: () => installed,
    list: async () => { calls.list++; return { themes, errors }; },
    install: async (t) => { if (t.name === failOn) throw new Error('boom'); calls.installed.push(t.name); },
    onDone: (r) => calls.done.push(r),
    setTimer: (fn, ms) => { calls.timer = { fn, ms }; return {}; },
    clearTimer: () => { calls.cleared = true; },
    isActive: () => calls.active ?? true,
  });
  return { u, calls };
}

test('check_installs_only_updatable_themes_and_reports_them', async () => {
  const { u, calls } = setup({ installed: { a: rec('1.0.0'), b: rec('1.0.0') }, themes: [listed('a', '1.1.0'), listed('b', '1.0.0'), listed('c', '9.0.0')] });
  const r = await u.check();
  assert.deepEqual(r, { updated: ['a'], errors: [] });
  assert.deepEqual(calls.installed, ['a']);
  assert.equal(calls.done.length, 1);
  assert.ok(u.lastCheck() > 0);
});

test('check_with_a_name_touches_only_that_theme', async () => {
  const { u, calls } = setup({ installed: { a: rec('1.0.0'), b: rec('1.0.0') }, themes: [listed('a', '1.1.0'), listed('b', '1.1.0')] });
  assert.deepEqual((await u.check('b')).updated, ['b']);
  assert.deepEqual(calls.installed, ['b']);
});

test('a_failing_install_lands_in_errors_and_the_others_continue', async () => {
  const { u, calls } = setup({ installed: { a: rec('1.0.0'), b: rec('1.0.0') }, themes: [listed('a', '2.0.0'), listed('b', '2.0.0')], failOn: 'a' });
  const r = await u.check();
  assert.deepEqual(r.updated, ['b']);
  assert.deepEqual(r.errors, ['a: boom']);
  assert.deepEqual(calls.installed, ['b']);
});

test('source_errors_are_reported', async () => {
  const { u } = setup({ installed: { a: rec('1.0.0') }, themes: [], errors: ['o/r: HTTP 403'] });
  assert.deepEqual((await u.check()).errors, ['o/r: HTTP 403']);
});

test('the_listing_is_cached_for_24_hours', async () => {
  let t = 1000;
  let n = 0;
  const u = createUpdater({ getInstalled: () => ({}), list: async () => { n++; return { themes: [], errors: [] }; }, install: async () => {}, now: () => t });
  await u.list('o/r'); await u.list('o/r');
  assert.equal(n, 1);
  t += 24 * 3600 * 1000 - 1;
  await u.list('o/r');
  assert.equal(n, 1);
  t += 2;
  await u.list('o/r');
  assert.equal(n, 2);
});

test('the_timer_checks_every_6_hours_only_while_active', async () => {
  const { u, calls } = setup({ installed: { a: rec('1.0.0') }, themes: [listed('a', '2.0.0')] });
  calls.active = false;
  u.start();
  assert.equal(calls.timer.ms, 6 * 3600 * 1000);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls.installed, []);
  calls.active = true;
  calls.timer.fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls.installed, ['a']);
  u.stop();
  assert.equal(calls.cleared, true);
});

test('a_listing_survives_in_the_store_and_a_failed_listing_is_not_kept', async () => {
  let disk = {};
  let n = 0;
  const store = { read: () => disk, write: (d) => { disk = d; } };
  const make = (errors) => createUpdater({ store, getInstalled: () => ({}), list: async () => { n++; return { themes: [listed('a', '1.0.0')], errors }; }, install: async () => {}, now: () => 5000 });
  const first = make([]);
  await first.list('o/r');
  const second = make([]);                                // a new hub: the store answers, no fetch
  assert.deepEqual((await second.list('o/r')).themes.map((t) => t.name), ['a']);
  assert.equal(n, 1);
  assert.deepEqual(second.refreshedAt(['o/r', 'x/y']), { 'o/r': 5000, 'x/y': 0 });
  disk = {};
  const failing = make(['o/r: HTTP 403']);
  await failing.list('o/r'); await failing.list('o/r');
  assert.equal(n, 3, 'a listing with errors is fetched again every time');
  first.forget();
  assert.deepEqual(disk, {});
});

test('a_stored_listing_of_an_older_format_is_fetched_again', async () => {
  let n = 0;
  const store = { read: () => ({ 'o/r': { at: 5000, result: { themes: [], errors: [] } } }), write: () => {} };       // no format field: an older hub wrote it
  const u = createUpdater({ store, getInstalled: () => ({}), list: async () => { n++; return { themes: [], errors: [] }; }, install: async () => {}, now: () => 6000 });
  await u.list('o/r');
  assert.equal(n, 1);
});
