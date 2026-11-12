// The sessions hub page: one tile per session in a grid, the quotas once in the bar at the bottom. One SSE stream feeds every
// tile. A tile is a link to that session full page. Logic (what to show) is in hub_view.js, the beep rule in alerts.js.
import { gridShape, planTiles, tileModel, quotaBars, summaryText, MAX_TILES } from './hub_view.js';
import { countStates, beepsFor, beep } from './alerts.js';
import { relayLabel } from './format.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const $ = (id) => document.getElementById(id);
const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const params = new URLSearchParams(location.search);
const max = Math.max(2, Number(params.get('max')) || MAX_TILES);

let state = { sessions: [] };
let receivedAt = performance.now();
let sound = 'ask';
let counts = null;
let showAll = false;
const tileEls = new Map();                         // session id -> its <a>: kept between frames so a click is never lost to a redraw

const elapsed = () => Math.floor((performance.now() - receivedAt) / 1000);

function tileEl(t) {
  const a = tileEls.get(t.id) ?? el('a', 'tile');
  tileEls.set(t.id, a);
  a.className = `tile ${t.stateKey}`;
  a.href = `/?session=${encodeURIComponent(t.id)}`;
  a.title = 'Open this session full page';
  const top = el('div', 'top');
  const avatar = el('div', 'avatar');
  avatar.style.setProperty('--c', `hsl(${hue(t.project)} 55% 55%)`);
  const who = el('div', 'who');
  who.append(el('div', 'name', t.title), el('div', `state ${t.stateKey}`, t.stateText));
  const dots = el('div', 'dots');
  for (const d of t.dots) dots.append(el('span', `dot ${d}`));
  if (t.moreDots) dots.append(el('span', '', `+${t.moreDots}`));
  top.append(avatar, who, dots);
  const kids = [top];
  if (t.ctxPct !== null) {
    const ctx = el('div', `ctx ${t.ctxLevel}`);
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    fill.style.width = `${Math.min(100, t.ctxPct)}%`;
    track.append(fill);
    ctx.append(track, el('span', 'pct', `${t.ctxPct}%`));
    ctx.title = 'context used';
    kids.push(ctx);
  }
  if (t.ask) {
    const ask = el('div', 'ask');
    ask.append(el('b', '', t.ask.question));
    const opts = el('div', 'opts');
    t.ask.options.forEach((o, i) => { const s = el('span'); s.append(el('i', '', String(i + 1)), o); opts.append(s); });
    ask.append(opts);
    kids.push(ask);
  } else if (t.cmd) kids.push(el('div', 'cmd', t.cmd));
  kids.push(el('div', 'grow'));
  if (t.plan && !t.ask) {
    const plan = el('div', 'plan');
    const segs = el('div', 'segs');
    if (t.plan.segs) for (const k of t.plan.segs) segs.append(el('span', `seg ${k}`));
    else {
      const done = el('span', 'seg d');
      done.style.flex = 'none';
      done.style.width = `${t.plan.frac * 100}%`;
      segs.append(done, el('span', 'seg'));
    }
    plan.append(el('div', 'label', t.plan.label), segs);
    if (t.plan.cur) plan.append(el('div', 'cur', t.plan.cur));
    if (t.plan.next) plan.append(el('div', 'next', `next: ${t.plan.next}`));
    kids.push(plan);
  } else if (!t.plan && !t.ask) kids.push(el('div', 'noplan', 'no plan'));
  a.replaceChildren(...kids);
  return a;
}

function render() {
  const sessions = state.sessions;
  const { tiles, hidden } = planTiles(sessions, { max, showAll });
  const cells = tiles.length + (hidden ? 1 : 0);
  const { cols, rows } = gridShape(cells);
  const grid = $('tiles');
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', rows);
  const nodes = tiles.map((s) => tileEl(tileModel(s, elapsed())));
  for (const id of [...tileEls.keys()]) if (!sessions.some((s) => s.id === id)) tileEls.delete(id);
  if (hidden) {
    const b = el('button', 'tile empty', `${hidden} more session${hidden === 1 ? '' : 's'} hidden (click to show)`);
    b.onclick = () => { showAll = true; render(); };
    nodes.push(b);
  }
  if (!sessions.length) nodes.push(el('div', 'tile empty', `No sessions yet. Events go to ${location.host}`));
  grid.replaceChildren(...nodes);
  $('summary').textContent = summaryText(sessions);
  $('grid').textContent = `grid ${cols} x ${rows}`;
  const fold = $('fold');
  fold.hidden = sessions.length <= max;
  fold.textContent = showAll ? 'fold idle' : 'show all';
  $('sound').textContent = `beeps: ${sound}`;
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
$('fold').onclick = () => { showAll = !showAll; render(); };

const es = new EventSource('/events');                // the only stream: every tile reads the same state
es.onmessage = (m) => { showState(JSON.parse(m.data)); render(); };
es.onerror = () => document.body.classList.add('offline');
es.onopen = () => document.body.classList.remove('offline');
setInterval(render, 1000);                            // ages and the clock run on between events
render();
