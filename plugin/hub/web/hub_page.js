// The sessions hub page: the agent screen of each session (same drawing as the single page, without its title bar and status bar)
// in a grid, the quotas once in the bar at the bottom. One SSE stream feeds every tile. Logic (which sessions, grid shape) is in
// hub_view.js, the beep rule in alerts.js.
import { bestGrid, planTiles, isIdle as idleFor, MAX_TILES } from './hub_view.js';
import { countStates, beepsFor, beep } from './alerts.js';
import { renderScreen, hitTest, teamOrder, COLOR, rgb565 } from './screen.js';
import { TILES_MAX } from './settings.js';
import { mountFooter } from './footer.js';
import { createVectorScreen } from './vector_screen.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const maxParam = Number(params.get('max'));         // ?max=N overrides the setting for this tab
const FRAME = { x: 6, y: 30, w: 472, h: 216 };      // the part of the 480x272 screen a tile shows: the frame, 6 units around the panels on every side
const DETAIL_MS = 10000;                              // a tapped agent or plan step stays open 10 s, like on the single page
const FLASH_MS = 900;                                 // a tile's frame pulses once when something happens in its session
const MAX_SCALE = 1.5;                                // a lone session on a big screen stops growing at 1.5x the gadget size (708 px wide)
const FRAME_MS = 100;                                 // redraw rate of the single page: the plan pulse runs on 100 ms phases

let state = { sessions: [], settings: {} };
let receivedAt = performance.now();
let sound = 'ask';
let counts = null;
let showAll = false;
const seen = new Map();                               // session id -> rank of its first appearance, the order of the grid
const tiles = new Map();                              // session id -> {box, canvas, screen}: kept between frames, never rebuilt

const sigs = new Map();                               // session id -> what it showed last, without the ticking ages

// Something happened in a session: its tile frame pulses once (drawn in the canvas, see vector_screen.js). Ages and the clock are left out of the comparison; a session
// that went idle (your turn, done) does not flash.
const IDLE = new Set(['your_turn', 'done']);
const strip = (s) => JSON.stringify(s, (k, v) => (k === 'age' || k === 'prev_age' ? undefined : v));
function flashChanged(next) {
  for (const s of next.sessions) {
    const sig = strip(s), before = sigs.get(s.id);
    sigs.set(s.id, sig);
    const t = tiles.get(s.id);
    if (before === undefined || before === sig || !t || IDLE.has(s.dot)) continue;
    t.flashAt = Date.now();
  }
  for (const id of [...sigs.keys()]) if (!next.sessions.some((s) => s.id === id)) sigs.delete(id);
}

const maxTiles = () => Math.min(TILES_MAX, Math.max(2, maxParam || state.settings?.max_tiles || MAX_TILES));
const isIdle = (s) => idleFor(s, elapsed());          // greyed out after 5 minutes waiting for you; the hub drops the session after 10

// The frame is the one place that says how a session is doing: orange when it needs you, red on an error, a light blue pulse on an event.
const FRAME_RGB = rgb565(COLOR.FRAME), PULSE_RGB = [126, 170, 235];
const ALERT_RGB = { needs_you: [247, 138, 59], error: [235, 77, 77] };
const mix = (a, b, k) => a.map((c, i) => c + (b[i] - c) * k);

const elapsed = () => Math.floor((performance.now() - receivedAt) / 1000);

function tileFor(s) {
  let t = tiles.get(s.id);
  if (!t) {
    const canvas = el('canvas');
    const box = el('div', 'tile');
    box.dataset.session = s.id;
    box.append(canvas);
    t = { box, canvas, screen: createVectorScreen(canvas, { bare: true }), flashAt: 0, session: null, detail: null, planStep: null };
    canvas.addEventListener('click', (e) => tap(t, e));
    tiles.set(s.id, t);
  }
  t.canvas.className = `${s.dot}${isIdle(s) && state.settings?.dim_idle !== false ? ' idle' : ''}`;
  return t;
}

/** The canvas takes the largest size of the frame's aspect ratio that fits its cell, at the pixel ratio of the display. */
function fit(t) {
  const dpr = window.devicePixelRatio || 1;
  const bw = t.box.clientWidth, bh = t.box.clientHeight;
  if (!bw || !bh) return 0;
  const k = Math.min(bw / FRAME.w, bh / FRAME.h, MAX_SCALE);
  const w = Math.max(1, Math.round(FRAME.w * k * dpr)), h = Math.max(1, Math.round((FRAME.h * w) / FRAME.w));
  if (t.canvas.width !== w || t.canvas.height !== h) { t.canvas.width = w; t.canvas.height = h; }
  t.canvas.style.width = `${w / dpr}px`;               // one canvas pixel per device pixel: no resampling, the frame stays even on every side
  t.canvas.style.height = `${h / dpr}px`;
  t.canvas.style.borderRadius = `${(7 * w) / FRAME.w / dpr}px`;       // the corner radius of the frame
  return w / FRAME.w;
}

