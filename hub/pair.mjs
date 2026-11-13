#!/usr/bin/env node
// `node pair.mjs`: turns phone access on (POST /lan to the running hub, else the config file and a restart), prints the pairing address and its QR code.
// An agent runs it for the user at the end of an install; the user can run it any time. Needs Wi-Fi: the phone and this computer share a network.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, defaultConfigPath } from './config.mjs';
import { buildQr } from './web/qr.js';
import { setLan } from './lan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Turns `lan.enabled` on in the config file. @returns {boolean} true when the file changed. */
export const enableLan = (file) => setLan(file, true);

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
  const base = `http://${loadConfig(file).host}`;
  // A running hub that knows POST /lan turns phone access on in place (and writes the config). Any other case: edit the config and restart.
  const reply = await get(`${base}/lan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  if (!reply?.ok) {
    enableLan(file);
    if (!(await restartHub(base))) { console.log(`The hub did not restart at ${base}. Start it, then run this command again.`); process.exitCode = 1; return; }
  }
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
  console.log('The link is plain http: use it on a network you trust. Phone access is now on (`lan.enabled` in the config file); the QR button of the page turns it off.');
}

const isMain = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
})();
if (isMain) main().catch((e) => { console.log(`pair: ${e.message}`); process.exitCode = 1; });
