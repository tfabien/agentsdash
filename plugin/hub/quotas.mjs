/*
 * Plan quotas (5 h and 7 days), polled by the hub for the desktop app that runs no status line.
 *
 * Reads the Claude OAuth token (env CLAUDE_CODE_OAUTH_TOKEN, else ~/.claude/.credentials.json while not expired;
 * never refreshed, never logged), then asks the undocumented api/oauth/usage endpoint. That endpoint needs the
 * user:profile scope; when it refuses, a 1-token Haiku call to /v1/messages returns the same numbers in its
 * anthropic-ratelimit-unified-* headers (costs a few tokens per call). Pace and history come from statusline.mjs.
 * Polls at most once a minute, only while a session exists. Off with CLAUDE_GADGET_QUOTAS=0 or "quotas": false.
 * All times here are epoch seconds.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { historyPath, updateHistory, usageBody } from '../scripts/statusline.mjs';

const EVERY_S = 60;
const STATUSLINE_FRESH_S = 120;
const USAGE_BACKOFF_S = 900;             // 429 without a usable Retry-After
const BACKOFF_MIN_S = 60;
const LAST_FILE = 'quotas.last.json';    // last good limits, so a hub restart does not start blind
const USAGE_DEAD_S = 3600;               // after a refusal, skip the usage endpoint for an hour
const H5_WINDOW_S = 5 * 3600;
const H5_SLACK_S = 600;                  // a window older than this with 0 % is implausible for a user who works
const USAGE_REFUSED = [401, 403, 404];   // the endpoint will not serve this token
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 15000;
const TICK_MS = 5000;

export const defaultCredentials = () => path.join(os.homedir(), '.claude', '.credentials.json');

export function quotasEnabled(env, cfg) {
  return env.CLAUDE_GADGET_QUOTAS !== '0' && cfg.quotas !== false;
}

/** macOS only: the Claude Code credentials JSON from the login Keychain, or null. */
export function readKeychain() {
  if (process.platform !== 'darwin') return null;
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

/** Token for the API, or null. `now` in seconds. */
export function readToken(env, file, now, keychain = readKeychain) {
  const fromEnv = String(env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim();
  if (fromEnv) return fromEnv;
  let oauth;
  try { oauth = JSON.parse(fs.readFileSync(file, 'utf8')).claudeAiOauth ?? {}; } catch {
    // macOS keeps the credentials in the login Keychain instead of a file.
    try { oauth = JSON.parse(keychain() ?? '').claudeAiOauth ?? {}; } catch { return null; }
  }
  const { accessToken, expiresAt } = oauth;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  if (typeof expiresAt === 'number' && expiresAt > 1e11 && expiresAt / 1000 <= now) return null;   // 0: no expiry recorded
  return accessToken;
}

export function parseUsageJson(data) {
  const out = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const name of ['five_hour', 'seven_day']) {
    const w = data[name];
    if (!w) continue;
    const pct = Number(w.utilization);
    const reset = Date.parse(String(w.resets_at));
    if (!Number.isFinite(pct) || Number.isNaN(reset)) continue;
    out[name] = { used_percentage: pct, resets_at: reset / 1000 };
  }
  return out;
}

/** `headers`: a Headers object or a plain object with lower-case names. */
export function parseHeaders(headers) {
  const get = (n) => (typeof headers.get === 'function' ? headers.get(n) : headers[n]);
  const out = {};
  for (const [name, key] of [['five_hour', '5h'], ['seven_day', '7d']]) {
    const pct = parseFloat(get(`anthropic-ratelimit-unified-${key}-utilization`));
    const reset = parseFloat(get(`anthropic-ratelimit-unified-${key}-reset`));
    if (Number.isNaN(pct) || Number.isNaN(reset)) continue;
    out[name] = { used_percentage: pct * 100, resets_at: reset };
  }
  return out;
}

/** The Haiku probe headers can report 5h 0.0 while the window is running (seen with 4h18 left and hours of use).
 * A running window older than H5_SLACK_S with 0 % is shown as unknown instead of a misleading 0 %. */
export function dropImplausibleH5(limits, now) {
  const h5 = limits.five_hour;
  if (h5 && h5.used_percentage <= 0 && h5.resets_at - now < H5_WINDOW_S - H5_SLACK_S) {
    const { five_hour: _dropped, ...rest } = limits;
    return rest;
  }
  return limits;
}

export const bodyFromLimits = (limits, now, samples) => usageBody({ session_id: '', rate_limits: limits }, now, samples ?? undefined);

/** Seconds to skip the usage endpoint after a 429: its Retry-After (in seconds) within 1 min..15 min, else 15 min. */
export function backoffSeconds(headers) {
  const v = Number(typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after']);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.max(v, BACKOFF_MIN_S), USAGE_BACKOFF_S) : USAGE_BACKOFF_S;
}

/** Last good limits from disk: windows whose reset time has passed are dropped. Returns {limits, at} or null. */
export function loadLast(folder, now) {
  try {
    const { at, limits } = JSON.parse(fs.readFileSync(path.join(folder, LAST_FILE), 'utf8'));
    if (!Number.isFinite(at) || at > now) return null;
    const live = Object.fromEntries(Object.entries(limits ?? {}).filter(([, w]) => w && w.resets_at > now && Number.isFinite(w.used_percentage)));
    return Object.keys(live).length ? { limits: live, at } : null;
  } catch { return null; }
}

function saveLast(folder, now, limits) {
  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, LAST_FILE), JSON.stringify({ at: now, limits }), 'utf8');
  } catch { /* losing the file only costs a blind start */ }
}

