import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLevel } from '../web/rate_glow.js';

const settings = { rate_mode: 'tokens', rate_orange_k: 20, rate_red_k: 60, rate_orange_pct: 0.5, rate_red_pct: 1.5 };
const session = (tok_min, dot = 'working') => ({ dot, rate: tok_min === null ? null : { tok_min } });

test('no glow when off, not working or without a rate', () => {
  assert.equal(rateLevel(session(50000), null, { ...settings, rate_mode: 'off' }), null);
  assert.equal(rateLevel(session(50000, 'needs_you'), null, settings), null);
  assert.equal(rateLevel(session(null), null, settings), null);
  assert.equal(rateLevel({ dot: 'working' }, null, settings), null);
});

test('tokens mode: green below orange, orange from the low threshold, red from the high one', () => {
  assert.deepEqual(rateLevel(session(19999), null, settings), { level: 0, label: '20k/min' });
  assert.deepEqual(rateLevel(session(20000), null, settings), { level: 1, label: '20k/min' });
  assert.deepEqual(rateLevel(session(60000), null, settings), { level: 2, label: '60k/min' });
  assert.equal(rateLevel(session(800), null, settings).label, '800/min');
});

test('quota mode divides by tokens per percent', () => {
  const q = { ...settings, rate_mode: 'quota' };
  assert.deepEqual(rateLevel(session(15000), { tok_per_pct: 15000 }, q), { level: 1, label: '1.0%/min' });
  assert.equal(rateLevel(session(30000), { tok_per_pct: 15000 }, q).level, 2);
});

test('quota mode without calibration falls back to tokens', () => {
  const q = { ...settings, rate_mode: 'quota' };
  assert.deepEqual(rateLevel(session(30000), { tok_per_pct: null }, q), { level: 1, label: '30k/min' });
  assert.deepEqual(rateLevel(session(30000), undefined, q), { level: 1, label: '30k/min' });
});
