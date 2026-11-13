import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enableLan, qrLines } from '../pair.mjs';
import { buildQr } from '../web/qr.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pair-')), 'sub', 'config.json');

test('enableLan_creates_the_file_and_is_idempotent', () => {
  const f = tmpFile();
  assert.equal(enableLan(f), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { lan: { enabled: true } });
  assert.equal(enableLan(f), false);
});

test('enableLan_keeps_other_keys_and_recovers_from_a_broken_file', () => {
  const f = tmpFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ host: '127.0.0.1:9000', relay: { mode: 'http', host: '10.0.0.2' }, lan: { bind: '10.0.0.5' } }));
  assert.equal(enableLan(f), true);
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(c.host, '127.0.0.1:9000');
  assert.deepEqual(c.relay, { mode: 'http', host: '10.0.0.2' });
  assert.deepEqual(c.lan, { bind: '10.0.0.5', enabled: true });
  fs.writeFileSync(f, '{not json');
  assert.equal(enableLan(f), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { lan: { enabled: true } });
});

test('qrLines_has_half_block_rows_of_equal_width', () => {
  const url = 'http://192.168.1.5:8765/pair?t=0123456789abcdef0123456789abcdef';
  const size = buildQr(url).matrix.length + 4;
  const lines = qrLines(url);
  assert.equal(lines.length, Math.ceil(size / 2));
  for (const l of lines) { assert.equal([...l].length, size); assert.match(l, /^[\u2588\u2580\u2584 ]+$/); }
  assert.ok(lines[0].startsWith('\u2588\u2588'), 'the quiet zone is light');
  assert.deepEqual(qrLines(url), lines);
});
