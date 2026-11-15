import test from 'node:test';
import assert from 'node:assert/strict';
import { qrLines } from '../pair.mjs';
import { buildQr } from '../web/qr.js';

test('qrLines_has_half_block_rows_of_equal_width', () => {
  const url = 'http://192.168.1.5:8765/pair?t=0123456789abcdef0123456789abcdef';
  const size = buildQr(url).matrix.length + 4;
  const lines = qrLines(url);
  assert.equal(lines.length, Math.ceil(size / 2));
  for (const l of lines) { assert.equal([...l].length, size); assert.match(l, /^[\u2588\u2580\u2584 ]+$/); }
  assert.ok(lines[0].startsWith('\u2588\u2588'), 'the quiet zone is light');
  assert.deepEqual(qrLines(url), lines);
});