/** A terminal status line reports exact quotas (*.usage files): the probe must not overwrite them. */
function statuslineFresh(folder, now) {
  try {
    return fs.readdirSync(folder).some((n) => n.endsWith('.usage') && now - fs.statSync(path.join(folder, n)).mtimeMs / 1000 < STATUSLINE_FRESH_S);
  } catch { return false; }
}

/**
 * @param {{token: string, now: number, fetchImpl: Function, state: {deadUntil: number, backoffUntil: number}, folder: string}} o
 * `state` is mutated: a refusal (401/403/404) skips the usage endpoint for an hour, a 429 for 15 minutes.
 */
export async function fetchLimits({ token, now, fetchImpl, state, folder }) {
  if (statuslineFresh(folder, now)) return { limits: {}, source: 'statusline' };
  if (now >= state.deadUntil && now >= state.backoffUntil) {
    try {
      const r = await fetchImpl(USAGE_URL, { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok) {
        const limits = parseUsageJson(await r.json());
        if (Object.keys(limits).length) return { limits, source: 'usage_api' };
      } else if (USAGE_REFUSED.includes(r.status)) state.deadUntil = now + USAGE_DEAD_S;
      else if (r.status === 429) state.backoffUntil = now + backoffSeconds(r.headers);
    } catch { /* fall through to the probe */ }
  }
  try {
    const r = await fetchImpl(MESSAGES_URL, {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json', 'User-Agent': 'claude-code/2.1.146',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    return { limits: dropImplausibleH5(parseHeaders(r.headers), now), source: 'messages' };     // a 429 still carries the headers
  } catch { return { limits: {}, source: 'error' }; }
}

/**
 * @param {{enabled: boolean, hasSessions: () => boolean, apply: (body: object, atMs?: number) => void, stateDir: string, env?: object,
 *   credentialsPath?: string, fetchImpl?: Function, log?: (line: string) => void}} opts
 * @returns {{pollOnce: (now: number) => Promise<void>, start: () => void, stop: () => void}}
 */
export function createQuotaPoller(opts) {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const state = { deadUntil: 0, backoffUntil: 0 };
  let lastAt = -Infinity;
  let busy = false;
  let timer = null;

  async function pollOnce(now) {
    if (!opts.enabled || busy || now - lastAt < EVERY_S || !opts.hasSessions()) return;
    const token = readToken(env, opts.credentialsPath ?? defaultCredentials(), now);
    if (!token) return;
    busy = true;
    lastAt = now;
    try {
      const { limits, source } = await fetchLimits({ token, now, fetchImpl, state, folder: opts.stateDir });
      if (!Object.keys(limits).length) return;
      const h5 = limits.five_hour, d7 = limits.seven_day;
      const samples = updateHistory(historyPath(opts.stateDir), now, h5 ? [h5.used_percentage, h5.resets_at] : null, d7 ? [d7.used_percentage, d7.resets_at] : null);
      saveLast(opts.stateDir, now, limits);
      opts.apply(bodyFromLimits(limits, now, samples));
      opts.log?.(`quotas from ${source}`);
    } catch { /* the next minute tries again */ } finally { busy = false; }
  }

  return {
    pollOnce,
    /** Show the last good numbers (marked old by their age) until the first poll succeeds. */
    restore(now = Date.now() / 1000) {
      const last = loadLast(opts.stateDir, now);
      if (last) opts.apply(bodyFromLimits(last.limits, last.at, null), last.at * 1000);
    },
    start() { this.restore(); if (!timer) { timer = setInterval(() => { pollOnce(Date.now() / 1000); }, TICK_MS); timer.unref(); } },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
