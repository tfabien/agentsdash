import { test } from 'node:test';
import assert from 'node:assert/strict';
import { svgContext } from '../tools/export_builtin.mjs';

// The plugin ships no theme and no icon pack: the first launch downloads one (see market_bootstrap.test.mjs).

test('svgContext_throws_on_an_unsupported_call', () => {
  const { ctx } = svgContext();
  assert.throws(() => ctx.bezierCurveTo(0, 0, 1, 1, 2, 2), /unsupported/);
  assert.throws(() => { ctx.shadowBlur = 3; }, /unsupported/);
});

test('svgContext_records_a_filled_and_a_stroked_path', () => {
  const { ctx, toSvg } = svgContext();
  ctx.beginPath(); ctx.arc(10, 10, 5, 0, Math.PI * 2); ctx.fillStyle = '#ff0000'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 4); ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.stroke();
  const s = toSvg();
  assert.match(s, /fill="#ff0000"/);
  assert.match(s, /stroke="#00ff00" stroke-width="2"/);
});
