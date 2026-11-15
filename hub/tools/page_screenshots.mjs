#!/usr/bin/env node
// Real screenshots of the hub page for the README: starts a demo hub (demo_seed.mjs), drives a headless Edge or Chrome through the DevTools protocol
// (click the real buttons, wait, capture) and saves docs/images/page-<shot>.png.
//   node hub/tools/page_screenshots.mjs [--out docs/images] [--width 1280] [--height 800] [shot ...]
//   node hub/tools/page_screenshots.mjs --themes robot,cat-minimal,fantasy-rpg,office-retro   (theme-<name>.png: one session full screen with its team)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, sleep } from './browser.mjs';
import { startDemoHub, applyScene } from './demo_seed.mjs';
import { isMain } from '../run_as_main.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// What to show, in order. A step is a page expression (`js`), a real mouse click (`click: [x, y]`), a click on the button with that text
// (`text`), or a pause (`wait`, ms). The page is reloaded before each shot.
const BUTTON = (label) => `document.querySelector('button[aria-label="${label}"], button[title="${label}"]').click()`;
// `clip: 'tiles'` crops to the tiles (the page is dark around a single session); another string is a CSS selector,
// cropped to that element's box (so it follows --width and --height); an object is a fixed rectangle.
const ONE = 'tiles';
export const SHOTS = {
  hub: { scene: 'hub' },                                                      // 2x2 tiles, one per project
  quotas: { scene: 'hub', clip: '#bar' },                                     // the bar at the bottom
  grid: { scene: 'grid' },                                                    // 4 tiles of mixed sizes, a second page
  plan: { scene: 'plan', clip: ONE },                                         // plan bar, context ring
  question: { scene: 'question', clip: 'tiles' },                           // the question with its answer buttons
  permission: { scene: 'permission', clip: 'tiles' },                       // Allow and Deny
  subs3: { scene: 'subs3', clip: ONE },
  compact: { scene: 'subs7', clip: ONE },                                     // 5 or more sub-agents: compact rows
  detail: { scene: 'plan', clip: ONE, steps: [{ click: [850, 308] }, { wait: 600 }] },   // a tap on a sub-agent row
  empty: { scene: 'empty' },
  themes: { scene: 'grid', steps: [{ js: BUTTON('Theme') }, { wait: 1500 }] },
  editor: { scene: 'grid', steps: [{ js: BUTTON('Theme') }, { wait: 1500 }, { text: 'Edit colors' }, { wait: 1000 }] },
  settings: { scene: 'grid', steps: [{ js: BUTTON('Settings') }, { wait: 600 }] },
};
// What the README uses (the default run), in the order of its sections.
const DEFAULT_SHOTS = ['hub', 'plan', 'question', 'permission', 'subs3', 'compact', 'detail', 'quotas'];
// The theme gallery of the README: each marketplace theme on the same session, full screen with its plan and 4 sub-agents.
const THEME_SHOT = { scene: 'plan', clip: ONE };

/** The rectangle around every element matching `selector`, 12 px of margin (so a frame is not cut), kept inside the window. */
async function selectorRect(cdp, selector) {
  const r = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].map((t) => t.getBoundingClientRect()); if (!b.length) return null; const x0 = Math.max(0, Math.min(...b.map((r) => r.left)) - 12), y0 = Math.max(0, Math.min(...b.map((r) => r.top)) - 12), x1 = Math.min(innerWidth, Math.max(...b.map((r) => r.right)) + 12), y1 = Math.min(innerHeight, Math.max(...b.map((r) => r.bottom)) + 12); return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; })()`);
  if (!r) throw new Error(`nothing matches ${selector} on the page`);
  return r;
}
const clipRect = (cdp, clip) => (clip === 'tiles' ? selectorRect(cdp, '#tiles canvas') : selectorRect(cdp, clip));

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
  const themes = opt('--themes', '').split(',').filter(Boolean);
  const names = args.length ? args : DEFAULT_SHOTS;
  fs.mkdirSync(out, { recursive: true });
  const { cdp, close } = await openPage({ width, height });
  let demo;
  try {
    demo = await startDemoHub({ themes: themes.length ? themes : (process.env.DEMO_THEMES ?? 'office').split(',').filter(Boolean) });
    const jobs = themes.length
      ? themes.map((theme) => ({ shot: THEME_SHOT, theme, file: `theme-${theme}.png` }))
      : names.map((name) => ({ shot: SHOTS[name], name, file: `page-${name}.png` }));
    for (const { shot, name, theme, file: base } of jobs) {
      if (!shot) throw new Error(`unknown shot ${name}: ${Object.keys(SHOTS).join(', ')}`);
      if (theme) {
        const r = await fetch(`http://127.0.0.1:${demo.hub.port}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }) });
        if (!r.ok) throw new Error(`apply theme ${theme}: ${r.status} ${await r.text()}`);
      }
      await applyScene(demo.hub, shot.scene);
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${demo.hub.port}/` });
      await sleep(2500);                                          // the page connects, loads the theme images and draws
      for (const step of shot.steps ?? []) await runStep(cdp, step);
      const clip = typeof shot.clip === 'string' ? await clipRect(cdp, shot.clip) : shot.clip;
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      const file = path.join(out, base);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log('wrote', file);
    }
  } finally {
    await close();
    await demo?.close();
  }
}

if (isMain(import.meta.url)) {
  main().then(() => process.exit(0), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
