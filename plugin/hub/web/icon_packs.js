// Icon packs: one drawing per role (lead, general, explore, plan, review, test, code, generic), in the 36x42 box of the gadget robots.
// `draw(ctx, role, blink)` paints in that box (the caller translates and scales), so size and blink stay the same for every pack.
// The built-in `robot` pack is the fallback for a missing pack name.
import { hueOf } from './theme_schema.js';

function tools(ctx) {
  return {
    rr: (x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); },
    dot: (cx, cy, r, fill) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); },
    stroke: (color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); },
    poly: (pts, fill) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); },
  };
}

/** The icon of a role on the chest, inside the box (10..26, 31..41). Shared by every pack. */
function chestIcon(ctx, role, color) {
  const { dot, stroke, poly } = tools(ctx);
  if (role === 0) poly([[13.5, 38], [13.5, 33.5], [15.7, 35.7], [18, 33], [20.3, 35.7], [22.5, 33.5], [22.5, 38]], color);
  if (role === 1) { ctx.beginPath(); ctx.arc(18, 36, 2.2, 0, Math.PI * 2); stroke(color, 1.5); }
  if (role === 2) { ctx.beginPath(); ctx.arc(17, 35, 2.4, 0, Math.PI * 2); ctx.moveTo(18.8, 36.8); ctx.lineTo(21.5, 39.2); stroke(color, 1.5); }
  if (role === 3) { ctx.beginPath(); for (const ly of [33.8, 36, 38.2]) { ctx.moveTo(14, ly); ctx.lineTo(22, ly); } stroke(color, 1.4); }
  if (role === 4) { ctx.beginPath(); ctx.ellipse(18, 36, 4.5, 2.6, 0, 0, Math.PI * 2); stroke(color, 1.2); dot(18, 36, 1.2, color); }
  if (role === 5) poly([[18, 33.4], [22, 38.6], [14, 38.6]], color);
  if (role === 6) { ctx.beginPath(); ctx.moveTo(16, 33.8); ctx.lineTo(13.6, 36); ctx.lineTo(16, 38.2); ctx.moveTo(20, 33.8); ctx.lineTo(22.4, 36); ctx.lineTo(20, 38.2); stroke(color, 1.4); }
  if (role === 7) for (const cx of [14.5, 18, 21.5]) dot(cx, 36, 1.1, color);
}

// ---- robot (built in) ----
// Colors per role: main, shade.
const ROBOT = [
  ['#d4a72c', '#94741e'], ['#6e7bf2', '#4d56a9'], ['#2fb5a5', '#207e73'], ['#a371f7', '#724fac'],
  ['#db61a2', '#994371'], ['#b07d4f', '#7b5737'], ['#4c8eda', '#356398'], ['#8b949e', '#61676e'],
];
const VISOR = '#0d1117', EYE = '#e6edf3', CHEST = '#f0f3f6';

function drawRobot(ctx, role, blink) {
  const [main, shade] = ROBOT[role];
  const { rr, dot, stroke, poly } = tools(ctx);
  if (role === 6) { ctx.beginPath(); ctx.arc(18, 20, 15, Math.PI * 1.02, Math.PI * 1.98); stroke('#30363d', 2); }      // headphones band, behind the head
  if (role === 0) poly([[10, 10], [10, 3], [14.5, 7], [18, 1], [21.5, 7], [26, 3], [26, 10]], '#f2cc60');
  if (role === 1 || role === 2) {
    ctx.beginPath(); ctx.moveTo(18, 10); ctx.lineTo(18, 5); stroke(shade, 1.6);
    dot(18, 3.6, role === 2 ? 3.2 : 2.3, role === 2 ? '#fff6c2' : main);
  }
  if (role === 5) rr(8, 3.5, 20, 5.5, 2.5, '#e6edf3');
  rr(4, 9, 28, 21, 8, main);
  rr(8, 14.5, 20, 10, 5, VISOR);
  if (blink) { ctx.beginPath(); ctx.moveTo(12, 19.5); ctx.lineTo(16, 19.5); ctx.moveTo(20, 19.5); ctx.lineTo(24, 19.5); stroke(EYE, 1.4); } else { dot(14, 19.5, 2.2, EYE); dot(22, 19.5, 2.2, EYE); }
  if (role === 3) poly([[7, 10], [18, 5.5], [29, 10], [18, 14]], '#2b2f45');
  if (role === 4) { for (const cx of [14, 22]) { ctx.beginPath(); ctx.arc(cx, 19.5, 3.6, 0, Math.PI * 2); stroke('#f0f3f6', 1.2); } }
  if (role === 6) { rr(1.5, 16, 3.5, 9, 1.5, '#30363d'); rr(31, 16, 3.5, 9, 1.5, '#30363d'); }
  rr(10, 31, 16, 10, 5, shade);
  chestIcon(ctx, role, CHEST);
}

