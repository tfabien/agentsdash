#!/usr/bin/env node
// Agent hub: receives the plugin's events (same wire format as the gadget), keeps the state,
// serves the browser page and pushes the state over SSE. Binds to 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog, ICON_TYPES } from './themes_loader.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModel, PROTOCOL_VERSION } from './model.mjs';
import { validRules } from './rules.mjs';
import { SOURCE_RE, parseSource, listSource } from './market_source.mjs';
import { installTheme, removeTheme, readInstalled, saveUserTheme } from './market_install.mjs';
import { validatePalettePart } from './web/theme_schema.js';
import { annotate, createUpdater } from './market_update.mjs';
import { installFirstTheme } from './market_bootstrap.mjs';
import { loadConfig, defaultConfigPath } from './config.mjs';
import { createQuotaPoller, quotasEnabled } from './quotas.mjs';
import { createHttpRelay, defaultLockFile } from './relay_http.mjs';
import { createSerialRelay, listSerialPorts } from './relay_serial.mjs';
import { parseRelay, sameRelay } from './relay_config.mjs';
import { stateDir } from '../scripts/common.mjs';

const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const MAX_BODY = 64 * 1024;
const SOUNDS = ['all', 'ask', 'off'];
const OVERRIDE_KEY = /^[a-z0-9-]{1,32}(\/[a-z0-9-]{1,32})?$/;
/** `{ "<theme>" | "<theme>/<variant>": { colors?, accent? } }`: the user's color edits. The whole value is refused when any entry is invalid. */
const validOverrides = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 64
  && Object.entries(v).every(([k, o]) => OVERRIDE_KEY.test(k) && o && typeof o === 'object' && !Array.isArray(o) && validatePalettePart(o).ignored.length === 0);
/** `{ "<theme>": ["lookKey", ...] }`: the looks the user ticked per theme. The whole value is refused when any entry is invalid. */
const validLooks = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 64
  && Object.entries(v).every(([k, l]) => /^[a-z0-9-]{1,32}$/.test(k) && Array.isArray(l) && l.length <= 12 && l.every((x) => typeof x === 'string' && /^[a-z0-9-]{1,32}$/.test(x)));
