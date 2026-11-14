// The sessions page: the agent screen of each session in a grid, the quotas once in the bar at the bottom. Sessions beyond the tiles per page
// go to more pages (arrows, swipe). One SSE stream feeds every tile. Logic: order and tile text in hub_view.js, grid shape, sizes and pages in layout.js, the beep rule in alerts.js.
import { rateLevel } from './rate_glow.js';
import { orderSessions, pageAlert, sideAlerts, focusAlerts, isIdle as idleFor, waitsForYou, hasTeam, cellsOf } from './hub_view.js';
import { FRAME, MAX_SCALE, FOCUS_SCALE, MAX_TILES, tileSize, bestLayout, placeItems, autoCapacity, paginate } from './layout.js';
import { countStates, beepsFor, beep } from './alerts.js';
import { renderScreen, hitTest, permAnswer, questTap, teamOrder, COLOR, rgb565 } from './screen.js';
import { postSettings } from './settings.js';
import { mountFooter } from './footer.js';
import { createVectorScreen } from './vector_screen.js';
import { createSessionCache } from './session_cache.js';
import { applyTheme, setCatalog } from './themes.js';
import { previewSessions } from './preview_state.js';
import { onIconsLoaded } from './icon_packs.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const maxParam = Number(params.get('max'));         // ?max=N overrides the setting for this tab
const DETAIL_MS = 10000;                              // a tapped plan step stays open 10 s
const FLASH_MS = 900;                                 // a tile's frame pulses once when something happens in its session
const FRAME_MS = 100;                                // redraw rate of the single page: the plan pulse runs on 100 ms phases

const cache = createSessionCache(globalThis.localStorage);   // sessions survive a hub restart (stale until the hub confirms them)
let state = { sessions: cache.restore(), settings: {} };
let receivedAt = performance.now();
let sound = 'ask';
let counts = null;
let page = 0, pages = [], current = [];               // the page shown, all pages, and its sessions
let focus = null;                                      // session id shown full screen (tap on a tile; the Back button at the left or Esc returns), null in the grid
let expandable = false;                                // a tap can expand only when the grid shows several cells
const PHONE = document.documentElement.dataset.mode === 'phone';   // phone page: one session per page
let stacked = false;                                   // portrait phone: the team goes under the lead; landscape keeps them side by side
const SWIPE_PX = 50;                                  // a horizontal swipe of 50 px or more turns the page
const seen = new Map();                               // session id -> rank of its first appearance, the order of the grid
const tiles = new Map();                              // tile key -> {box, canvas, screen, part}: kept between frames, never rebuilt. A session has a lead tile (key: its id) and, with sub-agents, a team tile (key: id + '#team')
const keyOf = (id, part) => (part === 'team' ? `${id}#team` : id);
const partsOf = (s) => (hasTeam(s) ? ['lead', 'team'] : ['lead']);

const sigs = new Map();                               // session id -> what it showed last, without the ticking ages

// Something happened in a session: its tile frame pulses once (drawn in the canvas, see vector_screen.js). Ages and the clock are left out of the comparison; a session
// that went idle (your turn, done) does not flash.
const IDLE = new Set(['your_turn', 'done']);
const strip = (s) => JSON.stringify(s, (k, v) => (k === 'age' || k === 'prev_age' ? undefined : v));
function flashChanged(next) {
  for (const s of next.sessions) {
    const sig = strip(s), before = sigs.get(s.id);
    sigs.set(s.id, sig);
    if (before === undefined || before === sig || IDLE.has(s.dot)) continue;
    for (const part of partsOf(s)) { const t = tiles.get(keyOf(s.id, part)); if (t) t.flashAt = Date.now(); }
  }
  for (const id of [...sigs.keys()]) if (!next.sessions.some((s) => s.id === id)) sigs.delete(id);
}

/** Cells per page: the setting (1 to 12; 1 shows one session at a time), or, when it is 0 (Auto), what fits the window. */
function capacity() {
  if (PHONE) return 1;
  const n = maxParam || state.settings?.max_tiles || 0;
  if (n) return Math.min(MAX_TILES, Math.max(1, n));
  const grid = $('tiles');
  return autoCapacity(grid.clientWidth, grid.clientHeight);
}
const isIdle = (s) => idleFor(s, elapsed(), (state.settings?.idle_minutes ?? 5) * 60);   // greyed out after idle_minutes waiting for you (default 5); the hub drops the session after 10

