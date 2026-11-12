#!/usr/bin/env node
// Agent hub: receives the plugin's events (same wire format as the gadget), keeps the state,
// serves the browser page and pushes the state over SSE. Binds to 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModel } from './model.mjs';
import { loadConfig, defaultConfigPath } from './config.mjs';
import { createQuotaPoller, quotasEnabled } from './quotas.mjs';
import { createHttpRelay, defaultLockFile } from './relay_http.mjs';
import { createSerialRelay, listSerialPorts } from './relay_serial.mjs';
import { parseRelay, sameRelay } from './relay_config.mjs';
import { stateDir } from '../scripts/common.mjs';

const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const MAX_BODY = 64 * 1024;
const SOUNDS = ['all', 'ask', 'off'];
const VIEWS = ['single', 'hub'];
// Settings shared by every page, with what each accepts. Anything else in a POST is ignored.
const SETTING_RULES = {
  sound: (v) => SOUNDS.includes(v),
  view: (v) => VIEWS.includes(v),
  max_tiles: (v) => Number.isInteger(v) && v >= 2 && v <= 32,
  theme: (v) => typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v),
  pulse: (v) => typeof v === 'boolean',
  dim_idle: (v) => typeof v === 'boolean',
};
const SETTING_DEFAULTS = { sound: 'ask', view: 'single', max_tiles: 12, theme: 'default', pulse: true, dim_idle: true };
const validSettings = (o) => Object.fromEntries(Object.entries(SETTING_RULES).filter(([k, ok]) => o && k in o && ok(o[k])).map(([k]) => [k, o[k]]));
const TICK_MS = 1000;
const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));
const pluginVersion = (() => { try { return JSON.parse(fs.readFileSync(path.join(HUB_DIR, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version ?? ''; } catch { return ''; } })();
const realScript = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return fileURLToPath(import.meta.url); } })();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {{port?: number, host?: string, config?: object, now?: () => number}} opts
 * @returns {Promise<{port: number, host: string, model: object, close: () => Promise<void>, onChange: (fn) => void, onEvent: (fn) => void, onUsage: (fn) => void}>}
 */
