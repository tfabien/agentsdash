#!/usr/bin/env node
// A guided tour of the page as an animated GIF for the top of the README: the real page, fed live by a demo hub (two sessions, a third one,
// sub-agents, the plan moving, a question, an error, a session that finishes) with a caption bar that says what happens.
//   node plugin/hub/tools/page_gif.mjs [--out docs/images/tour.gif] [--scale 0.6]
// Frames are PNG files in a temp folder, assembled by frames_to_gif.py (Python and Pillow). The page is driven through the DevTools protocol.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './screenshots.mjs';
import { connect, sleep } from './page_screenshots.mjs';
import { startDemoHub, applyScene, CHECKOUT, DOCS, MOBILE } from './demo_seed.mjs';

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
`;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', '..', 'docs', 'images', 'tour.gif')));
  const scale = Number(opt('--scale', 0.6));
  const width = 1280, height = 680 + CAPTION_H;                    // the page keeps the 680 px it fills the grid with, the caption bar comes on top
  const browser = findBrowser();
  if (!browser) throw new Error('no Edge or Chrome found: set SCREENSHOT_BROWSER to its path');
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-'));
  const list = [];
  const demo = await startDemoHub({ themes: (process.env.DEMO_THEMES ?? 'office').split(',').filter(Boolean) });   // a marketplace theme (needs network); DEMO_THEMES= for the built-in one
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
    const still = async (ms) => { await sleep(40); await grab(ms); };                         // a calm moment: one frame, held
    const anim = async (ms, every = 140) => { const end = Date.now() + ms; last = Date.now(); while (Date.now() < end) { await sleep(every); await grab(0); } };   // a change: many frames
    const say = (n, text) => cdp.evaluate(`window.__caption(${n}, ${JSON.stringify(text)})`);
    const send = (ev) => post(demo.hub, '/event', ev);

    await applyScene(demo.hub, 'tour');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
    await sleep(2500);
    await cdp.evaluate(CAPTION);

    await say(1, 'Two Claude Code sessions work in parallel: one tile each');
    await still(3200);
    await say(2, 'A third session starts: its tile joins the grid');
    await send({ ...MOBILE, state: 'working', evt: 'PreToolUse', cmd: 'Edit LoginScreen.tsx', reply_first: '', reply_last: '' });
    await anim(1200); await still(2200);
    await say(3, 'A session spawns sub-agents: its tile grows a team');
    for (const ev of CHECKOUT.slice(1)) { await send(ev); await sleep(300); }
    await anim(1500); await still(2800);
    const plan = (done, cur, next) => ({ ...CHECKOUT[0], plan_done: done, plan_cur: cur, plan_next: next });
    await say(4, 'The plan moves on: the bar shows the current and the next step');
    await send(plan(3, 'Design the retry', 'Write the failing tests'));
    await anim(900);
    await send(plan(4, 'Write the failing tests', 'Implement retry with backoff'));
    await anim(900); await still(2000);
    await say(5, 'A session asks a question: orange tile, and the page beeps');
    await send(DOCS);
    await anim(1300); await still(2600);
    await say(6, 'An error turns a tile red');
    await send({ ...MOBILE, state: 'error', evt: 'PostToolUseFailure', cmd: 'npm test', reply_first: '', reply_last: '' });
    await anim(1200); await still(2200);
    await say(7, 'A session is done: it is your turn');
    await send(MOBILE);
    await anim(1200); await still(2800);

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