// The frame is the one place that says how a session is doing: orange when it needs you, red on an error, a light blue pulse on an event.
const frameRgb = () => rgb565(COLOR.FRAME), PULSE_RGB = [126, 170, 235];
const ALERT_RGB = { needs_you: [247, 138, 59], error: [235, 77, 77] };
const mix = (a, b, k) => a.map((c, i) => c + (b[i] - c) * k);

const elapsed = () => Math.floor((performance.now() - receivedAt) / 1000);

function tileFor(s, part = 'lead') {
  const key = keyOf(s.id, part);
  let t = tiles.get(key);
  if (!t) {
    const canvas = el('canvas');
    const box = el('div', 'tile');
    box.dataset.session = s.id;
    box.dataset.part = part;
    box.append(canvas, el('span', 'stale-tag', 'stale'));
    if (part === 'lead') box.append(el('span', 'rate-tag'));
    if (part === 'lead') {
      const trash = el('button', 'trash', '\u{1F5D1}');    // shown on tiles waiting for you and stale ones: hides the session until it works again
      trash.title = 'Remove this session';
      trash.onclick = (e) => {
        e.stopPropagation();
        const id = s.id;
        const dimmed = box.classList.contains('idle') || box.classList.contains('stale');
        if (!dimmed && !confirm('This session is waiting for you. Remove it anyway?')) return;   // a tile that is not greyed out yet asks first
        cache.forget(id);                                  // a session the hub no longer knows (404) would come back from the cache otherwise
        state = { ...state, sessions: state.sessions.filter((x) => x.id !== id) };
        render();
        fetch('/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: id }) }).catch(() => {});
      };
      box.append(trash);
    }
    t = { box, canvas, screen: createVectorScreen(canvas, { bare: true }), part, flashAt: 0, session: null, detail: null, planStep: null };
    canvas.addEventListener('click', (e) => tap(t, e));
    tiles.set(key, t);
  }
  t.box.classList.toggle('stale', !!s.stale);
  t.box.classList.toggle('waiting', waitsForYou(s));
  t.box.classList.toggle('idle', isIdle(s) && state.settings?.dim_idle !== false);
  const rate = part === 'lead' ? rateLevel(s, state.settings) : null;      // the readout shows the token rate of the session
  t.canvas.className = `${s.dot}${s.stale ? ' stale' : ''}${isIdle(s) && state.settings?.dim_idle !== false ? ' idle' : ''}`;
  const tag = t.box.querySelector('.rate-tag');
  if (tag) { tag.textContent = rate ? rate.label : ''; tag.hidden = !rate; tag.className = `rate-tag${rate ? ` rate-${rate.level}` : ''}`; }      // only the readout is colored: the pulse keeps meaning an event or an alert
  return t;
}

/** Which side a tile is welded on: the lead of a session with sub-agents touches its team on the right, the team touches its lead on the left. */
const weldOf = (t) => (!stacked && t.session && hasTeam(t.session) ? (t.part === 'team' ? 'left' : 'right') : '');

/** The canvas takes the largest size of the frame's aspect ratio that fits its cell, at the pixel ratio of the display. */
function fit(t) {
  const dpr = window.devicePixelRatio || 1;
  const bw = t.box.clientWidth, bh = t.box.clientHeight;
  if (!bw || !bh) return 0;
  const { k, fw, fh } = tileSize(bw, bh, { focus: Boolean(focus), span: t.span });   // text size is the same in a full-screen session: the extra room holds more text
  const w = Math.max(1, Math.round(fw * k * dpr)), h = Math.max(1, Math.round(fh * k * dpr));
  if (t.canvas.width !== w || t.canvas.height !== h) { t.canvas.width = w; t.canvas.height = h; }
  t.canvas.style.width = `${w / dpr}px`;               // one canvas pixel per device pixel: no resampling, the frame stays even on every side
  t.canvas.style.height = `${h / dpr}px`;
  const r = `${7 * k}px`;                                // the corner radius of the frame; a tile welded to its team or lead has square corners on that side
  t.canvas.style.borderRadius = weldOf(t) === 'right' ? `${r} 0 0 ${r}` : weldOf(t) === 'left' ? `0 ${r} ${r} 0` : r;
  t.box.style.setProperty('--trash-x', `${(bw - w / dpr) / 2 + 10}px`);        // the trash button sits at the bottom right of the frame, under the context
  t.box.style.setProperty('--trash-y', `${(bh - h / dpr) / 2 + 10}px`);
  if (t.box.parentElement?.classList.contains('group')) t.box.parentElement.style.setProperty('--link-y', `${(bh - h / dpr) / 2 + 16}px`);   // the chip on the seam stays inside the frames, not at the bottom of the cell
  t.frameW = fw;
  t.frameH = Math.max(FRAME.h, fh);
  return k;
}

/** A tap on a tile: a team row opens that agent as a tile in place of the team list (BACK returns), a plan step previews it for 10 s, the lead panel closes it. */
function tap(t, e) {
  const s = t.session;
  if (!s) return;
  const box = t.canvas.getBoundingClientRect();
  const x = FRAME.x + ((e.clientX - box.left) * (t.frameW ?? FRAME.w)) / box.width, y = FRAME.y + ((e.clientY - box.top) * (t.frameH ?? FRAME.h)) / box.height;
  const lead0 = tiles.get(s.id) ?? t;
  const detailOpen = Boolean(lead0.detail && s.agents.some((a) => a.id === lead0.detail.agent));
  const hit = hitTest(x, y, { sessions: [s], selected: 0, menu: false, part: t.part, frameW: t.frameW, frameH: t.frameH, detailOpen, quest: lead0.quest });
  const answer = permAnswer(hit, s);
  if (answer) {                                           // Allow or Deny of a permission request: the state that follows redraws the tile
    fetch('/permission/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(answer) }).catch(() => {});
    return;
  }
  const quest = questTap(hit, s, lead0.quest);
  if (quest) {                                            // a question for the page: the picks so far live on the lead tile, the last one posts them
    lead0.quest = quest.local;
    if (quest.post) {
      fetch('/question/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quest.post) })
        .then((r) => { if (!r.ok && lead0.quest?.id === quest.post.id) { lead0.quest = null; drawTile(s, lead0); } })    // refused (expired, answered elsewhere): start over
        .catch(() => {});
    }
    drawTile(s, t);
    return;
  }
  const until = Date.now() + DETAIL_MS;
  const lead = tiles.get(s.id) ?? t;                      // the agent opened from the team tile shows in the lead tile, which owns the detail
  if (hit.kind === 'row') lead.detail = { session: s.id, agent: s.agents[1 + teamOrder(s.agents.slice(1)).order[hit.index] - 1].id, until: Infinity };    // a sub-agent opens as a tile in place of the team list until BACK
  else if (hit.kind === 'back') lead.detail = null;
  else if (hit.kind === 'planStep') lead.planStep = lead.planStep && lead.planStep.index === hit.index ? null : { session: s.id, index: hit.index, until };
  else if (hit.kind === 'lead' && lead.planStep) lead.planStep = null;               // the first tap closes an open plan step
  else if ((hit.kind === 'lead' || hit.kind === 'none') && expandable && !focus) { focus = s.id; render(); return; }
  for (const part of partsOf(s)) { const u = tiles.get(keyOf(s.id, part)); if (u) drawTile(s, u); }
}

function drawTile(s, t) {
  t.session = s;
  const now = Date.now();
  const owner = tiles.get(s.id) ?? t;                     // detail and plan step live on the lead tile; the team tile follows them
  if (owner.detail && now >= owner.detail.until) owner.detail = null;
  if (owner.planStep && now >= owner.planStep.until) owner.planStep = null;
  const scale = fit(t);
  if (!scale) return;
  const tag = t.box.querySelector('.rate-tag');                                       // the readout sits inside the frame: the canvas can be narrower than its cell
  if (tag) { tag.style.right = `${t.box.clientWidth - t.canvas.offsetLeft - t.canvas.offsetWidth + 14}px`; tag.style.bottom = `${t.box.clientHeight - t.canvas.offsetTop - t.canvas.offsetHeight + 10}px`; }
  const age = now - t.flashAt;
  const pulse = state.settings?.pulse !== false && age < FLASH_MS ? Math.sin((Math.PI * age) / FLASH_MS) : 0;
  const base = ALERT_RGB[s.dot] ?? frameRgb();
  t.screen.begin(scale * (window.devicePixelRatio || 1), FRAME, pulse > 0 || ALERT_RGB[s.dot] ? mix(base, PULSE_RGB, pulse * 0.85) : null, t.frameW, weldOf(t), t.frameH);
  renderScreen(t.screen, { sessions: [s], view: { session: s.id }, agents: [], settings: state.settings }, {
    bare: true, part: t.part, frameW: t.frameW, frameH: t.frameH, elapsedS: elapsed(), menu: false, detail: owner.detail, planStep: owner.planStep, quest: owner.quest, sound, tick: Math.floor(now / 300), pulse: Math.floor(now / 100),
  });
}

function draw() {
  for (const s of current) {
    const idle = isIdle(s) && state.settings?.dim_idle !== false;
    for (const part of partsOf(s)) {
      const t = tiles.get(keyOf(s.id, part));
      if (t) { t.box.classList.toggle('idle', idle); t.canvas.classList.toggle('idle', idle); t.canvas.classList.toggle('stale', !!s.stale); drawTile(s, t); }
    }
  }
}

// Live preview of a theme on made-up sessions (preview_state.js): the tiles take its colors and icons, nothing is saved and the real sessions are
// not shown. `spec`: { name, label, installed, source, theme?, roles? }; a theme that is not installed brings its colors and icon URLs, and is put
// in the catalog of the page for the time of the preview. The Back button (or Escape) returns to the theme list; Apply saves the theme (and
// installs it first when needed). Another page changing the saved theme ends the preview.
let preview = null;
let previewList = [];
let savedTheme = 'default';
let savedVariant = '';
let savedOverrides = {};
let savedLooks = {};
// What the tiles draw: the preview shows a theme (and variant) as authored, the saved choice also carries the user's color edits.
const applySaved = () => (preview ? applyTheme(preview.name, preview.variant ?? '') : applyTheme(savedTheme, savedVariant, savedOverrides, savedLooks[savedTheme]));
let realCatalog = { themes: [], packs: [], errors: [] };
const pageCatalog = () => (preview && !preview.installed
  ? { ...realCatalog, themes: [...realCatalog.themes, preview.theme], packs: [...realCatalog.packs.filter((p) => p.name !== preview.theme.iconPack), { name: preview.theme.iconPack, roles: preview.roles }] }
  : realCatalog);
function setPreview(spec, note) {
  preview = spec;
  previewList = spec ? previewSessions() : [];
  setCatalog(pageCatalog());
  applySaved();
  if (!spec) { footer.preview.hide(note); render(); return; }
  const apply = async () => {
    if (spec.installed) await postSettings({ theme: spec.name, themeVariant: spec.variant ?? '' });
    else {
      const res = await fetch('/market/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: spec.source, name: spec.name }) });
      if (!res.ok) throw new Error(await res.text());
    }
    setPreview(null, spec.installed ? `Applied ${spec.label}` : `Installed ${spec.label} and applied it`);
  };
  footer.preview.show(spec.label, spec.installed ? 'Apply' : 'Install and apply', spec.installed ? `Applying ${spec.label}…` : `Installing ${spec.label}…`, apply, backToThemes);
  render();
}
function backToThemes() { setPreview(null); footer.views.openFor(footer.themeButton); }
const footer = mountFooter($('bar'), $('stage'), { onPreview: setPreview });

// Pages: the sessions run in order (first seen first, idle ones last) and are cut into pages of `capacity()` cells. Arrows, dots, swipes and the
// left and right keys turn the page; a dot is orange or red when a session on that page needs you or failed.
const prevBtn = $('prev'), nextBtn = $('next'), pager = $('pager'), backBtn = $('back'), jumpBtn = $('jump');      // Back: a session shown full screen returns to the grid
function goto(n) { const p = Math.max(0, Math.min(n, pages.length - 1)); if (p !== page) { page = p; render(); } }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && preview && !e.defaultPrevented) backToThemes();
  else if (e.key === 'Escape' && focus && !e.defaultPrevented) { focus = null; render(); }
});
prevBtn.onclick = () => goto(page - 1);
nextBtn.onclick = () => goto(page + 1);
backBtn.onclick = () => { focus = null; render(); };
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.target.closest?.('input, textarea, select') || footer.views.isOpen()) return;
  goto(page + (e.key === 'ArrowRight' ? 1 : -1));
});
let swipe = null;                                      // finger down: where it started
$('stage').addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; swipe = { x: t.clientX, y: t.clientY }; }, { passive: true });
$('stage').addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) goto(page + (dx < 0 ? 1 : -1));
}, { passive: true });

