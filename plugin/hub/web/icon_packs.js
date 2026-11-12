// Icon packs: one drawing per role (lead, general, explore, plan, review, test, code, generic), in the 36x42 box of the gadget robots.
// `draw(ctx, role, blink)` paints in that box (the caller translates and scales), so size and blink stay the same for every pack.
// The built-in `robot` pack is the fallback for a missing pack name.

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
// Per role: the tool or hat of a lemming skill (lead: blocker arms, general: floater umbrella, explore: miner lamp, plan: builder brick,
// review: climber, test: bomber, code: digger pick, generic: plain walker). Robe color per role.
const LEM_ROBE = ['#3a56c8', '#3a56c8', '#3a56c8', '#3a56c8', '#3a56c8', '#3a56c8', '#3a56c8', '#4a63d6'];
const LEM_HAIR = '#3fc94f', LEM_SKIN = '#f3d3b0', LEM_EYE = '#ffffff', LEM_PUPIL = '#101828';

function drawLemming(ctx, role, blink) {
  const robe = LEM_ROBE[role];
  const { rr, dot, stroke, poly } = tools(ctx);
  if (role === 0) { rr(2, 31.5, 8, 3.2, 1.6, LEM_SKIN); rr(26, 31.5, 8, 3.2, 1.6, LEM_SKIN); }                          // blocker: arms out
  if (role === 1) { ctx.beginPath(); ctx.moveTo(18, 12); ctx.lineTo(18, 4); stroke('#8a8f99', 1.2); ctx.beginPath(); ctx.ellipse(18, 6.5, 15, 6.5, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#e5484d'; ctx.fill(); }   // umbrella
  if (role === 6) { ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(33, 31); stroke('#8a5a2b', 1.8); poly([[30, 29.5], [35.5, 31], [32.5, 34]], '#b8bec9'); }   // pick
  if (role === 4) { ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(32, 30); stroke('#c98b4a', 1.6); }                    // rope
  rr(9, 30, 18, 11, 5.5, robe);                                                                                           // robe
  dot(18, 19.5, 10.4, LEM_SKIN);                                                                                          // head
  ctx.beginPath(); ctx.arc(18, 17, 11.6, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fillStyle = LEM_HAIR; ctx.fill();   // hair
  poly([[10, 12], [13, 6], [16, 11]], LEM_HAIR); poly([[20, 11], [23, 6], [26, 12]], LEM_HAIR);
  if (role === 2) { rr(9.5, 5.5, 17, 6, 3, '#e0b83a'); dot(18, 8.5, 1.6, '#fff6c2'); }                                   // miner helmet and lamp
  if (role === 3) poly([[11, 8.5], [17, 3.5], [25, 8.5], [18, 11]], '#2b2f45');
  if (role === 5) { dot(28.5, 6.5, 3.4, '#252a34'); ctx.beginPath(); ctx.moveTo(28.5, 3.2); ctx.lineTo(30, 1.2); stroke('#f2cc60', 1); dot(30, 1.2, 1, '#ff7a3d'); }   // bomb and fuse
  if (role === 7) poly([[15, 5], [18, 1.5], [21, 5]], LEM_HAIR);
  for (const x of [14.2, 21.8]) {
    if (blink) { ctx.beginPath(); ctx.moveTo(x - 2.2, 20); ctx.lineTo(x + 2.2, 20); stroke(LEM_PUPIL, 1.3); }
    else { dot(x, 20, 3.1, LEM_EYE); dot(x + 0.5, 20.4, 1.5, LEM_PUPIL); }
  }
  if (role === 4) { for (const cx of [14.2, 21.8]) { ctx.beginPath(); ctx.arc(cx, 20, 3.9, 0, Math.PI * 2); stroke('#101828', 1); } }
  ctx.beginPath(); ctx.arc(18, 24.6, 2, 0.15 * Math.PI, 0.85 * Math.PI); stroke('#b0705a', 0.9);                        // mouth
  chestIcon(ctx, role, '#f4f7ff');
}

export const DEFAULT_PACK = 'robot';
export const ICON_PACKS = {
  robot: { label: 'Robot', draw: drawRobot },
  cat: { label: 'Cat', draw: drawCat },
  lemmings: { label: 'Lemmings', draw: drawLemming },
};
/** The pack of that name; a missing or unknown name gives the built-in robots. */
export const iconPack = (name) => ICON_PACKS[name] ?? ICON_PACKS[DEFAULT_PACK];
