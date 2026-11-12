// The sessions hub page: the agent screen of each session (same drawing as the single page, without its title bar and status bar)
// in a grid, the quotas once in the bar at the bottom. One SSE stream feeds every tile. Logic (which sessions, grid shape) is in
// hub_view.js, the beep rule in alerts.js.
import { bestGrid, planTiles, quotaBars, isIdle as idleFor, MAX_TILES } from './hub_view.js';
import { countStates, beepsFor, beep } from './alerts.js';
import { relayLabel } from './format.js';
import { renderScreen, COLOR, rgb565 } from './screen.js';
import { createSettingsMenu, TILES_MAX } from './settings.js';
import { createVectorScreen } from './vector_screen.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const maxParam = Number(params.get('max'));         // ?max=N overrides the setting for this tab
const FRAME = { x: 6, y: 30, w: 472, h: 216 };      // the part of the 480x272 screen a tile shows: the frame, 6 units around the panels on every side
const FLASH_MS = 900;                                 // a tile's frame pulses once when something happens in its session
const MAX_SCALE = 1.5;                                // a lone session on a big screen stops growing at 1.5x the gadget size (708 px wide)
const FRAME_MS = 100;                                 // redraw rate of the single page: the plan pulse runs on 100 ms phases

let state = { sessions: [], settings: {} };
let receivedAt = performance.now();
let sound = 'ask';
let counts = null;
let showAll = false;
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
    box.append(canvas);
    t = { box, canvas, screen: createVectorScreen(canvas, { bare: true }), flashAt: 0 };
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

function drawTile(s, t) {
  const scale = fit(t);
  if (!scale) return;
  const now = Date.now();
  const age = now - t.flashAt;
  const pulse = state.settings?.pulse !== false && age < FLASH_MS ? Math.sin((Math.PI * age) / FLASH_MS) : 0;
  const base = ALERT_RGB[s.dot] ?? FRAME_RGB;
  t.screen.begin(scale, FRAME, pulse > 0 || ALERT_RGB[s.dot] ? mix(base, PULSE_RGB, pulse * 0.85) : null);
  renderScreen(t.screen, { sessions: [s], view: { session: s.id }, agents: [] }, {
    bare: true, elapsedS: elapsed(), menu: false, detail: null, planStep: null, sound, tick: Math.floor(now / 300), pulse: Math.floor(now / 100),
  });
}

function draw() {
  const { tiles: shown } = planTiles(state.sessions, { max: maxTiles(), showAll });
  for (const s of shown) { const t = tiles.get(s.id); if (t) { t.canvas.classList.toggle('idle', isIdle(s) && state.settings?.dim_idle !== false); drawTile(s, t); } }
}

const SOUND_ICON = { all: '🔊', ask: '🔔', off: '🔇' }, SOUND_LABEL = { all: 'all events', ask: 'questions only', off: 'off' };
const settingsMenu = createSettingsMenu({ page: 'hub' });
$('gear').append(settingsMenu.button);

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
  const nodes = shown.map((s) => tileFor(s).box);
  for (const id of [...tiles.keys()]) if (!sessions.some((s) => s.id === id)) tiles.delete(id);
  if (hidden) {
    hiddenBtn.textContent = `${hidden} more session${hidden === 1 ? '' : 's'} hidden (click to show)`;
    nodes.push(hiddenBtn);
  }
  if (!sessions.length) nodes.push(el('div', 'tile empty', `No sessions yet. Events go to ${location.host}`));
  if (nodes.length !== grid.children.length || nodes.some((n, i) => grid.children[i] !== n)) grid.replaceChildren(...nodes);
  draw();
  $('sound').textContent = SOUND_ICON[sound] ?? SOUND_ICON.ask;
  $('sound').title = `Beeps: ${SOUND_LABEL[sound] ?? sound} (click to change)`;
  $('quotas').replaceChildren(...quotaBars(state.usage, elapsed()).map((q) => {
    const d = el('div', `quota ${q.stale ? 'stale' : q.level}`);
    const track = el('div', 'track'), fill = el('div', 'fill');
    fill.style.width = `${Math.min(100, q.pct)}%`;
    track.append(fill);
    const [pct, ...rest] = q.text.split(' ');
    d.append(el('span', '', q.label), track, el('b', '', pct), el('span', '', rest.join(' ')));
    return d;
  }));
  $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showState(next) {
  sound = next.settings?.sound ?? 'ask';
  settingsMenu.update(next.settings ?? {});
  const now = countStates(next.sessions);
  const times = beepsFor(counts, now, sound);
  if (times) beep(times);
  counts = now;
  state = next;
  receivedAt = performance.now();
  const label = relayLabel(next.relay), relayEl = $('relay');
  relayEl.hidden = !label;
  if (label) { relayEl.textContent = label.text; relayEl.title = label.why; relayEl.className = label.ok ? 'ok' : 'down'; }
}

$('sound').onclick = () => {
  const next = sound === 'all' ? 'ask' : sound === 'ask' ? 'off' : 'all';
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sound: next }) });
};

const es = new EventSource('/events');                // the only stream: every tile reads the same state
es.onmessage = (m) => { const next = JSON.parse(m.data); showState(next); render(); flashChanged(next); };
es.onerror = () => document.body.classList.add('offline');
es.onopen = () => document.body.classList.remove('offline');
setInterval(render, 1000);                            // ages and the clock run on between events
setInterval(draw, FRAME_MS);
new ResizeObserver(draw).observe($('tiles'));
render();