export function startHub(opts = {}) {
  const config = opts.config ?? loadConfig();
  const now = opts.now ?? (() => Date.now());
  const host = opts.host ?? '127.0.0.1';
  const wantedPort = opts.port ?? (Number(String(config.host).split(':')[1]) || 8765);
  const model = createModel({ maxSessions: config.max_sessions });
  const startedAt = Date.now();
  // Settings shared by every page (and kept in a file for the next hub): beeps (default: only when something needs you), which view
  // opens, tiles on the hub page, pulse on events, grey idle sessions.
  const settingsFile = opts.settingsFile ?? null;
  let settings = { ...SETTING_DEFAULTS };
  if (settingsFile) { try { settings = { ...settings, ...validSettings(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))) }; } catch { /* defaults */ } }
  const clients = new Set();
  const eventTaps = [];
  const usageTaps = [];
  const dismissTaps = [];
  const settingsTaps = [];
  const changeTaps = [];

  // The relay to the device: chosen in agent-gadget.json, or from the page (POST /relay), which swaps it while the hub runs.
  let relayConf = config.relay ?? { mode: 'none' };
  let serial = null;
  let relay = null;
  const relayInfo = () => (relay ? { mode: relayConf.mode, ...(serial ? { port: relayConf.port } : { host: relayConf.host }), ...relay.status() } : null);
  const stateJson = () => ({ ...model.toState(now()), boot: startedAt, settings, ...(relayInfo() ? { relay: relayInfo() } : {}) });
  const publish = () => {
    const payload = JSON.stringify(stateJson());
    for (const res of clients) res.write(`data: ${payload}\n\n`);
    for (const fn of changeTaps) { try { fn(); } catch { /* a tap never breaks the hub */ } }
  };
  const text = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(body); };
  const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  function serveStatic(res, urlPath) {
    const rel = urlPath === '/' ? 'index.html' : urlPath === '/hub' || urlPath === '/hub/' ? 'hub.html' : decodeURIComponent(urlPath.slice(1));
    const file = path.join(WEB_DIR, rel);
    if (!file.startsWith(WEB_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return text(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    // No CORS: other web pages cannot read the state. A request must name this hub in Host (DNS rebinding) and, when it carries
    // an Origin (a browser POST from another page), that Origin must be the hub itself. The plugin sends no Origin.
    const self = new Set(['127.0.0.1', 'localhost', '[::1]'].map((h) => `${h}:${server.address().port}`));
    if (!self.has(req.headers.host)) return text(res, 403, 'forbidden host');
    if (req.headers.origin !== undefined && !self.has(String(req.headers.origin).replace(/^http:\/\//, ''))) return text(res, 403, 'forbidden origin');
    const url = new URL(req.url, 'http://x');
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /health': return json(res, { ok: true, version: pluginVersion, script: realScript, startedAt });
      case 'POST /shutdown':                       // a newer plugin asks the old hub to leave (it starts a fresh one itself)
        text(res, 200, 'bye');
        if (opts.onShutdown) setTimeout(opts.onShutdown, 50);
        return undefined;
      case 'GET /state': return json(res, stateJson());
      case 'GET /relay': return json(res, relayInfo() ?? { mode: 'none' });
      case 'GET /relay/ports': return json(res, await (opts.listPorts ?? listSerialPorts)());
      case 'POST /relay/test': return json(res, await testRelay());
      case 'POST /relay': {
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) { return e.status === 413 ? text(res, 413, 'body too large') : text(res, 400, 'invalid JSON'); }
        const parsed = await parseRelay(body, opts.lookup);
        if (parsed.error) return text(res, 400, parsed.error);
        const saved = swapRelay(parsed.relay);
        publish();
        return json(res, { ok: true, saved });
      }
      case 'POST /serial/release':
      case 'POST /serial/open':
        if (!serial) return text(res, 404, 'not in serial mode');
        if (route.endsWith('release')) serial.release(); else serial.reopen();
        return text(res, 200, 'ok');
      case 'GET /events': {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(stateJson())}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return undefined;
      }
      case 'POST /event':
      case 'POST /usage':
      case 'POST /select':
      case 'POST /dismiss':
      case 'POST /settings':
      case 'POST /reset': {
        let body;
        try {
          const raw = await readBody(req);
          body = route === 'POST /reset' && !raw.trim() ? {} : JSON.parse(raw);
        } catch (e) {
          return e.status === 413 ? text(res, 413, 'body too large') : text(res, 400, 'invalid JSON');
        }
        if (route === 'POST /event') {
          if (!model.applyEvent(body, now())) return text(res, 400, 'session, agent and a valid state are required');
          for (const fn of eventTaps) { try { fn(body); } catch { /* tap errors stay local */ } }
        } else if (route === 'POST /usage') {
          if (!body || typeof body.v !== 'number') return text(res, 400, 'v is required');
          model.applyUsage(body, now());
          for (const fn of usageTaps) { try { fn(body); } catch { /* tap errors stay local */ } }
        } else if (route === 'POST /dismiss') {
          const id = String(body?.session ?? '');
          if (!model.dismiss(id)) return text(res, 404, 'unknown session');
          for (const fn of dismissTaps) { try { fn({ session: id }); } catch { /* tap errors stay local */ } }
        } else if (route === 'POST /settings') {
          const next = validSettings(body);
          if (!Object.keys(next).length) return text(res, 400, 'no valid setting: sound (all, ask, off), view (single, hub), max_tiles (2 to 32), theme (a theme name), pulse, dim_idle');
          settings = { ...settings, ...next };
          for (const fn of settingsTaps) { try { fn({ sound: settings.sound }); } catch { /* tap errors stay local */ } }
          if (settingsFile) { try { fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf8'); } catch { /* the setting still holds until the hub stops */ } }
        } else if (route === 'POST /select') {
          if (!body || !model.select(String(body.session ?? ''), String(body.agent ?? 'lead'), now(), Number.isFinite(body.hold_ms) ? body.hold_ms : 30000)) return text(res, 404, 'unknown session or agent');
        } else {
          model.clear();
        }
        publish();
        return text(res, 200, 'ok');
      }
      default:
        if (req.method === 'GET') return serveStatic(res, url.pathname);
        return text(res, 404, 'not found');
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { if (!res.headersSent) text(res, 500, 'error'); else res.end(); });
  });
  const timer = setInterval(() => { model.prune(now()); if (clients.size) publish(); }, TICK_MS);
  timer.unref();

  // Relay to a gadget (Wi-Fi or USB): every accepted event and usage report is forwarded as received. The taps read the current relay.
  function buildRelay() {
    serial = relayConf.mode === 'serial' && relayConf.port ? createSerialRelay({ path: relayConf.port, ...(opts.serial ?? {}) }) : null;
    relay = serial ?? (relayConf.mode === 'http' && relayConf.host ? createHttpRelay({ host: relayConf.host, ...(opts.http ?? {}) }) : null);
    relay?.send('/settings', { sound: settings.sound });   // the gadget buzzer follows the hub setting from the start
  }
  eventTaps.push((body) => { const { plan_items: _items, ...forDevice } = body; relay?.send('/event', forDevice); });     // the gadget has no use for the plan list
  usageTaps.push((body) => relay?.send('/usage', body));
  dismissTaps.push((body) => relay?.send('/dismiss', body));
  settingsTaps.push((body) => relay?.send('/settings', body));
  buildRelay();

  /** Swaps the relay while the hub runs and writes the choice into the `relay` key of agent-gadget.json (the other keys stay). */
  function swapRelay(next) {
    if (!sameRelay(next, relayConf)) {
      serial?.release();                     // frees the COM port before another relay may open it
      relay?.stop?.();
      relayConf = next;
      buildRelay();
      serial?.start();
    }
    if (!opts.configFile) return false;
    try {
      let data = {};
      try { const parsed = JSON.parse(fs.readFileSync(opts.configFile, 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed; } catch { /* a new file */ }
      fs.mkdirSync(path.dirname(opts.configFile), { recursive: true });
      fs.writeFileSync(opts.configFile, `${JSON.stringify({ ...data, relay: next }, null, 2)}
`, 'utf8');
      return true;
    } catch { return false; }                // the choice still holds until the hub stops
  }

  /** The Test button: one real request to the device (GET /state over Wi-Fi), or the state of the open port over USB. */
  async function testRelay() {
    if (!relay) return { ok: false, error: 'no device configured' };
    if (serial) {
      const st = serial.status();
      return st.connected ? { ok: true, detail: `port ${relayConf.port} is open` } : { ok: false, error: st.released ? 'port released for another tool' : st.lastError || 'port not open' };
    }
    if (fs.existsSync(opts.http?.lockFile ?? defaultLockFile())) return { ok: false, error: 'a screen upload is running, try again when it is done' };
    const started = Date.now();
    try {
      const r = await (opts.http?.fetchImpl ?? globalThis.fetch)(`http://${relayConf.host}/state`, { signal: AbortSignal.timeout(2000) });
      await r.arrayBuffer();
      return r.ok ? { ok: true, detail: `answered in ${Date.now() - started} ms` } : { ok: false, error: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, error: String(e?.cause?.code ?? e?.message ?? e) }; }
  }

  // Plan quotas for the desktop app (no status line): polled while a session exists, applied like a POST /usage.
  const quotaOpts = opts.quota ?? {};
  const quotas = createQuotaPoller({
    enabled: quotasEnabled(quotaOpts.env ?? process.env, config),
    hasSessions: () => model.toState(now()).sessions.length > 0,
    apply: (body) => { model.applyUsage(body, now()); for (const fn of usageTaps) { try { fn(body); } catch { /* tap errors stay local */ } } publish(); },
    stateDir: quotaOpts.stateDir ?? stateDir(),
    env: quotaOpts.env,
    fetchImpl: quotaOpts.fetchImpl,
  });
  if (quotaOpts.autostart !== false) quotas.start();
  serial?.start();

  return new Promise((resolve, reject) => {
    server.once('error', (e) => { clearInterval(timer); quotas.stop(); reject(e); });
    server.listen(wantedPort, host, () => {
      resolve({
        port: server.address().port, host, model, quotas,
        onEvent: (fn) => eventTaps.push(fn),
        onUsage: (fn) => usageTaps.push(fn),
        onChange: (fn) => changeTaps.push(fn),
        close: () => new Promise((done) => {
          clearInterval(timer);
          quotas.stop();
          serial?.release();
          relay?.stop?.();
          for (const res of clients) res.end();
          clients.clear();
          server.close(() => done());
          server.closeAllConnections();
        }),
      });
    });
  });
}

// `node hub.mjs`: run as the hub process.
// realpath: Node reports import.meta.url as the real path, argv[1] may go through a symlink (e.g. a linked ~/.claude)
const isMain = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
})();
if (isMain) {
  startHub({ settingsFile: path.join(stateDir(), 'hub-settings.json'), configFile: defaultConfigPath(), onShutdown: () => process.exit(0) }).then((hub) => {
    process.stderr.write(`standup-bot hub listening on http://${hub.host}:${hub.port}/\n`);
  }).catch((e) => {
    process.stderr.write(`standup-bot hub: cannot start (${e.code ?? e.message})\n`);
    process.exit(1);
  });
}
