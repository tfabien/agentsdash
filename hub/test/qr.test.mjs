import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQr, qrSvg, rsDivisor, rsRemainder, formatBits } from '../web/qr.js';

const URL67 = 'http://192.168.100.200:8765/pair?t=0123456789abcdef0123456789abcdef';
const ECC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
// Independent copy of the eight mask conditions of the specification.
const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];

/** Reads a QR matrix back to its text: unmask, walk the zigzag, de-interleave, check Reed-Solomon, parse the byte segment. */
function decode({ matrix, version, mask, isFunction }) {
  const size = matrix.length;
  const cw = [];
  let acc = 0, nbits = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (isFunction[y][x]) continue;
      acc = (acc << 1) | ((matrix[y][x] !== MASK[mask](x, y)) ? 1 : 0);
      if (++nbits === 8) { cw.push(acc); acc = 0; nbits = 0; }
    }
  }
  const nb = BLOCKS[version], ecc = ECC[version];
  const nShort = nb - (cw.length % nb), shortLen = Math.floor(cw.length / nb);
  const blocks = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) for (let j = 0; j < nb; j++) {
    if (i === shortLen - ecc && j < nShort) continue;       // the placeholder slot of a short block
    blocks[j].push(cw[k++]);
  }
  const data = [];
  for (const b of blocks) {
    const d = b.slice(0, b.length - ecc), e = b.slice(b.length - ecc);
    assert.deepEqual(rsRemainder(d, rsDivisor(ecc)), e, 'Reed-Solomon codewords match');
    data.push(...d);
  }
  assert.equal(data[0] >>> 4, 0b0100, 'byte mode');
  const countBytes = version < 10 ? 1 : 2;
  const len = countBytes === 1 ? ((data[0] & 15) << 4) | (data[1] >>> 4) : ((data[0] & 15) << 12) | (data[1] << 4) | (data[2] >>> 4);
  const out = [];
  for (let i = 0; i < len; i++) { const at = countBytes + i; out.push(((data[at] & 15) << 4) | (data[at + 1] >>> 4)); }
  return Buffer.from(out).toString('utf8');
}

test('round_trip_of_the_pairing_url', () => assert.equal(decode(buildQr(URL67)), URL67));

test('round_trip_over_sizes_and_unicode', () => {
  for (const s of ['a', 'hello', 'x'.repeat(100), 'y'.repeat(200), 'café ✓']) assert.equal(decode(buildQr(s)), s, s.slice(0, 12));
});

test('known_format_bits_for_level_l_mask_0', () => assert.equal(formatBits(0), 0x77c4));

test('format_bits_are_written_twice_and_valid', () => {
  const q = buildQr(URL67);
  const size = q.matrix.length;
  const want = formatBits(q.mask);
  const a = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const b = [...Array(8).keys()].map((i) => [size - 1 - i, 8]).concat([8, 9, 10, 11, 12, 13, 14].map((i) => [8, size - 15 + i]));
  const read = (cells) => cells.reduce((v, [x, y], i) => v | ((q.matrix[y][x] ? 1 : 0) << i), 0);
  assert.equal(read(a), want);
  assert.equal(read(b), want);
});

test('finder_and_timing_patterns', () => {
  const { matrix } = buildQr(URL67);
  const size = matrix.length;
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(matrix[oy + y][ox + x], ring !== 2, `finder ${ox},${oy} at ${x},${y}`);
    }
  }
  for (let i = 8; i < size - 8; i++) { assert.equal(matrix[6][i], i % 2 === 0); assert.equal(matrix[i][6], i % 2 === 0); }
});

test('svg_is_deterministic_markup', () => {
  const s = qrSvg(URL67);
  assert.ok(s.startsWith('<svg'));
  assert.ok(s.includes('<path'));
  assert.equal(qrSvg(URL67), s);
});

test('too_long_text_throws', () => assert.throws(() => buildQr('z'.repeat(400)), RangeError));
