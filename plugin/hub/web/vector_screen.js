// A canvas as the `screen` object of screen.js, drawn as vectors at the resolution of the display: no bitmap is scaled up.
// Positions are the gadget's 480x272 units (the layout is the same), the canvas has `scale` device pixels per unit.
// The pictures of the .tft are redrawn here: background panels, rows, and the agent icons (drawn by the icon pack of the active theme, see themes.js).
import { COLOR, rgb565 } from './screen.js';
import { activeIconPack } from './themes.js';

const css = (c) => { const [r, g, b] = rgb565(c); return `rgb(${r},${g},${b})`; };
const FAMILY = '"Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const FONT = { 12: `600 11px ${FAMILY}`, 16: `600 14px ${FAMILY}`, 20: `700 18px ${FAMILY}` };
const LINE_H = { 12: 14, 16: 18, 20: 22 };

/** One agent icon of the active icon pack in its 36x42 box at (x, y), `k` times bigger (1 big, 2/3 small, 4/9 tiny). Blinking closes the eyes. */
function drawRobot(ctx, role, x, y, k, blink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  activeIconPack().draw(ctx, role, blink);
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns screen object for renderScreen, plus `begin(scale)`: call before each frame (sets the transform and clears).
 */
export function createVectorScreen(canvas, { bare = false } = {}) {
  const ctx = canvas.getContext('2d');
  let frameRgb = null;                                 // [r, g, b] of the frame when a hub tile tints it (alert, pulse); null: the usual colour

  const path = (x, y, w, h, r) => { ctx.beginPath(); if (r > 0) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
  const rect = (x, y, w, h, r, fill) => { path(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

  /** Decor of the .tft: picture 16. */
  const frameCss = () => (frameRgb ? `rgb(${frameRgb.map(Math.round).join(',')})` : css(COLOR.FRAME));

  function drawBackground() {
    // A hub tile (bare) is the frame alone, as wide on the right as on the left, over a transparent canvas.
    if (bare) rect(6, 30, 472, 216, 7, frameCss());
    else { rect(0, 0, 480, 272, 0, css(COLOR.BAR)); rect(6, 30, 468, 216, 7, frameCss()); }
    rect(12, 36, 150, 204, 6, css(COLOR.PANEL));
    rect(170, 36, 302, 204, 6, css(COLOR.PANEL));
  }

  const font = (id) => { ctx.font = FONT[id]; };
  // Pills for thin shapes (bars, caret, speaker), small radius for chips, rows and the title bar.
  const radiusOf = (w, h) => (Math.min(w, h) <= 10 ? Math.min(w, h) / 2 : h >= 16 && h <= 40 && w > 20 ? 5 : 0);

  return {
    /** `origin`: top left corner of the part of the 480x272 screen the canvas shows (a tile shows the frame only). */
    begin(scale, origin = { x: 0, y: 0 }, frame = null) {
      frameRgb = frame;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
      ctx.textBaseline = 'middle';
    },
    measure(s, id) { font(id); return ctx.measureText(s).width; },      // in screen units: measureText ignores the transform
    pic(id, x, y) {
      if (id === 16) { drawBackground(); return; }
      if (id === 17) { rect(x, y, 290, 42, 6, css(COLOR.ROW)); return; }
      if (id === 18) { rect(x, y, 290, 22, 5, css(COLOR.ROW)); return; }
      if ((id >= 27 && id <= 50) || (id >= 63 && id <= 86)) {                 // robots, then their blinking frames
        const blink = id >= 63;
        const base = blink ? id - 36 : id;
        const size = base < 35 ? 1 : base < 43 ? 24 / 36 : 16 / 36;
        const role = (base - 27) % 8;
        drawRobot(ctx, role, x, y, size, blink);
        return;
      }
    },
    erase(x, y, w, h) { ctx.save(); path(x, y, w, h, 0); ctx.clip(); drawBackground(); ctx.restore(); },
    fill(x, y, w, h, c) { rect(x, y, w, h, radiusOf(w, h), css(c)); },
    rect(x, y, w, h, c) { path(x + 0.5, y + 0.5, w - 1, h - 1, 5); ctx.strokeStyle = css(c); ctx.lineWidth = 1; ctx.stroke(); },
    circle(cx, cy, r, c) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = css(c); ctx.fill(); },
    ring(cx, cy, r, width, frac, fg, track) {            // a circle outline filled clockwise from the top up to `frac` (0..1)
      ctx.lineWidth = width; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = css(track); ctx.stroke();
      if (frac > 0) { ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(frac, 1)); ctx.strokeStyle = css(fg); ctx.stroke(); }
    },
    line(x1, y1, x2, y2, c) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = css(c); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke(); },
    text(x, y, w, id, fg, _bg, s, align = 0) {           // no box fill: the whole frame is redrawn
      font(id);
      ctx.fillStyle = css(fg);
      const tw = ctx.measureText(s).width;
      const tx = align === 0 ? x : align === 1 ? x + (w - tw) / 2 : x + w - tw;
      ctx.fillText(s, tx, y + LINE_H[id] / 2 + 0.5);
    },
  };
}
