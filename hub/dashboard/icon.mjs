// The dashboard icon, drawn here so that no binary asset has to ship: the agent (a robot head) on a dark rounded panel, its antenna lit green.
// Supersampled (3 x 3 per pixel) shapes, encoded as an RGBA PNG with the standard library only.
import zlib from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rect = (x, y, w, h, r, color) => ({ x, y, w, h, r, color: hex(color) });
const disc = (cx, cy, r, color) => ({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, r, color: hex(color) });   // a rounded rectangle whose radius is half its side

// In 256 x 256 units, painted in this order.
const SHAPES = [
  rect(8, 8, 240, 240, 56, '#2a3344'),    // panel edge
  rect(11, 11, 234, 234, 53, '#111a28'),  // panel
  rect(121, 44, 14, 40, 7, '#c9d4e0'),    // antenna
  disc(128, 40, 17, '#5fe068'),           // antenna light
  rect(24, 116, 34, 70, 12, '#7c4fd6'),   // ears
  rect(198, 116, 34, 70, 12, '#7c4fd6'),
  rect(44, 74, 168, 132, 40, '#a574ff'),  // head
  disc(96, 128, 26, '#ffffff'),           // eyes
  disc(160, 128, 26, '#ffffff'),
  disc(101, 131, 12, '#111a28'),          // pupils
  disc(165, 131, 12, '#111a28'),
  rect(92, 168, 72, 16, 8, '#111a28'),    // mouth
];

function covers(s, px, py) {
  const dx = Math.max(Math.abs(px - (s.x + s.w / 2)) - (s.w / 2 - s.r), 0);
  const dy = Math.max(Math.abs(py - (s.y + s.h / 2)) - (s.h / 2 - s.r), 0);
  return Math.hypot(dx, dy) <= s.r;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** The icon as a 256 x 256 RGBA PNG. */
export function renderIcon() {
  const size = 256, ss = 3;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
        let top = null;
        for (const s of SHAPES) if (covers(s, px, py)) top = s;
        if (top) { r += top.color[0]; g += top.color[1]; b += top.color[2]; hits++; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (hits) { raw[o] = Math.round(r / hits); raw[o + 1] = Math.round(g / hits); raw[o + 2] = Math.round(b / hits); }
      raw[o + 3] = Math.round((255 * hits) / (ss * ss));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;   // 8 bits, RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