let pagerSig = '';
/** A session shown full screen hides the others: an orange arrow at the right (red for an error) opens the first one that needs you, +N counts the others. */
function renderFocusAlert(sessions) {
  const alerts = focus ? focusAlerts(sessions, focus) : [];
  jumpBtn.hidden = !alerts.length;
  if (jumpBtn.hidden) { jumpBtn.onclick = null; return; }
  const first = alerts[0];
  const label = `${first.title || first.project || first.id} ${first.dot === 'needs_you' ? 'needs you' : 'has an error'}`;
  jumpBtn.className = `nav ${first.dot}`;
  jumpBtn.title = label;
  jumpBtn.setAttribute('aria-label', label);
  if (alerts.length > 1) jumpBtn.dataset.more = `+${alerts.length - 1}`; else delete jumpBtn.dataset.more;
  jumpBtn.onclick = () => { focus = first.id; render(); };
}

function renderPager() {
  const many = pages.length > 1;
  prevBtn.hidden = nextBtn.hidden = pager.hidden = !many;
  backBtn.hidden = !focus;                             // a full-screen session is a page of one: Back takes the place of the left arrow
  prevBtn.disabled = page <= 0;
  nextBtn.disabled = page >= pages.length - 1;
  const side = many ? sideAlerts(pages, page) : { prev: '', next: '' };      // an arrow toward a page with a session that needs you blinks orange
  prevBtn.className = `nav ${side.prev}`.trim();
  nextBtn.className = `nav ${side.next}`.trim();
  const sig = many ? `${page}|${pages.map(pageAlert).join(',')}` : '';
  if (sig === pagerSig) return;
  pagerSig = sig;
  pager.replaceChildren(...(many ? pages.map((p, i) => {
    const d = el('button', `dot${i === page ? ' on' : ''} ${pageAlert(p)}`);
    d.title = `Page ${i + 1} of ${pages.length}`;
    d.setAttribute('aria-label', d.title);
    d.onclick = () => goto(i);
    return d;
  }) : []));
}

