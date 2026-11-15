#!/usr/bin/env node
// A guided tour of the page as an animated GIF for the top of the README: the real page, fed live by a demo hub (two sessions, a third one,
// sub-agents, the plan moving, a question answered from the page, an Allow tapped on the page, an error, a session that finishes, then the
// same page on a phone beside the PC) with a caption bar that says what happens.
//   node hub/tools/page_gif.mjs [--out docs/images/tour.gif] [--scale 0.6]
// Frames are PNG files in a temp folder, assembled by frames_to_gif.py (Python and Pillow). The page is driven through the DevTools protocol.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, sleep } from './browser.mjs';
import { startDemoHub, applyScene, hold, CHECKOUT, DOCS, DOCS_QUESTION, DOCS_BUILD, DOCS_PERMISSION, MOBILE } from './demo_seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const post = (hub, p, body) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const CAPTION_H = 48;
const CAPTION = `
  const bar = document.createElement('div');
  bar.id = 'tour-caption';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:${CAPTION_H}px;display:flex;align-items:center;justify-content:center;gap:14px;background:#0d1626;border-bottom:1px solid #2a3b55;color:#e6edf3;font:600 21px system-ui,Segoe UI,sans-serif;z-index:9999';
  document.body.append(bar);
  document.body.style.paddingTop = '${CAPTION_H}px';
  document.body.style.boxSizing = 'border-box';
  window.__caption = (n, text) => { bar.innerHTML = '<span style="background:#2f6fed;border-radius:50%;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:17px">' + n + '</span><span>' + text + '</span>'; };
  window.__tap = (x, y) => {               // a screenshot has no mouse pointer: a ring shows where the click lands
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:' + (x - 30) + 'px;top:' + (y - 30) + 'px;width:60px;height:60px;box-sizing:border-box;border-radius:50%;border:6px solid #ffd43b;background:rgba(255,212,59,.3);box-shadow:0 0 0 3px rgba(0,0,0,.5);pointer-events:none;z-index:9998;transition:transform .25s,opacity .25s';
    document.body.append(d);
    setTimeout(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0'; }, 650);   // the click lands at 600 ms: the ring is gone before the tile changes
    setTimeout(() => d.remove(), 900);
  };
`;

// Where to click a button of the question or permission held for the page: the hit test of the page itself (screen.js), run over the largest
// tile (the session the request opened full screen), gives the frame units of the button; they become window pixels the way tap() maps them back.
const FIND_BUTTON = (kind, index = 0) => `(async () => {
  const { hitTest } = await import('/screen.js');
  const { tileSize, FRAME } = await import('/layout.js');
  const st = await (await fetch('/state')).json();
  const s = st.sessions.find((x) => x.quest || x.perm);
  const c = [...document.querySelectorAll('#tiles canvas')].filter((e) => e.offsetParent).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!s || !c) return null;
  const r = c.getBoundingClientRect();
  for (const focus of [true, false]) {
    const { fw, fh } = tileSize(c.parentElement.clientWidth, c.parentElement.clientHeight, { focus });
    if (Math.abs(r.width / r.height - fw / fh) > 0.02) continue;          // not the size this canvas was drawn at
    const frameH = Math.max(FRAME.h, fh), xs = [], ys = [];
    for (let x = FRAME.x; x < FRAME.x + fw; x += 2) for (let y = FRAME.y; y < FRAME.y + frameH; y += 2) {
      const h = hitTest(x, y, { sessions: [s], selected: 0, menu: false, part: 'lead', frameW: fw, frameH, quest: null });
      if (h.kind === ${JSON.stringify(kind)} && (h.index ?? 0) === ${index}) { xs.push(x); ys.push(y); }
    }
    if (!xs.length) return null;
    const ux = (Math.min(...xs) + Math.max(...xs)) / 2, uy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return { x: r.left + ((ux - FRAME.x) * r.width) / fw, y: r.top + ((uy - FRAME.y) * r.height) / frameH };
  }
  return null;
})()`;

