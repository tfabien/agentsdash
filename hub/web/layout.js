// Where tiles go and how big they are, in one place. No DOM, so the tests run it directly; hub_page.js applies the numbers.
// One rule sizes everything: a frame is drawn at scale k (1 = the gadget screen), the same on both axes so text keeps its shape.
// k is limited by the cell (width and height) and by MAX_SCALE. A cell wider or taller than the frame's shape gets a bigger frame
// (more room in the panels) up to the STRETCH limits; full screen has no limit.

export const MAX_TILES = 12;                  // the most cells a page holds
export const GAP = 12;                        // px between cells
export const FRAME = { x: 6, y: 30, w: 472, h: 216 };   // the part of the 480x272 screen a tile shows: 6 units around the panels on every side
export const MAX_SCALE = 1.5;                 // a lone session on a big screen stops growing at 1.5x the gadget size (708 px wide)
export const FOCUS_SCALE = 3;                 // a full-screen session may grow up to 3x
export const MIN_SCALE = 0.8;                 // "Auto" tiles per page: no tile under 0.8x the gadget screen
export const STRETCH = 2.2;                   // a frame is up to 2.2 times wider than the gadget's; each extra column of a wide tile adds the same room
export const COLUMN_SLACK = 0.8;              // more columns win while their scale stays within 80% of the best one: a tall tile has more room for the plan and the command than a wide short one
export const STACK_GAIN = 1.15;               // a team goes under its lead when that makes the frames 15% bigger or more
export const STRETCH_H = 2;                 // and up to 2 times taller: a lone session gets more lines for its prompt and command

/** Scale and frame size (in screen units) of a tile in a cell of `bw` x `bh` px. `span`: columns of the cell (a widened tile has more room to stretch). */
export function tileSize(bw, bh, { focus = false, span = 1 } = {}) {
  const k = Math.min(bw / FRAME.w, bh / FRAME.h, focus ? FOCUS_SCALE : MAX_SCALE);
  if (focus) return { k, fw: bw / k, fh: bh / k };
  return { k, fw: Math.min(bw / k, FRAME.w * (1 + (STRETCH - 1) * span)), fh: Math.min(bh / k, FRAME.h * STRETCH_H) };
}

/** Where items of the given column `spans` go in a grid of `cols` columns: each one takes the first row with room for it (a single tile after a
 * team fills the hole beside an earlier single tile), and the rightmost single tile of a row that stays short widens to fill it (3 tiles in
 * 2 columns: the third one is double width). A team keeps its 2 columns. Returns `cells` ({row, col, span}, 0-based) in the order of `spans`, and `rows`. */
export function placeItems(spans, cols) {
  const free = [];                                                 // free columns left in each row
  const cells = spans.map((span) => {
    let row = free.findIndex((f) => f >= span);
    if (row < 0) { row = free.length; free.push(cols); }
    const col = cols - free[row];
    free[row] -= span;
    return { row, col, span };
  });
  free.forEach((f, row) => {
    if (!f) return;
    const last = cells.filter((c) => c.row === row).reduce((a, c) => (c.col > a.col ? c : a));
    if (last.span === 1) last.span += f;
  });
  return { cells, rows: free.length };
}

/** Columns and rows that give the biggest frames for items spanning 1 column (a session) or 2 (a session and its team, side by side)
 * in a box of `boxW` x `boxH` px. Ties go to more columns. Box size unknown (page hidden): a square-ish grid. */
export function bestLayout(spans, boxW, boxH, { gap = GAP, maxScale = MAX_SCALE } = {}) {
  if (!spans.length) return { cols: 1, rows: 1 };
  const total = spans.reduce((a, b) => a + b, 0), widest = Math.max(...spans);
  if (total <= 1 || !(boxW > 0) || !(boxH > 0)) { const cols = Math.max(widest, Math.ceil(Math.sqrt(total))); return { cols, rows: placeItems(spans, cols).rows }; }
  const options = [];
  for (let cols = widest; cols <= Math.max(widest, total); cols++) {
    const rows = placeItems(spans, cols).rows;
    const k = Math.min((boxW - gap * (cols - 1)) / cols / FRAME.w, (boxH - gap * (rows - 1)) / rows / FRAME.h, maxScale);
    options.push({ cols, rows, k });
  }
  const top = Math.max(...options.map((o) => o.k));
  const best = options.filter((o) => o.k >= top * COLUMN_SLACK - 1e-9).pop();      // the most columns whose screens are not much smaller than the biggest
  return { cols: best.cols, rows: best.rows };
}

/** Scale of the frames in a grid of `cols` x `rows` cells; `rowUnits` frames stacked in a cell share its height (2 for a team stacked under its lead). */
function gridScale(cols, rows, boxW, boxH, gap, maxScale, rowUnits = 1) {
  const cellH = (boxH - gap * (rows - 1)) / rows / rowUnits - (rowUnits > 1 ? gap / 2 : 0);
  return Math.min((boxW - gap * (cols - 1)) / cols / FRAME.w, cellH / FRAME.h, maxScale);
}

/** Side by side or stacked? `spans` as in bestLayout (2 = a session with a team). Side by side: the team is a second column (bestLayout). Stacked: every session is
 * one cell and its team goes under it, so the frames keep the cell's full width. Stacked wins when its frames are at least STACK_GAIN times bigger, which follows the
 * box's width/height ratio and keeps the layout from flipping on a small resize. Returns {stacked, cols, rows}. */
export function chooseLayout(spans, boxW, boxH, { gap = GAP, maxScale = MAX_SCALE } = {}) {
  const side = bestLayout(spans, boxW, boxH, { gap, maxScale });
  if (!spans.includes(2) || !(boxW > 0) || !(boxH > 0)) return { stacked: false, ...side };
  const n = spans.length, units = 2;
  const options = [];
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    options.push({ cols, rows, k: gridScale(cols, rows, boxW, boxH, gap, maxScale, units) });
  }
  const top = Math.max(...options.map((o) => o.k));
  const best = options.filter((o) => o.k >= top * COLUMN_SLACK - 1e-9).pop();
  const kSide = gridScale(side.cols, side.rows, boxW, boxH, gap, maxScale);
  return best.k >= kSide * STACK_GAIN ? { stacked: true, cols: best.cols, rows: best.rows } : { stacked: false, ...side };
}

/** Cells that fit a box without a tile dropping under MIN_SCALE (the "Auto" tiles per page), at most `cap`. */
export function autoCapacity(boxW, boxH, { gap = GAP, cap = MAX_TILES } = {}) {
  if (!(boxW > 0) || !(boxH > 0)) return cap;
  const cols = Math.floor((boxW + gap) / (FRAME.w * MIN_SCALE + gap)), rows = Math.floor((boxH + gap) / (FRAME.h * MIN_SCALE + gap));
  return Math.max(1, Math.min(cap, cols * rows));
}

/** Cuts the ordered sessions into pages of at most `max` cells, in order, never splitting a session (its lead and team tiles stay together).
 * A session bigger than a page (a team at `max` 1) gets a page of its own. `cost(s)`: cells a session takes (default 1). */
export function paginate(sessions, { max = MAX_TILES, cost = () => 1 } = {}) {
  const pages = [];
  let cur = [], used = 0;
  for (const s of sessions) {
    const c = cost(s);
    if (cur.length && used + c > max) { pages.push(cur); cur = []; used = 0; }
    cur.push(s);
    used += c;
  }
  if (cur.length) pages.push(cur);
  return pages;
}