/** A session with sub-agents: its lead tile and its team tile welded side by side in a cell two columns wide, a chip with the sub-agent count on the seam. Kept between renders like the tiles. */
const groups = new Map();                               // session id -> the group element
function groupFor(s, lead, team) {
  let g = groups.get(s.id);
  if (!g) {
    g = el('div', 'group');
    g.link = el('span', 'link');                        // a chip on the seam: the team works for the lead
    groups.set(s.id, g);
  }
  const n = s.agents.length - 1;
  g.link.textContent = `➜ ${n}`;
  g.link.title = `${n} sub-agent${n === 1 ? '' : 's'} of this session`;
  if (g.children[0] !== lead || g.children[1] !== team || g.children[2] !== g.link) g.replaceChildren(lead, team, g.link);
  return g;
}

function render() {
  const sessions = preview ? previewList : state.sessions;
  for (const s of sessions) if (!seen.has(s.id)) seen.set(s.id, seen.size);
  const cap = capacity();
  expandable = cap > 1 && sessions.length > 1;
  if (focus && (!expandable || !sessions.some((s) => s.id === focus))) focus = null;   // session gone, or the grid shrank to one cell
  const focused = focus && sessions.find((s) => s.id === focus);
  pages = focused ? [[focused]] : paginate(orderSessions(sessions, seen, isIdle), { max: cap, cost: cellsOf });
  $('tiles').classList.toggle('expandable', expandable && !focused);
  if (!focused) page = Math.max(0, Math.min(page, pages.length - 1));                  // the grid page is kept while a session is full screen
  current = pages[focused ? 0 : page] ?? [];
  const grid = $('tiles');
  stacked = PHONE && grid.clientHeight > grid.clientWidth;
  grid.toggleAttribute('data-stack', stacked);
  const { cols, rows } = stacked ? { cols: 1, rows: Math.max(1, current.length) }      // the group itself holds the two stacked rows
    : bestLayout(current.map(cellsOf), grid.clientWidth, grid.clientHeight, { maxScale: focus ? FOCUS_SCALE : MAX_SCALE });   // a team is 2 columns wide
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', rows);
  const placed = PHONE ? null : placeItems(current.map(cellsOf), cols).cells;           // a single tile may fill a hole or the rest of its row
  const nodes = current.map((s, i) => {
    const lead = tileFor(s, 'lead'), at = placed?.[i];
    lead.span = hasTeam(s) ? 1 : at?.span ?? 1;                                         // columns the cell gives the tile: fit() lets a wide one stretch
    const node = hasTeam(s) ? groupFor(s, lead.box, tileFor(s, 'team').box) : lead.box;
    node.style.gridColumn = at ? `${at.col + 1} / span ${at.span}` : '';
    node.style.gridRow = at ? String(at.row + 1) : '';
    return node;
  });
  for (const key of [...tiles.keys()]) {
    const team = key.endsWith('#team');
    const s = sessions.find((x) => x.id === (team ? key.slice(0, -5) : key));
    if (!s || (team && !hasTeam(s))) tiles.delete(key);
  }
  for (const id of [...groups.keys()]) { const s = sessions.find((x) => x.id === id); if (!s || !hasTeam(s)) groups.delete(id); }
  for (const id of [...seen.keys()]) if (!sessions.some((s) => s.id === id)) seen.delete(id);
  if (!sessions.length) nodes.push(el('div', 'tile empty', `No sessions yet. Events go to ${location.host}`));
  if (nodes.length !== grid.children.length || nodes.some((n, i) => grid.children[i] !== n)) grid.replaceChildren(...nodes);
  renderPager();
  renderFocusAlert(sessions);
  draw();
  footer.update(state, elapsed());
}