// ---- cat ----
// Coats per role: fur, shade (body and inner ear).
const CAT = [
  ['#e8903a', '#b8672a'], ['#9aa5b1', '#6c7783'], ['#f0e2c8', '#c9b48f'], ['#8a6fd0', '#5f4aa0'],
  ['#e58fb0', '#b3637f'], ['#6b4a35', '#472f21'], ['#3d4452', '#242a35'], ['#c9c2b8', '#948d83'],
];
const CAT_EYE = '#9be15d', CAT_PUPIL = '#16120d', CAT_NOSE = '#f2a3b3';

function drawCat(ctx, role, blink) {
  const [fur, shade] = CAT[role];
  const { rr, dot, stroke, poly } = tools(ctx);
  ctx.beginPath(); ctx.moveTo(26, 38); ctx.quadraticCurveTo(35, 38, 33, 31); stroke(fur, 2.6);                       // tail, behind the body
  poly([[5, 17], [6, 3.5], [15, 10]], fur); poly([[31, 17], [30, 3.5], [21, 10]], fur);                              // ears
  poly([[7.6, 14], [8, 7], [12.6, 10.6]], shade); poly([[28.4, 14], [28, 7], [23.4, 10.6]], shade);
  if (role === 0) poly([[11, 9.5], [11, 3], [14.5, 6.5], [18, 1], [21.5, 6.5], [25, 3], [25, 9.5]], '#f2cc60');       // crown
  if (role === 5) rr(9, 4, 18, 5, 2.4, '#e6edf3');
  if (role === 1 || role === 2) { ctx.beginPath(); ctx.moveTo(18, 9); ctx.lineTo(18, 5); stroke(shade, 1.6); dot(18, 3.6, role === 2 ? 3.2 : 2.3, role === 2 ? '#fff6c2' : '#ffd66b'); }
  rr(10, 30, 16, 11, 5.5, shade);                                                                                        // body
  ctx.beginPath(); ctx.ellipse(18, 19.5, 14, 11.5, 0, 0, Math.PI * 2); ctx.fillStyle = fur; ctx.fill();                // head
  if (role === 3) poly([[7, 11], [18, 6.5], [29, 11], [18, 15]], '#2b2f45');                                         // mortarboard
  for (const [x, s] of [[14, 1], [22, -1]]) {
    if (blink) { ctx.beginPath(); ctx.moveTo(x - 2.4, 18.5); ctx.lineTo(x + 2.4, 18.5); stroke(CAT_PUPIL, 1.4); }
    else { ctx.beginPath(); ctx.ellipse(x, 18.5, 2.9, 3.4, 0, 0, Math.PI * 2); ctx.fillStyle = CAT_EYE; ctx.fill(); rr(x - 0.7, 15.6, 1.4, 5.8, 0.7, CAT_PUPIL); }
    ctx.beginPath(); ctx.moveTo(x + s * 4, 23.5); ctx.lineTo(x + s * 10.5, 22.2); ctx.moveTo(x + s * 4, 25); ctx.lineTo(x + s * 10.5, 26); stroke('#f4efe6', 0.9);   // whiskers
  }
  if (role === 4) { for (const cx of [14, 22]) { ctx.beginPath(); ctx.arc(cx, 18.5, 4.4, 0, Math.PI * 2); stroke('#f0f3f6', 1.1); } }
  if (role === 6) { ctx.beginPath(); ctx.arc(18, 20, 15.5, Math.PI * 1.04, Math.PI * 1.96); stroke('#30363d', 1.8); rr(1.5, 16, 3.2, 8, 1.4, '#30363d'); rr(31.3, 16, 3.2, 8, 1.4, '#30363d'); }
  poly([[16.6, 22.4], [19.4, 22.4], [18, 24]], CAT_NOSE);                                                              // nose
  chestIcon(ctx, role, '#fbf3e6');
}

