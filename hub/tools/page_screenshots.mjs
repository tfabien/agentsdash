#!/usr/bin/env node
// Real screenshots of the hub page for the README: starts a demo hub (demo_seed.mjs), drives a headless Edge or Chrome through the DevTools protocol
// (click the real buttons, wait, capture) and saves docs/images/page-<shot>.png.
//   node hub/tools/page_screenshots.mjs [--out docs/images] [--width 1280] [--height 800] [shot ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './screenshots.mjs';
import { startDemoHub, applyScene } from './demo_seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A minimal DevTools protocol client over the browser's WebSocket. */
export async function connect(port) {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('the browser did not open a page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.error ? reject(new Error(d.error.message)) : resolve(d.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

// What to show, in order. A step is a page expression (`js`), a real mouse click (`click: [x, y]`), a click on the button with that text
// (`text`), or a pause (`wait`, ms). The page is reloaded before each shot.
const BUTTON = (label) => `document.querySelector('button[aria-label="${label}"], button[title="${label}"]').click()`;
// `clip: 'tiles'` crops to the tiles (the page is dark around a single session); an object is a fixed rectangle.
const ONE = 'tiles';
export const SHOTS = {
  hub: { scene: 'hub' },                                                      // 2x2 tiles, one per project
  quotas: { scene: 'hub', clip: { x: 0, y: 612, width: 1280, height: 68 } },   // the bar at the bottom
  grid: { scene: 'grid' },                                                    // 4 tiles of mixed sizes, a second page
  plan: { scene: 'plan', clip: ONE },                                         // plan bar, context ring
  question: { scene: 'question', clip: 'tiles' },
  subs3: { scene: 'subs3', clip: ONE },
  compact: { scene: 'subs7', clip: ONE },                                     // 5 or more sub-agents: compact rows
  detail: { scene: 'detail', clip: ONE, steps: [{ click: [850, 308] }, { wait: 600 }] },   // a tap on a sub-agent row
  empty: { scene: 'empty' },
  themes: { scene: 'grid', steps: [{ js: BUTTON('Theme') }, { wait: 1500 }] },
  editor: { scene: 'grid', steps: [{ js: BUTTON('Theme') }, { wait: 1500 }, { text: 'Edit colors' }, { wait: 1000 }] },
  settings: { scene: 'grid', steps: [{ js: BUTTON('Settings') }, { wait: 600 }] },
};
// What the README uses (the default run), in the order of its sections.
const DEFAULT_SHOTS = ['hub', 'plan', 'question', 'subs3', 'compact', 'detail', 'quotas'];

/** The rectangle around every tile canvas of the grid, 12 px of margin (so a frame is not cut). */
async function tilesRect(cdp) {
  const r = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('#tiles canvas')].map((t) => t.getBoundingClientRect()); const x0 = Math.min(...b.map((r) => r.left)), y0 = Math.min(...b.map((r) => r.top)), x1 = Math.max(...b.map((r) => r.right)), y1 = Math.max(...b.map((r) => r.bottom)); return { x: Math.max(0, x0 - 12), y: Math.max(0, y0 - 12), width: x1 - x0 + 24, height: y1 - y0 + 24 }; })()`);
  return r;
}

async function runStep(cdp, step) {
  if (step.js) await cdp.evaluate(step.js);
  if (step.text) await cdp.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(step.text)}).click()`);
  if (step.click) {
    const [x, y] = step.click;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  }
  await sleep(step.wait ?? 150);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', 'docs', 'images')));
  const width = Number(opt('--width', 1280)), height = Number(opt('--height', 680));
  const names = args.length ? args : DEFAULT_SHOTS;
  const browser = findBrowser();
  if (!browser) throw new Error('no Edge or Chrome found: set SCREENSHOT_BROWSER to its path');
  fs.mkdirSync(out, { recursive: true });
  const demo = await startDemoHub({ themes: (process.env.DEMO_THEMES ?? 'office').split(',').filter(Boolean) });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pshot-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const cdp = await connect(port);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const name of names) {
      const shot = SHOTS[name];
      if (!shot) throw new Error(`unknown shot ${name}: ${Object.keys(SHOTS).join(', ')}`);
      await applyScene(demo.hub, shot.scene);
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
      await sleep(2500);                                          // the page connects, loads the theme images and draws
      for (const step of shot.steps ?? []) await runStep(cdp, step);
      const clip = shot.clip === 'tiles' ? await tilesRect(cdp) : shot.clip;
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      const file = path.join(out, `page-${name}.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log('wrote', file);
    }
    cdp.close();
  } finally {
    child.kill();
    await demo.close();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the temp folder cleans it up */ }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().then(() => process.exit(0), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
