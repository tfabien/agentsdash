import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLevel } from '../web/rate_glow.js';

const settings = { rate_alert_k: 20 };
const session = (tok_min, dot = 'working') => ({ dot, rate: tok_min === null ? null : { tok_min } });

test('no readout when off, not working or without a rate', () => {
  assert.equal(rateLevel(session(50000), { rate_alert_k: 0 }), null);
  assert.equal(rateLevel(session(50000, 'needs_you'), settings), null);
  assert.equal(rateLevel(session(null), settings), null);
  assert.equal(rateLevel({ dot: 'working' }, settings), null);
});

test('normal below the setting, orange from it, red from 3 times it', () => {
  assert.deepEqual(rateLevel(session(19999), settings), { level: 0, label: '20k/min' });
  assert.deepEqual(rateLevel(session(20000), settings), { level: 1, label: '20k/min' });
  assert.deepEqual(rateLevel(session(60000), settings), { level: 2, label: '60k/min' });
  assert.equal(rateLevel(session(800), settings).label, '800/min');
  assert.equal(rateLevel(session(60000), { rate_alert_k: 80 }).level, 0);
});