/** A tap on a tile works like a tap on the single page: a team row opens that agent for 10 s, a plan step previews it, the lead panel closes them. */
function tap(t, e) {
  const s = t.session;
  if (!s) return;
  const box = t.canvas.getBoundingClientRect();
  const x = FRAME.x + ((e.clientX - box.left) * FRAME.w) / box.width, y = FRAME.y + ((e.clientY - box.top) * FRAME.h) / box.height;
  const hit = hitTest(x, y, { sessions: [s], selected: 0, menu: false });
  const until = Date.now() + DETAIL_MS;
  if (hit.kind === 'row') t.detail = { session: s.id, agent: s.agents[1 + teamOrder(s.agents.slice(1)).order[hit.index] - 1].id, until };
  else if (hit.kind === 'planStep') t.planStep = t.planStep && t.planStep.index === hit.index ? null : { session: s.id, index: hit.index, until };
  else if (hit.kind === 'lead') { t.detail = null; t.planStep = null; }
  drawTile(s, t);
}

function drawTile(s, t) {
  t.session = s;
  const now = Date.now();
  if (t.detail && now >= t.detail.until) t.detail = null;
  if (t.planStep && now >= t.planStep.until) t.planStep = null;
  const scale = fit(t);
  if (!scale) return;
  const age = now - t.flashAt;
  const pulse = state.settings?.pulse !== false && age < FLASH_MS ? Math.sin((Math.PI * age) / FLASH_MS) : 0;
  const base = ALERT_RGB[s.dot] ?? FRAME_RGB;
  t.screen.begin(scale, FRAME, pulse > 0 || ALERT_RGB[s.dot] ? mix(base, PULSE_RGB, pulse * 0.85) : null);
  renderScreen(t.screen, { sessions: [s], view: { session: s.id }, agents: [] }, {
    bare: true, elapsedS: elapsed(), menu: false, detail: t.detail, planStep: t.planStep, sound, tick: Math.floor(now / 300), pulse: Math.floor(now / 100),
  });
}

function draw() {
  const { tiles: shown } = planTiles(state.sessions, { max: maxTiles(), showAll });
  for (const s of shown) { const t = tiles.get(s.id); if (t) { t.canvas.classList.toggle('idle', isIdle(s) && state.settings?.dim_idle !== false); drawTile(s, t); } }
}

const footer = mountFooter($('bar'), { page: 'hub' });

const hiddenBtn = el('button', 'tile empty');         // one node for good: a node replaced between mouse down and up loses the click
hiddenBtn.onclick = () => { showAll = true; render(); };

function render() {
  const sessions = state.sessions;
  const { tiles: shown, hidden } = planTiles(sessions, { max: maxTiles(), showAll });
  const cells = shown.length + (hidden ? 1 : 0);
  const grid = $('tiles');
  const { cols, rows } = bestGrid(cells, grid.clientWidth, grid.clientHeight, FRAME.w / FRAME.h, 12, FRAME.w * MAX_SCALE);
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', rows);
  for (const s of sessions) if (!seen.has(s.id)) seen.set(s.id, seen.size);
  const nodes = [...shown].sort((x, y) => seen.get(x.id) - seen.get(y.id)).map((s) => tileFor(s).box);   // first seen, first placed: tiles do not jump under the pointer when the hub reorders
  for (const id of [...tiles.keys()]) if (!sessions.some((s) => s.id === id)) { tiles.delete(id); seen.delete(id); }
  if (hidden) {
    hiddenBtn.textContent = `${hidden} more session${hidden === 1 ? '' : 's'} hidden (click to show)`;
    nodes.push(hiddenBtn);
  }
  if (!sessions.length) nodes.push(el('div', 'tile empty', `No sessions yet. Events go to ${location.host}`));
  if (nodes.length !== grid.children.length || nodes.some((n, i) => grid.children[i] !== n)) grid.replaceChildren(...nodes);
  draw();
  footer.update(state, elapsed());
}

function showState(next) {
  sound = next.settings?.sound ?? 'ask';
  footer.settings.update(next.settings ?? {});
  const now = countStates(next.sessions);
  const times = beepsFor(counts, now, sound);
  if (times) beep(times);
  counts = now;
  state = next;
  receivedAt = performance.now();
}

const es = new EventSource('/events');                // the only stream: every tile reads the same state
es.onmessage = (m) => { const next = JSON.parse(m.data); showState(next); render(); flashChanged(next); };
es.onerror = () => document.body.classList.add('offline');
es.onopen = () => document.body.classList.remove('offline');
setInterval(render, 1000);                            // ages and the clock run on between events
setInterval(draw, FRAME_MS);
new ResizeObserver(draw).observe($('tiles'));
render();
