// LAN access for a phone (docs/superpowers/specs/2026-11-13-phone-pwa-design.md): opt-in, token pairing, read-only remote routes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const COOKIE = 'agentsdash_token';

/** True for the loopback addresses a local client connects from. */
export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** The pairing token (32 hex chars) stored in `file`; created, with its folder, when the file is missing or empty. */
export function loadOrCreateToken(file) {
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{32}$/.test(existing)) return existing;
  } catch { /* created below */ }
  const token = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

/** Sets `lan.enabled` in the config file, keeping every other key. @returns {boolean} true when the file changed. */
export function setLan(file, enabled) {
  let data = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch { /* a missing or broken file starts from nothing */ }
  if ((data.lan?.enabled === true) === enabled) return false;
  data.lan = { ...(data.lan && typeof data.lan === 'object' ? data.lan : {}), enabled };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}
`);
  return true;
}

/** Constant-time comparison; false when either side is missing or the lengths differ. */
export function tokenMatches(given, token) {
  if (typeof given !== 'string' || typeof token !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Private IPv4 addresses of this machine (192.168/16, 10/8, 172.16/12). */
export function privateAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) out.push(i.address);
    }
  }
  return out;
}

/** Host header values accepted for a LAN hub: loopback names, private addresses, the machine name, `extra`; each with the port. */
export function lanHosts(port, extra = []) {
  const names = ['127.0.0.1', 'localhost', '[::1]', ...privateAddresses(), os.hostname(), ...extra];
  return new Set(names.map((n) => `${n}:${port}`));
}

/** Value of cookie `name` in a Cookie header. */
export function parseCookie(header, name) {
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** What a paired remote client may call besides static files. */
export const REMOTE_ROUTES = new Set(['GET /phone', 'GET /phone.html', 'GET /manifest.webmanifest', 'GET /state', 'GET /events', 'GET /health']);

/** Files the page loads: a flat name with a web extension, or an exact icon URL. */
export function isRemoteStatic(urlPath) {
  if (/^\/[A-Za-z0-9_.-]+\.(js|css|svg|png|webmanifest)$/.test(urlPath) && !urlPath.includes('..')) return true;
  return /^\/icons\/[A-Za-z0-9_./-]+$/.test(urlPath) && !urlPath.includes('..');
}
