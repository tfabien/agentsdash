#!/usr/bin/env node
// `node pair.mjs`: turns phone access on (config `lan.enabled`), restarts the hub when it was off, prints the pairing address and its QR code.
// An agent runs it for the user at the end of an install; the user can run it any time. Needs Wi-Fi: the phone and this computer share a network.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, defaultConfigPath } from './config.mjs';
import { buildQr } from './web/qr.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sets `lan.enabled` in the config file, keeping every other key. @returns {boolean} true when the file changed. */
export function enableLan(file) {
  let data = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch { /* a missing or broken file starts from nothing */ }
  if (data.lan && data.lan.enabled === true) return false;
  data.lan = { ...(data.lan && typeof data.lan === 'object' ? data.lan : {}), enabled: true };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}

/**
 * The QR code of `text` as lines of text, two modules per character row (half blocks), with a 2 module quiet zone.
 * Light modules are the filled glyphs: on a dark terminal the code has the right polarity (dark modules are the background).
 */
export function qrLines(text) {
  const { matrix } = buildQr(text);
  const q = 2, n = matrix.length + 2 * q;
  const light = (x, y) => { const mx = x - q, my = y - q; return mx < 0 || my < 0 || mx >= matrix.length || my >= matrix.length || !matrix[my][mx]; };
  const lines = [];
  for (let y = 0; y < n; y += 2) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const top = light(x, y), bottom = y + 1 < n ? light(x, y + 1) : true;
      row += top && bottom ? '\u2588' : top ? '\u2580' : bottom ? '\u2584' : ' ';
    }
    lines.push(row);
  }
  return lines;
}

const get = async (url, init) => { try { return await fetch(url, { signal: AbortSignal.timeout(2000), ...init }); } catch { return null; } };

/** Asks a running hub to leave, waits until it is gone, starts this folder's hub detached and waits until it answers. */
async function restartHub(base) {
  await get(`${base}/shutdown`, { method: 'POST' });
  for (let i = 0; i < 30 && (await get(`${base}/health`)); i++) await sleep(100);
  spawn(process.execPath, [path.join(HERE, 'hub.mjs')], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 100; i++) { if (await get(`${base}/health`)) return true; await sleep(100); }
  return false;
}

async function main() {
  const file = defaultConfigPath();
  const changed = enableLan(file);
  const base = `http://${loadConfig(file).host}`;
  if (changed && !(await restartHub(base))) { console.log(`The hub did not restart at ${base}. Start it, then run this command again.`); process.exitCode = 1; return; }
  let url = null;
  for (let i = 0; i < 20 && !url; i++) {
    const r = await get(`${base}/pair-info`);
    try { url = r?.ok ? (await r.json()).url : null; } catch { url = null; }
    if (!url && i < 19) await sleep(200);
  }
  if (!url) { console.log(`No pairing address: the hub at ${base} is not reachable, or this computer has no private network address (is it on Wi-Fi?).`); process.exitCode = 1; return; }
  console.log('Pair a phone (it must be on the same Wi-Fi as this computer):\n');
  console.log(qrLines(url).join('\n'));
  console.log(`\n${url}\n`);
  console.log('Scan the code with the phone camera. The page opens full screen after one tap.');
  console.log('The link is plain http: use it on a network you trust. Phone access was turned on in ' + file + '.');
}

const isMain = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
})();
if (isMain) main().catch((e) => { console.log(`pair: ${e.message}`); process.exitCode = 1; });
