// The page: the gadget screen drawn as vectors at the resolution of the display, redrawn from the hub's state (SSE).
// Taps work like the touchscreen: the title bar opens the session list, a team row shows that agent's detail for 10 s,
// the speaker button cycles the beeps.
import { renderScreen, hitTest, teamOrder, SCR_W, SCR_H } from './screen.js';
import { createVectorScreen } from './vector_screen.js';
import { countStates, beepsFor, beep } from './alerts.js';
import { mountFooter } from './footer.js';
import { createSessionCache } from './session_cache.js';

const MENU_MS = 8000;       // the session list closes by itself after 8 s
const DETAIL_MS = 10000;    // a tapped agent's detail stays 10 s
const FRAME_MS = 100;       // redraw rate: the plan pulse runs on 100 ms phases, the robots blink on 300 ms ticks

const canvas = document.getElementById('screen');
const screen = createVectorScreen(canvas);

let scale = 1;
const cache = createSessionCache(globalThis.localStorage);   // sessions survive a hub restart (stale until the hub confirms them)
let state = { sessions: cache.restore(), view: {}, agents: [] };
let receivedAt = performance.now();
let menuUntil = 0;
let planStep = null;                                 // {session, index, until}: a tapped step of the plan bar
let detail = null;                                   // {session, agent, until}
let sound = 'ask';                                   // shared by every page: kept by the hub (state.settings.sound)
let counts = null;                                   // {needs, turn} of the previous state, for the beeps

const agentsOf = (st) => st.sessions.flatMap((s) => s.agents);

/** Same rule as the buzzer of the gadget (alerts.js). */
function alerts(next) {
  const now = countStates(next.sessions);
  const times = beepsFor(counts, now, sound);
  if (times) beep(times);
  counts = now;
}

const staleTag = document.getElementById('stale');
const footer = mountFooter(document.getElementById('bar'), { page: 'single' });
const SHOWN_H = 250;                                   // the screen without its bottom bar: the page draws that bar itself
let landed = false;

function showState(next) {
  sound = next.settings?.sound ?? 'ask';
  footer.settings.update(next.settings ?? {});
  // The main address opens the view chosen in the settings; "?stay" (or a ?session link) keeps this one.
  if (!landed) {
    landed = true;
    if (next.settings?.view === 'hub' && !location.search) { location.replace('/hub'); return; }
  }
  alerts(next);
  state = next;
  receivedAt = performance.now();
}

function uiNow() {
  const now = Date.now();
  if (detail && now >= detail.until) detail = null;
  if (planStep && now >= planStep.until) planStep = null;
  return {
    elapsedS: Math.floor((performance.now() - receivedAt) / 1000),
    menu: now < menuUntil && state.sessions.length > 1,
    detail,
    planStep,
    sound,
    tick: Math.floor(now / 300),
    pulse: Math.floor(now / 100),
    noBottom: true,
    timeText: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    eventsTo: location.host,
  };
}

function draw() {
  const shown = state.sessions.find((s) => s.id === state.view?.session) ?? state.sessions[0];
  const stale = !!shown?.stale;
  canvas.classList.toggle('stale', stale);
  staleTag.hidden = !stale;
  screen.begin(scale);
  renderScreen(screen, state, uiNow());
  footer.update(state, Math.floor((performance.now() - receivedAt) / 1000));
}

/** The backing store follows the size on screen and the pixel ratio: every shape and letter is drawn sharp. */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.width = width;
  canvas.height = Math.round((width * SHOWN_H) / SCR_W);
  scale = width / SCR_W;
  draw();
}

canvas.addEventListener('click', (e) => {
  const box = canvas.getBoundingClientRect();
  const x = ((e.clientX - box.left) * SCR_W) / box.width, y = ((e.clientY - box.top) * SCR_H) / box.height;
  const ui = uiNow();
  const sel = Math.max(0, state.sessions.findIndex((s) => s.id === state.view?.session));
  const hit = hitTest(x, y, { sessions: state.sessions, selected: sel, menu: ui.menu });
  const now = Date.now();
  if (hit.kind === 'tab') menuUntil = ui.menu || state.sessions.length < 2 ? 0 : now + MENU_MS;
  else if (hit.kind === 'mute') {
    sound = sound === 'all' ? 'ask' : sound === 'ask' ? 'off' : 'all';
    fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sound }) });
  } else if (hit.kind === 'trashRow') {
    menuUntil = now + MENU_MS;                      // the list stays open: several sessions can be hidden in a row
    cache.forget(state.sessions[hit.index].id);
    state = { ...state, sessions: state.sessions.filter((_, i) => i !== hit.index) };
    fetch('/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: state.sessions[hit.index].id }) });
  }
  else if (hit.kind === 'menuRow') {
    menuUntil = 0;
    fetch('/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: state.sessions[hit.index].id, agent: 'lead' }) });
  } else if (hit.kind === 'planStep') {
    const id = state.sessions[sel].id;
    planStep = planStep && planStep.session === id && planStep.index === hit.index ? null : { session: id, index: hit.index, until: now + DETAIL_MS };     // the same step again closes it
  } else if (hit.kind === 'lead') { detail = null; planStep = null; }
  else if (hit.kind === 'row') {
    const s = state.sessions[sel];
    const slot = teamOrder(s.agents.slice(1)).order[hit.index];
    detail = { session: s.id, agent: s.agents[slot].id, until: now + DETAIL_MS };
  }
  draw();
});

// From the sessions hub: /?session=<id> opens that session (the hub holds the view on it for a while).
const wanted = new URLSearchParams(location.search).get('session');
if (wanted) fetch('/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: wanted, agent: 'lead', hold_ms: 120000 }) });

function connect() {
  const es = new EventSource('/events');
  es.onmessage = (m) => { showState(cache.merge(JSON.parse(m.data))); draw(); };
  es.onerror = () => { canvas.classList.add('offline'); };
  es.onopen = () => { canvas.classList.remove('offline'); };
}

new ResizeObserver(resize).observe(canvas);
resize();
setInterval(draw, FRAME_MS);
connect();