// The last scene: the PC page and the phone page side by side, both live. Written over a hub URL so the frames share the hub's origin.
const SIDE_BY_SIDE = `
  try { localStorage.setItem('agentsdash-phone-onboarded', '1'); } catch {}     // the phone page skips its first-visit card
  document.documentElement.innerHTML = '<head><style>'
    + 'html,body{margin:0;height:100%;background:#05070b}'
    + '#duo{display:flex;align-items:center;justify-content:center;gap:34px;height:100%}'
    + '.pc{display:flex;flex-direction:column;align-items:center}'
    + '.pc iframe{width:860px;height:560px;border:10px solid #1d2430;border-radius:12px;background:#000}'
    + '.pc .foot{width:180px;height:38px;background:linear-gradient(#1d2430,#11161e);clip-path:polygon(25% 0,75% 0,100% 100%,0 100%)}'
    + '.phone iframe{width:282px;height:588px;border:12px solid #1d2430;border-radius:36px;background:#000;display:block}'
    + '.lbl{color:#8b98a9;font:600 15px system-ui,Segoe UI,sans-serif;text-align:center;margin-top:8px}'
    + '</style></head><body><div id="duo">'
    + '<div class="pc"><iframe src="/"></iframe><div class="foot"></div><div class="lbl">PC or second monitor</div></div>'
    + '<div class="phone"><iframe src="/phone"></iframe><div class="lbl">Phone or tablet (Wi-Fi)</div></div>'
    + '</div></body>';
`;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', 'docs', 'images', 'tour.gif')));
  const scale = Number(opt('--scale', 0.6));
  const width = 1280, height = 680 + CAPTION_H;                    // the page keeps the 680 px it fills the grid with, the caption bar comes on top
  const { cdp, close } = await openPage({ width, height });
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-'));
  const list = [];
  let demo;
  try {
    demo = await startDemoHub({ themes: (process.env.DEMO_THEMES ?? 'office').split(',').filter(Boolean) });   // a marketplace theme (needs network); DEMO_THEMES= for the built-in one
    let last = Date.now();
    const grab = async (ms) => {                                   // one frame shown for `ms` (or the time since the previous frame when ms is 0)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale } });
      const now = Date.now();
      const file = `${String(list.length + 1).padStart(4, '0')}.png`;
      fs.writeFileSync(path.join(frames, file), Buffer.from(data, 'base64'));
      list.push({ file, ms: ms || Math.max(60, now - last) });
      last = Date.now();
    };
    const still = async (ms) => { await sleep(40); await grab(ms); };                         // a calm moment: one frame, held
    const anim = async (ms, every = 140) => { const end = Date.now() + ms; last = Date.now(); while (Date.now() < end) { await sleep(every); await grab(0); } };   // a change: many frames
    const say = (n, text) => cdp.evaluate(`window.__caption(${n}, ${JSON.stringify(text)})`);
    const send = (ev) => post(demo.hub, '/event', ev);
    const click = async (kind, index) => {                         // a real mouse click on a button of the held request, with the ring drawn
      const at = await cdp.evaluate(FIND_BUTTON(kind, index));
      if (!at) throw new Error(`no ${kind} button on the page`);
      await cdp.evaluate(`window.__tap(${at.x}, ${at.y})`);
      await anim(600, 110);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    };
    const answered = async (pending, what) => {                    // the hook's side: the held request must come back with the page's answer
      const r = await Promise.race([pending, sleep(4000).then(() => null)]);
      if (!r || !what(r)) throw new Error(`the page did not answer: ${JSON.stringify(r)}`);
    };

    await applyScene(demo.hub, 'tour');
    await post(demo.hub, '/settings', { focus_on_ask: true });    // a question or an Allow/Deny opens its session full screen
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
    await sleep(2500);
    await cdp.evaluate(CAPTION);

    await say(1, 'Two Claude Code sessions work in parallel: one tile each');
    await still(2800);
    await say(2, 'A third session starts: its tile joins the grid');
    await send({ ...MOBILE, state: 'working', evt: 'PreToolUse', cmd: 'Edit LoginScreen.tsx', reply_first: '', reply_last: '' });
    await anim(1200); await still(1800);
    await say(3, 'A session spawns sub-agents: its tile grows a team');
    for (const ev of CHECKOUT.slice(1)) { await send(ev); await sleep(300); }
    await anim(1500); await still(2400);
    const plan = (done, cur, next) => ({ ...CHECKOUT[0], plan_done: done, plan_cur: cur, plan_next: next });
    await say(4, 'The plan moves on: the bar shows the current and the next step');
    await send(plan(3, 'Design the retry', 'Write the failing tests'));
    await anim(900);
    await send(plan(4, 'Write the failing tests', 'Implement retry with backoff'));
    await anim(900); await still(1600);

    await say(5, 'A session asks a question: the page beeps and opens it full screen');
    await send(DOCS);
    const { answer: question } = await hold(demo.hub, '/question', DOCS_QUESTION);
    await anim(1300); await still(2200);
    await say(6, 'Answer it right on the page: one click, the agent goes on');
    await still(900);
    await click('questOpt', 0);
    await answered(question, (r) => Array.isArray(r.picks) && r.picks[0]?.[0] === 0);
    await send({ ...DOCS, state: 'working', evt: 'PostToolUse', cmd: 'Edit docs/api/v2.md', question: '', options: '' });
    await anim(1500); await still(1400);

    await say(7, 'A permission prompt: Allow or Deny from the page too');
    await send(DOCS_BUILD);
    const { answer: permission } = await hold(demo.hub, '/permission', DOCS_PERMISSION);
    await anim(1300); await still(1600);
    await click('permAllow');
    await answered(permission, (r) => r.decision === 'allow');
    await send({ ...DOCS_BUILD, state: 'working', evt: 'PreToolUse', cmd: 'npm run build', detail: '' });
    await anim(1500); await still(1200);

    await say(8, 'An error turns a tile red');
    await send({ ...MOBILE, state: 'error', evt: 'PostToolUseFailure', cmd: 'npm test', reply_first: '', reply_last: '' });
    await anim(1200); await still(1800);
    await say(9, 'A session is done: it is your turn');
    await send(MOBILE);
    await anim(1200); await still(2200);

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/health` });
    await sleep(600);
    await cdp.evaluate(SIDE_BY_SIDE);
    await cdp.evaluate(CAPTION);
    await say(10, 'Same live view on a second monitor, a phone or a tablet');
    await sleep(3000);                                             // both pages connect, load the theme and draw
    await still(2400);
    await send({ ...CHECKOUT[0], state: 'needs_you', evt: 'PermissionRequest', cmd: 'Question', question: 'Open the PR now?', options: 'Yes|Not yet' });
    await anim(1600); await still(3200);

    fs.writeFileSync(path.join(frames, 'frames.json'), JSON.stringify(list));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // One run: the first interpreter that succeeds writes the GIF, the next one is tried only after a failure.
    const script = path.join(HERE, 'frames_to_gif.py');
    let py, failed;
    for (const c of ['python', 'python3']) {
      const r = spawnSync(c, [script, frames, out], { encoding: 'utf8' });
      if (r.status === 0) { py = r; break; }
      failed = r;
    }
    if (!py) throw new Error(`frames_to_gif.py failed (Python and Pillow needed)${failed?.stderr ? `: ${failed.stderr.trim()}` : failed?.error ? `: ${failed.error.message}` : ''}`);
    console.log(py.stdout.trim());
  } finally {
    await close();
    await demo?.close();
    try { fs.rmSync(frames, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the temp folder cleans it up */ }
  }
}

main().then(() => process.exit(0), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
