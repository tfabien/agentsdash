// Minimal QR Code encoder: byte mode, error correction level L, versions 1 to 10 (up to 271 bytes). No dependency.
// The algorithm follows the QR Code model 2 specification (ISO/IEC 18004) as laid out by Project Nayuki's MIT-licensed
// "QR Code generator library" (https://www.nayuki.io/page/qr-code-generator-library); this is a compact re-implementation.

// Per version 1..10, level L: error correction codewords per block and number of blocks.
const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const MAX_VERSION = 10;

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}

/** Generator polynomial coefficients (without the leading 1) of the given degree. */
export function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}

/** Reed-Solomon remainder of `data` divided by `divisor`: the error correction codewords. */
export function rsRemainder(data, divisor) {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, factor); });
  }
  return r;
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
  return r;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The 15 format bits (level L, `mask`), with the XOR pattern applied. */
export function formatBits(mask) {
  const data = (1 << 3) | mask;                 // level L is 01
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Bytes of a string as UTF-8. */
const utf8 = (s) => [...new TextEncoder().encode(s)];

/**
 * @param {string} text
 * @returns {{matrix: boolean[][], version: number, mask: number, isFunction: boolean[][], codewords: number[]}} `matrix[y][x]` is true for a dark module.
 * Throws when the text does not fit version 10.
 */
export function buildQr(text) {
  const bytes = utf8(text);
  let version = 1;
  for (;; version++) {
    if (version > MAX_VERSION) throw new RangeError('text too long for the QR encoder');
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  const capacity = dataCodewords(version) * 8;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, interleave.
  const nBlocks = BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const rawCw = Math.floor(rawModules(version) / 8);
  const nShort = nBlocks - (rawCw % nBlocks);
  const shortLen = Math.floor(rawCw / nBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => { if (i !== shortLen - eccLen || j >= nShort) codewords.push(block[i]); });
  }

  // Function patterns.
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => { matrix[y][x] = dark; isFunction[y][x] = true; };
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const pos = alignmentPositions(version);
  pos.forEach((px, i) => pos.forEach((py, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask) => {
    const b = formatBits(mask);
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
    setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      setFn(a, c, bit(b, i)); setFn(c, a, bit(b, i));
    }
  }

  // Codewords, zigzag from the bottom right.
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!isFunction[y][x] && n < codewords.length * 8) { matrix[y][x] = bit(codewords[n >>> 3], 7 - (n & 7)); n++; }
    }
  }

  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFunction[y][x] && MASKS[m](x, y)) matrix[y][x] = !matrix[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const run = (get) => {
      for (let a = 0; a < size; a++) {
        let len = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) len++;
          else { if (len >= 5) p += 3 + (len - 5); len = 1; }
        }
      }
    };
    run((a, b) => matrix[a][b]); run((a, b) => matrix[b][a]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (matrix[y][x]) dark++;
      if (x + 1 < size && y + 1 < size && matrix[y][x] === matrix[y][x + 1] && matrix[y][x] === matrix[y + 1][x] && matrix[y][x] === matrix[y + 1][x + 1]) p += 3;
    }
    return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
  };
  let best = 0, bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestPenalty) { best = m; bestPenalty = p; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return { matrix, version, mask: best, isFunction, codewords };
}

/** SVG markup of the QR code for `text`: dark modules as one path, a 4 module quiet zone, `currentColor`-free (black on white). */
export function qrSvg(text) {
  const { matrix } = buildQr(text);
  const size = matrix.length;
  let d = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  const total = size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