function showState(next) {
  sound = next.settings?.sound ?? 'ask';
  if (next.catalog) realCatalog = next.catalog;
  if (preview && next.settings?.theme !== savedTheme) { preview = null; previewList = []; footer.preview.hide(); }     // another page chose a theme
  savedTheme = next.settings?.theme ?? 'default';
  savedVariant = next.settings?.themeVariant ?? '';
  savedOverrides = next.settings?.themeOverrides ?? {};
  savedLooks = next.settings?.themeLooks ?? {};
  setCatalog(pageCatalog());
  applySaved();
  footer.settings.update(next.settings ?? {}, next.catalog);
  const now = countStates(next.sessions);
  const times = beepsFor(counts, now, sound);
  if (times) beep(times);
  counts = now;
  state = next;
  receivedAt = performance.now();
}

const es = new EventSource('/events');                // the only stream: every tile reads the same state
let webSeen = null;                                   // fingerprint of the page's files on the hub that served this page
es.onmessage = (m) => {
  const raw = JSON.parse(m.data);
  if (raw.web) {                                      // a hub restarted on newer page files: load them instead of drawing with old code
    if (webSeen === null) webSeen = raw.web;
    else if (raw.web !== webSeen) { location.reload(); return; }
  }
  const next = cache.merge(raw); showState(next); render(); flashChanged(next);
};
es.onerror = () => document.body.classList.add('offline');
es.onopen = () => document.body.classList.remove('offline');
setInterval(render, 1000);                            // ages and the clock run on between events
setInterval(draw, FRAME_MS);
onIconsLoaded(draw);                                  // an SVG icon that just loaded replaces the robot at once
new ResizeObserver(draw).observe($('tiles'));
render();
