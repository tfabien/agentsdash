#!/usr/bin/env node
// Writes the phone app icons (hub/web/phone-{180,192,512}.png): a dark square, a purple tile, a green status dot.
// Usage: node hub/tools/make_phone_icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

/** RGBA pixel for the icon at (x, y) of a size x size canvas. */
function pixel(x, y, size) {
  const u = x / size, v = y / size;
  const inRound = (cx, cy, half, r) => {
    const dx = Math.max(Math.abs(u - cx) - (half - r), 0), dy = Math.max(Math.abs(v - cy) - (half - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  if (Math.hypot(u - 0.7, v - 0.3) <= 0.1) return [94, 237, 110, 255];       // status dot
  if (inRound(0.5, 0.5, 0.32, 0.08)) return [163, 113, 247, 255];            // tile
  return [10, 10, 12, 255];                                                   // background
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y, size), y * (size * 4 + 1) + 1 + x * 4);
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [180, 192, 512]) fs.writeFileSync(path.join(OUT, `phone-${size}.png`), png(size));
