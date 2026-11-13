#!/usr/bin/env node
// Real screenshots of the hub page for the README: starts a demo hub (demo_seed.mjs), drives a headless Edge or Chrome through the DevTools protocol
// (click the real buttons, wait, capture) and saves docs/images/page-<shot>.png.
//   node plugin/hub/tools/page_screenshots.mjs [--out docs/images] [--width 1280] [--height 800] [shot ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './screenshots.mjs';
import { startDemoHub } from './demo_seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A minimal DevTools protocol client over the browser's WebSocket. */
async function connect(port) {
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
export const SHOTS = {
  grid: [],
  fullscreen: [{ click: [330, 280] }, { wait: 700 }],
  themes: [{ js: BUTTON('Theme') }, { wait: 1500 }],
  editor: [{ js: BUTTON('Theme') }, { wait: 1500 }, { text: 'Edit colors' }, { wait: 1000 }],
  settings: [{ js: BUTTON('Settings') }, { wait: 600 }],
};

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
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', '..', 'docs', 'images')));
  const width = Number(opt('--width', 1280)), height = Number(opt('--height', 800));
  const names = args.length ? args : Object.keys(SHOTS);
  const browser = findBrowser();
  if (!browser) throw new Error('no Edge or Chrome found: set SCREENSHOT_BROWSER to its path');
  fs.mkdirSync(out, { recursive: true });
  const demo = await startDemoHub({ themes: (process.env.DEMO_THEMES ?? 'robot').split(',') });
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
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
      await sleep(2500);                                          // the page connects, loads the theme images and draws
      for (const step of shot) await runStep(cdp, step);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
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
