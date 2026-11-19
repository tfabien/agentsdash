// Opens the dashboard window: starts the hub when it is not running, then asks it to open the window (POST /dashboard).
// The desktop shortcut runs a copy of this file, ~/.agentsdash/open-dashboard.mjs (shortcut.mjs writes it), so it imports nothing from the hub:
// the core folder it lives in changes with every update, the copy does not.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const home = (env = process.env) => env.AGENTSDASH_HOME || path.join(os.homedir(), '.agentsdash');

/** host:port of the hub: the `host` of ~/.agentsdash/config.json, else 127.0.0.1:8765. */
export function hubHost(env = process.env) {
  try {
    const host = JSON.parse(fs.readFileSync(path.join(home(env), 'config.json'), 'utf8')).host;
    if (typeof host === 'string' && /^[\w.-]+:\d+$/.test(host)) return host;
  } catch { /* defaults */ }
  return '127.0.0.1:8765';
}

/** The hub.mjs of the highest core version in ~/.agentsdash/core/, or null. */
export function newestHubScript(env = process.env) {
  const base = path.join(home(env), 'core');
  let versions;
  try { versions = fs.readdirSync(base); } catch { return null; }
  const num = (v) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const cmp = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
  const best = versions.filter((v) => /^\d+\.\d+\.\d+/.test(v) && fs.existsSync(path.join(base, v, 'hub.mjs'))).sort(cmp).pop();
  return best ? path.join(base, best, 'hub.mjs') : null;
}

function request(method, host, route) {
  return new Promise((resolve) => {
    const [hostname, port] = host.split(':');
    const req = http.request({ hostname, port: Number(port), path: route, method, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts the hub when it does not answer, then opens the window. @returns {Promise<{ok: boolean, message: string}>} */
export async function openDashboard(env = process.env) {
  const host = hubHost(env);
  if (!(await request('GET', host, '/health'))) {
    const script = newestHubScript(env);
    if (!script) return { ok: false, message: 'No agentsdash core found in ~/.agentsdash/core/: send a message in a Claude Code session with the plugin first.' };
    spawn(process.execPath, [script], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
    let up = false;
    for (let i = 0; i < 30 && !up; i++) { await sleep(500); up = Boolean(await request('GET', host, '/health')); }
    if (!up) return { ok: false, message: 'The hub did not start.' };
  }
  const r = await request('POST', host, '/dashboard');
  if (r?.status === 200) return { ok: true, message: 'Dashboard opened.' };
  return { ok: false, message: `The hub could not open the window (HTTP ${r?.status ?? 'no answer'}): ${r?.body ?? ''}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await openDashboard();
  if (!r.ok) { console.error(r.message); await sleep(8000); }   // a shortcut's console closes at exit: keep the reason readable
  process.exitCode = r.ok ? 0 : 1;
}