// Settings shared by every page, with what each accepts. Anything else in a POST is ignored.
const SETTING_RULES = {
  sound: (v) => SOUNDS.includes(v),
  max_tiles: (v) => Number.isInteger(v) && v >= 0 && v <= 32,        // tiles per page, 0 = Auto (what fits the window)
  theme: (v) => typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v),
  pulse: (v) => typeof v === 'boolean',
  dim_idle: (v) => typeof v === 'boolean',
  rules: validRules,                                                  // per-project icon pack and badge color
  marketSources: (v) => Array.isArray(v) && v.length <= MAX_SOURCES && v.every((x) => typeof x === 'string' && SOURCE_RE.test(x)) && new Set(v).size === v.length,
  done_excerpt: (v) => ['first', 'last', 'off'].includes(v),          // what a session waiting for you shows: first or last paragraph of its reply, or the fixed text
  themeVariant: (v) => v === '' || (typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v)),   // variant of the theme, '' for the base
  themeLooks: validLooks,                                             // the looks ticked per theme (see activeLooks in theme_schema.js)
  themeOverrides: validOverrides,                                     // the user's color edits per theme or theme/variant
  themeAutoUpdate: (v) => typeof v === 'boolean',                     // install newer versions of marketplace themes (every 6 hours)
};
const MAX_SOURCES = 10;
const SETTING_DEFAULTS = { sound: 'ask', max_tiles: 0, theme: 'default', pulse: true, dim_idle: true, done_excerpt: 'first', themeVariant: '', themeOverrides: {}, themeLooks: {}, rules: [], marketSources: ['tfabien/standup-bot-themes'], themeAutoUpdate: true };
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
  // Themes and icon packs from the built-in and user folders. `iconFiles` maps a served URL to its file: no path comes from a request.
  const catalogDirs = { builtinDir: opts.builtinDir ?? HUB_DIR, userDir: opts.userDir ?? path.join(os.homedir(), '.claude', 'standup-bot') };
  let catalog = { themes: [], packs: [], errors: [] };
  let iconFiles = new Map();
  function reloadCatalog() {
    catalog = loadCatalog(catalogDirs);
    iconFiles = new Map();
    for (const dir of [catalogDirs.builtinDir, catalogDirs.userDir]) {       // same order as the loader: the user folder wins
      for (const p of catalog.packs) {
        for (const url of Object.values(p.roles)) {
          const file = path.join(dir, 'icons', p.name, path.basename(url));
          if (fs.existsSync(file)) iconFiles.set(url, file);
        }
      }
    }
  }
  reloadCatalog();

  // Marketplace: themes of GitHub repositories (market_source.mjs), installed into the user folder (market_install.mjs) and kept
  // current by a timer (market_update.mjs). The page talks to these routes only, never to GitHub.
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const builtinNames = () => new Set(loadCatalog({ builtinDir: catalogDirs.builtinDir, userDir: null }).themes.map((t) => t.name));
  const cacheFile = path.join(catalogDirs.userDir, 'market-cache.json');
  const store = {
    read: () => { try { const d = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; } },
    write: (data) => { try { fs.mkdirSync(catalogDirs.userDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8'); } catch { /* the listing is only fetched again */ } },
  };
  const updater = createUpdater({
    store,
    getInstalled: () => readInstalled(catalogDirs.userDir),
    list: (source) => listSource(source, fetchFn),
    install: (theme) => installTheme({ theme, userDir: catalogDirs.userDir, builtinNames: builtinNames(), fetchFn }),
    isActive: () => settings.themeAutoUpdate && (clients.size > 0 || model.toState(now()).sessions.length > 0),
    onDone: () => { reloadCatalog(); publish(); },
  });
  updater.start();
  // First launch (only when asked: the hub process, not the tests): no theme at all, so one is downloaded and applied. Retried every 10 minutes while none exists.
  const firstTheme = async () => {
    const name = await installFirstTheme({
      sources: settings.marketSources,
      preferred: config.first_theme,
      hasTheme: () => catalog.themes.length > 0,
      list: (source) => updater.list(source),
      install: (theme) => installTheme({ theme, userDir: catalogDirs.userDir, builtinNames: builtinNames(), fetchFn }),
    });
    if (!name) return;
    reloadCatalog();
    if (settings.theme === 'default') saveSettings({ theme: name });
    publish();
  };
  const firstThemeTimer = opts.firstRunTheme ? setInterval(() => { if (catalog.themes.length === 0) firstTheme(); }, 10 * 60 * 1000) : null;
  firstThemeTimer?.unref?.();
  if (opts.firstRunTheme) setTimeout(firstTheme, 0);
  const stateJson = () => ({ ...model.toState(now()), boot: startedAt, settings, catalog, ...(relayInfo() ? { relay: relayInfo() } : {}) });
  const publish = () => {
    const payload = JSON.stringify(stateJson());
    for (const res of clients) res.write(`data: ${payload}\n\n`);
    for (const fn of changeTaps) { try { fn(); } catch { /* a tap never breaks the hub */ } }
  };
  const text = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(body); };
  const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  function serveStatic(res, urlPath) {
    const rel = urlPath === '/' || urlPath === '/hub' || urlPath === '/hub/' ? 'hub.html' : decodeURIComponent(urlPath.slice(1));
    const file = path.join(WEB_DIR, rel);
    if (!file.startsWith(WEB_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return text(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  /** Applies validated settings: memory, the gadget taps and the settings file. */
  function saveSettings(next) {
    settings = { ...settings, ...next };
    for (const fn of settingsTaps) { try { fn({ sound: settings.sound }); } catch { /* tap errors stay local */ } }
    if (settingsFile) { try { fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf8'); } catch { /* the setting still holds until the hub stops */ } }
  }

  /** The JSON body of a request as an object, or null after answering 400 or 413. */
  async function jsonBody(req, res) {
    try {
      const body = JSON.parse(await readBody(req));
      if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    } catch (e) { if (e.status === 413) { text(res, 413, 'body too large'); return null; } }
    text(res, 400, 'invalid JSON');
    return null;
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
      case 'GET /health': return json(res, { ok: true, version: pluginVersion, core: pluginVersion, protocol: PROTOCOL_VERSION, script: realScript, startedAt });
      case 'POST /shutdown':                       // a newer plugin asks the old hub to leave (it starts a fresh one itself)
        text(res, 200, 'bye');
        if (opts.onShutdown) setTimeout(opts.onShutdown, 50);
        return undefined;
      case 'GET /state': return json(res, stateJson());
      case 'POST /reload':                          // rescan the theme and icon folders (the body, if any, is ignored)
        await readBody(req).catch(() => '');
        reloadCatalog();
        publish();
        return text(res, 200, 'ok');
      case 'GET /market': {
        const listings = await Promise.all(settings.marketSources.map((source) => updater.list(source)));
        const installed = readInstalled(catalogDirs.userDir);
        const themes = annotate(listings.flatMap((l) => l.themes), installed).map(({ files: _files, branch: _branch, ...t }) => t);
        const userThemes = loadCatalog({ builtinDir: null, userDir: catalogDirs.userDir }).themes.map((t) => t.name).filter((n) => !builtinNames().has(n));
        return json(res, { sources: settings.marketSources, installed, userThemes, themes, errors: listings.flatMap((l) => l.errors), lastCheck: updater.lastCheck(), refreshedAt: updater.refreshedAt(settings.marketSources), autoUpdate: settings.themeAutoUpdate });
      }
      case 'POST /market/refresh':                  // forget every listing: the next GET /market fetches them again
        await readBody(req).catch(() => '');
        updater.forget();
        return text(res, 200, 'ok');
      case 'POST /market/sources': {
        const body = await jsonBody(req, res);
        if (!body) return undefined;
        const add = body.add === undefined ? null : parseSource(body.add);
        if (body.add !== undefined && !add) return text(res, 400, 'a source is owner/repo of GitHub');
        const next = [...settings.marketSources.filter((s) => s !== body.remove), ...(add && !settings.marketSources.includes(add) ? [add] : [])];
        if (!SETTING_RULES.marketSources(next)) return text(res, 400, `at most ${MAX_SOURCES} sources`);
        saveSettings({ marketSources: next });
        updater.forget();
        publish();
        return text(res, 200, 'ok');
      }
      case 'POST /market/install': {
        const body = await jsonBody(req, res);
        if (!body) return undefined;
        if (!settings.marketSources.includes(body.source)) return text(res, 400, 'unknown source');
        const theme = (await updater.list(body.source)).themes.find((t) => t.name === body.name);
        if (!theme) return text(res, 400, 'unknown theme');
        try { await installTheme({ theme, userDir: catalogDirs.userDir, builtinNames: builtinNames(), fetchFn }); } catch (err) { return text(res, 400, err.message); }
        reloadCatalog();
        saveSettings({ theme: theme.name, themeVariant: '' });          // a new theme is applied at once, on every page
        publish();
        return text(res, 200, 'ok');
      }
      case 'POST /market/remove': {
        const body = await jsonBody(req, res);
        if (!body) return undefined;
        const name = String(body.name ?? '');
        try { if (!removeTheme({ name, userDir: catalogDirs.userDir, builtinNames: builtinNames() })) return text(res, 404, 'no such theme in the user folder'); } catch (err) { return text(res, 400, err.message); }
        if (settings.theme === name) saveSettings({ theme: 'default', themeVariant: '' });
        const kept = Object.fromEntries(Object.entries(settings.themeOverrides).filter(([k]) => k !== name && !k.startsWith(`${name}/`)));
        if (Object.keys(kept).length !== Object.keys(settings.themeOverrides).length) saveSettings({ themeOverrides: kept });
        if (name in settings.themeLooks) saveSettings({ themeLooks: Object.fromEntries(Object.entries(settings.themeLooks).filter(([k]) => k !== name)) });
        reloadCatalog();
        publish();
        return text(res, 200, 'ok');
      }
      case 'POST /themes': {                         // saves the current look (a theme, a variant, the user's edits) as a user theme
        const body = await jsonBody(req, res);
        if (!body) return undefined;
        const base = catalog.themes.find((t) => t.name === body.theme);
        if (!base) return text(res, 400, 'unknown theme');
        const override = validatePalettePart(body.override);
        try {
          saveUserTheme({ name: String(body.name ?? ''), label: typeof body.label === 'string' ? body.label : undefined, theme: base, variant: typeof body.variant === 'string' ? body.variant : '', override, looks: Array.isArray(body.looks) ? body.looks : undefined, userDir: catalogDirs.userDir, builtinNames: builtinNames(), overwrite: body.overwrite === true });
        } catch (err) { return text(res, /exists$/.test(err.message) ? 409 : 400, err.message); }
        reloadCatalog();
        saveSettings({ theme: String(body.name), themeVariant: '' });
        publish();
        return text(res, 200, 'ok');
      }
      case 'POST /market/update': {
        const body = await jsonBody(req, res);
        if (!body) return undefined;
        const result = await updater.check(typeof body.name === 'string' ? body.name : undefined);
        reloadCatalog();
        publish();
        return json(res, result);
      }
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
          if (!Object.keys(next).length) return text(res, 400, 'no valid setting: sound (all, ask, off), max_tiles (0 for Auto, 1 to 32), theme (a theme name), pulse, dim_idle, done_excerpt (first, last, off), rules (a list of {match, iconPack?, badgeColor?}), marketSources (a list of owner/repo), themeAutoUpdate (true or false)');
          saveSettings(next);
        } else if (route === 'POST /select') {
          if (!body || !model.select(String(body.session ?? ''), String(body.agent ?? 'lead'), now(), Number.isFinite(body.hold_ms) ? body.hold_ms : 30000)) return text(res, 404, 'unknown session or agent');
        } else {
          model.clear();
        }
        publish();
        return text(res, 200, 'ok');
      }
      default:
        if (req.method === 'GET' && url.pathname.startsWith('/icons/')) {
          const file = iconFiles.get(url.pathname);   // exact catalog URL only, so traversal and unlisted names are 404
          if (!file) return text(res, 404, 'not found');
          let data;
          try { data = fs.readFileSync(file); } catch { return text(res, 404, 'not found'); }
          res.writeHead(200, { 'Content-Type': ICON_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
          return res.end(data);
        }
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
    server.once('error', (e) => { clearInterval(timer); clearInterval(firstThemeTimer); updater.stop(); quotas.stop(); reject(e); });
    server.listen(wantedPort, host, () => {
      resolve({
        port: server.address().port, host, model, quotas,
        onEvent: (fn) => eventTaps.push(fn),
        onUsage: (fn) => usageTaps.push(fn),
        onChange: (fn) => changeTaps.push(fn),
        close: () => new Promise((done) => {
          clearInterval(timer);
          clearInterval(firstThemeTimer);
          updater.stop();
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
  startHub({ firstRunTheme: true, settingsFile: path.join(stateDir(), 'hub-settings.json'), configFile: defaultConfigPath(), onShutdown: () => process.exit(0) }).then((hub) => {
    process.stderr.write(`standup-bot hub listening on http://${hub.host}:${hub.port}/\n`);
  }).catch((e) => {
    process.stderr.write(`standup-bot hub: cannot start (${e.code ?? e.message})\n`);
    process.exit(1);
  });
}
