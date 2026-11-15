import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceKey, latestPerKey, queueItem, capQueue } from '../relay_queue.mjs';

test('device_key_of_each_route', () => {
  assert.equal(deviceKey('/event', { session: 'abcd', agent: 'lead' }), 'abcd:lead');
  assert.equal(deviceKey('/usage', { session: 'abcd' }), 'usage:abcd');
  assert.equal(deviceKey('/usage', {}), 'usage:');
  assert.equal(deviceKey('/settings', { sound: 'off' }), 'settings');
  assert.equal(deviceKey('/dismiss', { session: 'abcd' }), 'dismiss:abcd');
});

test('latest_per_key_keeps_the_newest_item_of_each_key_in_order', () => {
  const q = ['a', 'b', 'a', 'c', 'b'].map((key, i) => ({ key, i }));
  assert.deepEqual(latestPerKey(q).map((x) => x.i), [2, 3, 4]);
  assert.equal(q.length, 5, 'the input array is left as it was');
});

test('queue_item_runs_forDevice_and_keys_on_the_cut_body', () => {
  const item = queueItem('/event', { v: 2, session: 'abcd', agent: 'lead', state: 'working', cmd: 'café' });
  assert.equal(item.route, '/event');
  assert.equal(item.body.cmd, 'cafe');
  assert.equal(item.key, 'abcd:lead');
  assert.equal(queueItem('/settings', { sound: 'off' }).key, 'settings');
});

test('cap_queue_coalesces_then_keeps_the_newest_items', () => {
  const ev = (agent, n) => ({ key: `s:${agent}`, n });
  const short = [ev('a', 1), ev('a', 2)];
  assert.equal(capQueue(short, 5), short, 'under the cap the queue is untouched, duplicates included');
  assert.deepEqual(capQueue([ev('a', 1), ev('b', 2), ev('a', 3), ev('b', 4)], 3).map((x) => x.n), [3, 4], 'over the cap: latest per key');
  const distinct = Array.from({ length: 6 }, (_, i) => ev(`x${i}`, i));
  assert.deepEqual(capQueue(distinct, 4).map((x) => x.n), [2, 3, 4, 5], 'still over the cap: the oldest go');
});