// ---- lemmings ----
// A lemming of the game, walking to the right: green hair, pale face with a round nose, blue robe, little feet. The role is the skill
// it carries (lead: crown, general: floater umbrella, explore: miner helmet, plan: builder cap, review: glasses, test: bomber, code: digger pick).
const LEM = { hair: '#35c24a', hairShade: '#27983a', skin: '#f6d9bd', robe: '#2f4fd0', robeShade: '#2640a8', eye: '#ffffff', pupil: '#101828' };

function drawLemming(ctx, role, blink) {
  const { rr, dot, stroke, poly } = tools(ctx);
  const oval = (cx, cy, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
  if (role === 6) { ctx.beginPath(); ctx.moveTo(29, 28); ctx.lineTo(33, 39); stroke('#8a5a2b', 1.8); poly([[29.5, 24.5], [35.5, 27], [31, 29.5]], '#b8bec9'); }      // pick, behind the hand
  oval(14.5, 40.2, 3.8, 1.8, LEM.skin); oval(23.5, 40.2, 3.8, 1.8, LEM.skin);                                      // feet
  ctx.beginPath(); ctx.moveTo(12, 22); ctx.lineTo(25, 22); ctx.lineTo(28.5, 39.5); ctx.lineTo(8.5, 39.5); ctx.closePath();   // robe
  ctx.fillStyle = LEM.robe; ctx.fill();
  rr(8.5, 37.4, 20, 2.4, 1.2, LEM.robeShade);
  rr(23, 25, 7.5, 3.4, 1.7, LEM.skin);                                                                              // arm and hand
  if (role === 5) { dot(32, 25, 3.2, '#252a34'); ctx.beginPath(); ctx.moveTo(32, 21.8); ctx.lineTo(33.6, 19.8); stroke('#f2cc60', 1); dot(33.6, 19.8, 1, '#ff7a3d'); }
  dot(16.5, 12.5, 10.6, LEM.hair);                                                                                   // hair, behind the face
  oval(21.5, 16.2, 6.6, 6.8, LEM.skin); dot(28.4, 17.6, 2.3, LEM.skin);                                              // face and nose
  ctx.beginPath(); ctx.ellipse(18, 10.5, 11, 6, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = LEM.hair; ctx.fill();   // fringe
  poly([[8, 12], [6.5, 18], [11.5, 17]], LEM.hairShade);                                                             // back of the hair
  if (role === 0) poly([[10, 6], [10, -0.5], [13.7, 3.2], [17.5, -2], [21.3, 3.2], [25, -0.5], [25, 6]], '#f2cc60');
  if (role === 1) { ctx.beginPath(); ctx.moveTo(17.5, 7); ctx.lineTo(17.5, 1); stroke('#8a8f99', 1.2); ctx.beginPath(); ctx.ellipse(17.5, 3.5, 15, 6.5, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#e5484d'; ctx.fill(); }
  if (role === 2) { rr(8, 3.2, 17, 6, 3, '#e0b83a'); dot(16.5, 5.8, 1.6, '#fff6c2'); }
  if (role === 3) poly([[9, 6.5], [18, 1.2], [27, 6.5], [18, 9.5]], '#2b2f45');
  if (blink) { ctx.beginPath(); ctx.moveTo(20.6, 15); ctx.lineTo(25, 15); stroke(LEM.pupil, 1.3); }
  else { oval(23, 14.8, 2.5, 3, LEM.eye); dot(24, 15.2, 1.3, LEM.pupil); }
  if (role === 4) { ctx.beginPath(); ctx.arc(23, 14.8, 4.2, 0, Math.PI * 2); stroke('#101828', 1.1); }
  ctx.beginPath(); ctx.arc(24.5, 19.5, 2, 0.15 * Math.PI, 0.8 * Math.PI); stroke('#b0705a', 0.9);                   // mouth
  chestIcon(ctx, role, '#f4f7ff');
}

// ---- office ----
// A colleague at the desk, seen from the front: suit per role, a different hair, plus the badge of the role (lead: gold tie, general: headset,
// explore: flat cap, plan: glasses and a bun, review: round glasses, test: pencil behind the ear, code: big headphones, generic: plain).
const OFFICE = [
  ['#2d3a52', '#6b5a4a'], ['#4a5a6e', '#2b2420'], ['#556b4f', '#8a5a2b'], ['#6a4a6e', '#3b2a22'],
  ['#4a4f5a', '#b9a37a'], ['#7a5a3a', '#d9b36a'], ['#2b2f38', '#1d1b1a'], ['#5a6472', '#5a4030'],
];
const SKIN = '#f2cfae';

function drawOffice(ctx, role, blink) {
  const [suit, hair] = OFFICE[role];
  const { rr, dot, stroke, poly } = tools(ctx);
  if (role === 6) { ctx.beginPath(); ctx.arc(18, 19, 14, Math.PI * 1.03, Math.PI * 1.97); stroke('#1f242c', 2); }       // headphone band, behind the head
  rr(8, 29.5, 20, 12, 5, suit);                                                                                         // jacket
  poly([[13.2, 29.5], [18, 33.2], [22.8, 29.5]], '#eef2f7');                                                            // shirt collar
  if (role === 0) poly([[17, 31.2], [19, 31.2], [19.8, 34], [18, 36], [16.2, 34]], '#e0b83a');                           // gold tie
  rr(15.5, 25.5, 5, 5, 2, SKIN);                                                                                        // neck
  dot(18, 17.5, 9.2, SKIN);                                                                                             // head
  if (role === 3) { dot(18, 5.5, 3.6, hair); }
  ctx.beginPath(); ctx.ellipse(18, 13, 9.6, 6.8, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = role === 2 ? SKIN : hair; ctx.fill();   // hair
  if (role === 2) { ctx.beginPath(); ctx.ellipse(18, 11.2, 10.4, 5.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = hair; ctx.fill(); rr(15, 11, 17, 2.6, 1.3, hair); }   // flat cap
  if (role === 6) { rr(6.2, 14.5, 4, 8, 1.8, '#1f242c'); rr(25.8, 14.5, 4, 8, 1.8, '#1f242c'); }
  for (const x of [14.2, 21.8]) {
    if (blink) { ctx.beginPath(); ctx.moveTo(x - 1.8, 18.2); ctx.lineTo(x + 1.8, 18.2); stroke('#2b2420', 1.3); } else dot(x, 18.2, 1.5, '#2b2420');
  }
  if (role === 3) { for (const x of [14.2, 21.8]) { ctx.beginPath(); ctx.roundRect(x - 3.3, 15.2, 6.6, 6, 1.4); stroke('#3b3f4a', 1.1); } ctx.beginPath(); ctx.moveTo(17.5, 17.8); ctx.lineTo(18.5, 17.8); stroke('#3b3f4a', 1.1); }
  if (role === 4) { for (const x of [14.2, 21.8]) { ctx.beginPath(); ctx.arc(x, 18.2, 3.6, 0, Math.PI * 2); stroke('#3b3f4a', 1.2); } ctx.beginPath(); ctx.moveTo(17.8, 18.2); ctx.lineTo(18.2, 18.2); stroke('#3b3f4a', 1.2); }
  if (role === 5) { ctx.beginPath(); ctx.moveTo(26.2, 12.5); ctx.lineTo(29.5, 20); stroke('#e0b83a', 1.5); }
  if (role === 1) { ctx.beginPath(); ctx.arc(18, 17, 11.2, Math.PI * 1.02, Math.PI * 1.98); stroke('#2b2f38', 1.5); rr(5.2, 15, 3.2, 6, 1.4, '#2b2f38'); ctx.beginPath(); ctx.moveTo(6.8, 21); ctx.quadraticCurveTo(7, 25.5, 12.5, 25.5); stroke('#2b2f38', 1.2); dot(12.8, 25.5, 1.4, '#2b2f38'); }
  ctx.beginPath(); ctx.arc(18, 21.6, 2.3, 0.2 * Math.PI, 0.8 * Math.PI); stroke('#a8664f', 0.9);                      // smile
  chestIcon(ctx, role, '#f4f7ff');
}

// ---- pirates ----
// A crew member at the rail, seen from the front: coat per role, a hat or bandana, and what the role carries (lead: captain with a skull on the hat,
// general: red bandana, explore: tricorn and spyglass, plan: bearded navigator, review: eye patch, test: green bandana, code: blue bandana and earring).
const PIRATE = [
  ['#8c1f2b', '#1d1a22'], ['#2d4a7a', '#b3262d'], ['#3b5b3f', '#2a2118'], ['#5a3a6a', '#1a2a4a'],
  ['#5a4a3a', '#2b2b33'], ['#7a4a2a', '#2f7a4a'], ['#243a5a', '#2c5fa8'], ['#4a4f58', '#c9b37a'],
];
const PSKIN = '#e0ae82';

function drawPirate(ctx, role, blink) {
  const [coat, hat] = PIRATE[role];
  const { rr, dot, stroke, poly } = tools(ctx);
  const tricorn = role === 0 || role === 2 || role === 3 || role === 4;
  if (role === 2) { ctx.beginPath(); ctx.moveTo(26, 30); ctx.lineTo(34, 24); stroke('#6b4a2a', 2.6); ctx.beginPath(); ctx.moveTo(32, 25.4); ctx.lineTo(34.6, 23.4); stroke('#e0b83a', 3); }   // spyglass
  rr(8, 29.5, 20, 12, 5, coat);                                                                                         // coat
  poly([[13, 29.5], [18, 33.2], [23, 29.5]], '#efe6d2');                                                                // shirt collar
  rr(15.5, 25.5, 5, 5, 2, PSKIN);                                                                                       // neck
  dot(18, 18, 9.2, PSKIN);                                                                                              // head
  if (role === 0 || role === 3) { ctx.beginPath(); ctx.ellipse(18, 20.5, 8.8, 7.6, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.closePath(); ctx.fillStyle = role === 0 ? '#2a1d16' : '#8a8f99'; ctx.fill(); }   // beard
  if (tricorn) {
    poly([[3, 13.5], [9.5, 4.5], [18, 8], [26.5, 4.5], [33, 13.5], [18, 11.2]], hat);
    rr(4.5, 11, 27, 3.4, 1.7, hat);
    if (role === 0) { dot(18, 8.4, 2.1, '#f4efe6'); dot(17.2, 8.2, 0.55, hat); dot(18.8, 8.2, 0.55, hat); }            // skull
  } else {
    ctx.beginPath(); ctx.ellipse(18, 13.4, 9.6, 6, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = hat; ctx.fill();   // bandana
    rr(8.4, 12.2, 19.2, 2.6, 1.3, hat);
    poly([[26.5, 12.5], [31.5, 10.5], [30.2, 16.2]], hat);                                                              // knot
    if (role === 7) for (const x of [12, 17, 22]) dot(x, 10.6, 0.9, '#f4efe6');
  }
  for (const x of [14.2, 21.8]) {
    if (role === 4 && x === 14.2) continue;                                                                             // under the patch
    if (blink) { ctx.beginPath(); ctx.moveTo(x - 1.8, 18.6); ctx.lineTo(x + 1.8, 18.6); stroke('#2b2420', 1.3); } else dot(x, 18.6, 1.5, '#2b2420');
  }
  if (role === 4) { ctx.beginPath(); ctx.moveTo(9.5, 14); ctx.lineTo(26.5, 16); stroke('#15110e', 1); rr(11.2, 15.4, 6, 5.4, 2.4, '#15110e'); }   // eye patch
  if (role === 6) dot(27.3, 22.6, 1.4, '#e0b83a');                                                                      // earring
  if (role !== 0 && role !== 3) { ctx.beginPath(); ctx.arc(18, 22, 2.3, 0.2 * Math.PI, 0.8 * Math.PI); stroke('#8c4a3a', 0.9); }   // smile
  chestIcon(ctx, role, '#f6e7c1');
}

export const DEFAULT_PACK = 'robot';
export const ICON_PACKS = {
  robot: { label: 'Robot', draw: drawRobot },
  cat: { label: 'Cat', draw: drawCat },
  lemmings: { label: 'Lemmings', draw: drawLemming },
  office: { label: 'Office', draw: drawOffice },
  pirates: { label: 'Pirates', draw: drawPirate },
};
/** The pack of that name among the built-in canvas packs; a missing or unknown name gives the built-in robots. */
export const iconPack = (name) => ICON_PACKS[name] ?? ICON_PACKS[DEFAULT_PACK];

// ---- packs from the hub catalog (SVG files) ----
const ROLE_KEYS = ['lead', 'general', 'explore', 'plan', 'review', 'test', 'code', 'generic'];
const ICON_W = 36, ICON_H = 42;
const images = new Map();                                    // url -> Image, shared by every pack
const loadedListeners = new Set();

/** Calls `cb` each time an icon image finishes loading (the page redraws then). Returns a function that removes `cb`. */
export function onIconsLoaded(cb) { loadedListeners.add(cb); return () => loadedListeners.delete(cb); }

// Plain `new Image()`: the browser renders an SVG there with scripts off, so a third-party file cannot run code.
function imageFor(url) {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => { for (const cb of [...loadedListeners]) cb(); };
    img.src = url;
    images.set(url, img);
  }
  return img;
}
let looks = [];                                              // the active looks of the applied theme: [{ key, sprite, accent }]
/** Sets the looks agents are drawn with (see activeLooks in theme_schema.js). An empty list clears them. */
export function setLooks(list) { looks = Array.isArray(list) ? list : []; }
/** The looks set by `setLooks`. */
export const currentLooks = () => looks;
/** The look of an agent: the same hash as `variantKey`, so one agent keeps its look. `null` without looks, the first look without an agent id. */
export function lookFor(list, agentId) {
  if (!list.length) return null;
  return agentId ? list[hashOf(String(agentId)) % list.length] : list[0];
}
let accent = '';                                             // `#rrggbb` icon tint of the applied theme, '' for none
/** Sets the icon accent (see themes.js). Packs with tint mode `svg` or `hue` draw with it; `none` packs ignore it. */
export function setAccent(hex) { accent = typeof hex === 'string' ? hex : ''; }

// Tint mode `svg`: the file text is fetched once, `currentColor` becomes the accent, and the result is drawn from a blob URL.
const tinted = new Map();                                    // url + accent -> Image | 'loading'
function tintedImage(url, color) {
  const key = `${url}|${color}`;
  const hit = tinted.get(key);
  if (hit === 'loading') return null;
  if (hit) return hit;
  tinted.set(key, 'loading');
  fetch(url).then((r) => r.text()).then((svg) => {
    const img = new Image();
    img.onload = () => { tinted.set(key, img); for (const cb of [...loadedListeners]) cb(); };
    img.src = URL.createObjectURL(new Blob([svg.replace(/currentColor/gi, color)], { type: 'image/svg+xml' }));
  }).catch(() => tinted.delete(key));
  return null;
}

/** Forgets the loaded images so the next draw fetches every SVG again (after the hub rescanned the icon folders). */
export function clearIconCache() { images.clear(); animations.clear(); tinted.clear(); }

// Animated GIF and WebP: a canvas draws only the first frame of an <img>, so the frames are decoded once with ImageDecoder (Chrome and Edge)
// and the one that matches the clock is drawn. Without ImageDecoder the first frame stands in.
const animations = new Map();                                // url -> { frames: [{ bitmap, ms }], total } | 'loading' | 'static'
const ANIMATED = /\.(gif|webp)$/i;
const TYPES = { gif: 'image/gif', webp: 'image/webp' };
let tickTimer = null;

function startAnimation(url) {
  animations.set(url, 'loading');
  const done = (v) => { animations.set(url, v); for (const cb of [...loadedListeners]) cb(); };
  if (typeof ImageDecoder === 'undefined') return done('static');
  (async () => {
    const data = await (await fetch(url)).arrayBuffer();
    const decoder = new ImageDecoder({ data, type: TYPES[url.slice(url.lastIndexOf('.') + 1).toLowerCase()] });
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack.frameCount;
    const frames = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const ms = Math.max(20, (image.duration ?? 100000) / 1000);
      frames.push({ bitmap: await createImageBitmap(image), ms });
      total += ms;
      image.close();
    }
    done(frames.length > 1 ? { frames, total } : 'static');
  })().catch(() => done('static'));
}

/** The frame of an animated icon for the clock, `null` while it decodes or when only the static image can be shown. */
function animatedFrame(url) {
  let a = animations.get(url);
  if (a === undefined) { startAnimation(url); a = 'loading'; }
  if (typeof a !== 'object') return a === 'loading' ? 'loading' : null;
  let t = performance.now() % a.total;
  for (const f of a.frames) { if (t < f.ms) return f.bitmap; t -= f.ms; }
  return a.frames[0].bitmap;
}

/** While an animated icon is drawn, asks the page for another redraw in 80 ms (the redraw draws it again, which keeps the loop going). */
function tick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => { tickTimer = null; for (const cb of [...loadedListeners]) cb(); }, 80);
}

const ready = (img) => !!img && img.complete !== false && (img.naturalWidth === undefined || img.naturalWidth > 0);

/** Same characters for the same agent: a small string hash. */
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** The file key of a role for an agent: `lead`, `lead-2`... picked by the agent id among the variants the pack has (the first one without an id). */
export function variantKey(roles, key, agentId, sprite) {
  if (sprite) {                                              // a look names the sprite: 1 is the unnumbered file, n is `<key>-n` (the unnumbered file when the role has no such number)
    const named = sprite === 1 ? key : `${key}-${sprite}`;
    if (roles[named]) return named;
    if (roles[key]) return key;
  }
  const keys = Object.keys(roles).filter((k) => k === key || (k.startsWith(`${key}-`) && /^\d+$/.test(k.slice(key.length + 1))));
  keys.sort((a, b) => (Number(a.slice(key.length + 1)) || 1) - (Number(b.slice(key.length + 1)) || 1));
  if (!keys.length) return key;
  return keys.length > 1 && agentId ? keys[hashOf(String(agentId)) % keys.length] : keys[0];
}

/** A pack drawn from SVG (or png, gif...) files: `roles` maps 'lead'..'generic' (and '<role>-blink') to URLs. A role without a file, or whose image is not loaded yet, draws the robot. */
export function svgPack(name, roles, { tint = 'none', hue = 0 } = {}) {
  return {
    label: name.charAt(0).toUpperCase() + name.slice(1),
    draw(ctx, role, blink, agentId) {
      const look = lookFor(looks, agentId);
      const key = variantKey(roles, ROLE_KEYS[role], agentId, look?.sprite);
      const tone = look?.accent || accent;                          // the look's accent, else the theme's
      const plain = roles[key];
      const blinkUrl = roles[`${key}-blink`];
      const url = (blink && blinkUrl) || plain;
      if (!url) { drawRobot(ctx, role, blink); return; }            // the pack has no file for this role
      if (!blink && blinkUrl && !ANIMATED.test(blinkUrl)) imageFor(blinkUrl);   // load the blink frame early: no gap when the eyes close
      // The blink frame or the animation not ready yet: show the plain icon, never another character (no flash of the robot).
      const shift = tint === 'hue' && tone ? (hueOf(tone) - hue + 360) % 360 : 0;
      const paint = (image) => {                                      // hue mode: the whole picture, every animation frame included, goes through a hue rotation
        if (shift) { ctx.save(); ctx.filter = `hue-rotate(${shift}deg)`; ctx.drawImage(image, 0, 0, ICON_W, ICON_H); ctx.restore(); } else ctx.drawImage(image, 0, 0, ICON_W, ICON_H);
      };
      for (const u of url === plain ? [url] : [url, plain]) {
        if (ANIMATED.test(u)) {
          const frame = animatedFrame(u);
          if (frame && frame !== 'loading') { paint(frame); tick(); return; }
        }
        if (tint === 'svg' && tone && /\.svg$/i.test(u)) {              // not tinted yet: draw nothing (the untinted file would be black), the page redraws when it loads
          const colored = tintedImage(u, tone);
          if (ready(colored)) { paint(colored); return; }
          continue;
        }
        const img = imageFor(u);
        if (ready(img)) { paint(img); return; }
      }
      // Nothing is loaded yet: draw nothing, the page redraws when the image arrives.
    },
  };
}

let catalogPacks = null;                                     // null until a catalog arrived: the built-in canvas packs stand in
const svgPacks = new Map();

/** Stores the packs of the hub catalog ([{ name, roles }]). */
export function setCatalogPacks(packs) {
  catalogPacks = new Map();
  for (const p of packs ?? []) if (p && typeof p.name === 'string' && p.roles && typeof p.roles === 'object') catalogPacks.set(p.name, p);
  svgPacks.clear();
}

/** The pack of that name: the catalog pack when listed, else the robots. Without any catalog (hub unreachable), the built-in canvas packs. */
export function iconPackFor(name) {
  if (!catalogPacks) return iconPack(name);
  const p = catalogPacks.get(name);
  if (!p) return ICON_PACKS[DEFAULT_PACK];
  let pack = svgPacks.get(name);
  if (!pack) { pack = svgPack(name, p.roles, { tint: p.tint, hue: p.hue }); svgPacks.set(name, pack); }
  return pack;
}
