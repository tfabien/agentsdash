#!/usr/bin/env node
// A guided tour of the page as an animated GIF for the top of the README: the real page, driven live through the DevTools protocol while a demo
// hub receives made-up events (a question arrives, a plan moves, sub-agents join, a click opens the detail, pages turn, a theme variant is picked).
//   node plugin/hub/tools/page_gif.mjs [--out docs/images/tour.gif] [--scale 0.6]
// Frames are PNG files in a temp folder, assembled by frames_to_gif.py (Python and Pillow).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './screenshots.mjs';
import { connect, sleep } from './page_screenshots.mjs';
import { startDemoHub, applyScene, CHECKOUT, DOCS, PIPELINE } from './demo_seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const post = (hub, p, body) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const BUTTON = (label) => `document.querySelector('button[aria-label="${label}"], button[title="${label}"]').click()`;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', '..', 'docs', 'images', 'tour.gif')));
  const scale = Number(opt('--scale', 0.6));
  const width = 1280, height = 680;
  const browser = findBrowser();
  if (!browser) throw new Error('no Edge or Chrome found: set SCREENSHOT_BROWSER to its path');
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-'));
  const list = [];
  const demo = await startDemoHub();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pshot-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const cdp = await connect(port);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    let last = Date.now();
    const grab = async (ms) => {                                   // one frame shown for `ms` (or the time since the previous frame when ms is 0)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale } });
      const now = Date.now();
      const file = `${String(list.length + 1).padStart(4, '0')}.png`;
      fs.writeFileSync(path.join(frames, file), Buffer.from(data, 'base64'));
      list.push({ file, ms: ms || Math.max(60, now - last) });
      last = Date.now();
    };
    const PACE = 0.75;                                              // holds are 25 % shorter than written
    const still = async (ms) => { await sleep(40); await grab(Math.round(ms * PACE)); };                         // a calm moment: one frame, held
    const anim = async (ms, every = 140) => { const end = Date.now() + ms; last = Date.now(); while (Date.now() < end) { await sleep(every); await grab(0); } };   // a change: many frames
    const ev = async (e) => { try { return await cdp.evaluate(e); } catch (err) { throw new Error(`${err.message} in: ${e}`); } };   // names the failing step
    const rect = (sel) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element for ' + ${JSON.stringify(sel)} + '; tiles: ' + [...document.querySelectorAll('#tiles .tile')].map((t) => t.dataset.session + '/' + t.dataset.part).join(' ')); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); };
    const clickIn = async (sel, fx, fy) => { const r = await rect(sel); await click(r.x + r.w * fx, r.y + r.h * fy); };
    const clickText = (text) => ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
    const lead = (id) => `#tiles [data-session="${id}"][data-part="lead"] canvas`;
    const team = (id) => `#tiles [data-session="${id}"][data-part="team"] canvas`;

    await applyScene(demo.hub, 'tour');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
    await sleep(2500);

    await still(2400);                                              // 1. the hub: 4 sessions of 4 projects, 3 pages
    await post(demo.hub, '/event', DOCS);                           // 2. a session asks a question: orange, beep
    await anim(1200); await still(2000);
    await post(demo.hub, '/event', PIPELINE);                       //    another one fails: red
    await anim(900); await still(1400);
    const plan = (done, cur, next) => ({ ...CHECKOUT[0], plan_done: done, plan_cur: cur, plan_next: next });
    await post(demo.hub, '/event', plan(3, 'Design the retry', 'Write the failing tests'));   // 3. a plan moves on
    await anim(900);
    await post(demo.hub, '/event', plan(4, 'Write the failing tests', 'Implement retry with backoff'));
    await anim(900); await still(1200);
    for (const ev of CHECKOUT.slice(1)) { await post(demo.hub, '/event', ev); await sleep(250); }   // 4. sub-agents join
    await anim(1400); await still(1600);
    await clickIn(lead('a1b2'), 0.5, 0.5);                          // 5. a tap opens the session full screen
    await anim(600); await still(2000);
    await clickIn(team('a1b2'), 0.45, 0.22);                        // 6. a tap on a sub-agent shows its detail
    await anim(500); await still(2200);
    await clickIn(team('a1b2'), 0.93, 0.1);                         //    BACK from the detail, then BACK to the grid
    await still(900);
    await clickIn(lead('a1b2'), 0.1, 0.9);                         //    the BACK button of the lead tile returns to the grid
    await anim(600); await still(1200);
    for (let i = 0; i < 2; i++) { await ev(`document.getElementById('next').click()`); await anim(500); await still(1600); }   // 7. pages
    await ev(`document.querySelector('#pager button').click()`);
    await anim(500); await still(1000);
    await ev(BUTTON('Theme')); await sleep(1500);        // 8. themes: pick a variant
    await still(1600);
    await clickText('Amber'); await anim(600);
    await clickText('← Back'); await anim(600); await still(2200);
    await ev(BUTTON('Theme')); await sleep(900);         // back to the default look, so the loop starts clean
    await clickText('Default'); await clickText('← Back'); await anim(500); await still(800);

    fs.writeFileSync(path.join(frames, 'frames.json'), JSON.stringify(list));
    cdp.close();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const py = ['python', 'python3'].map((c) => spawnSync(c, [path.join(HERE, 'frames_to_gif.py'), frames, out], { encoding: 'utf8' })).find((r) => r.status === 0);
    if (!py) throw new Error('frames_to_gif.py failed (Python and Pillow needed)');
    console.log(py.stdout.trim());
  } finally {
    child.kill();
    await demo.close();
    await sleep(500);
    for (const d of [profile, frames]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the temp folder cleans it up */ } }
  }
}

main().then(() => process.exit(0), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
