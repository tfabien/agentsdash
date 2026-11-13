// Validation of a relay choice made from the page (POST /relay). The hub sends requests to the host it is given, so the host must be
// a device on the local network: a private IP, or a *.local name whose every address (looked up now) is private. Loopback is refused:
// the hub's own address would make it relay to itself in a loop.
import net from 'node:net';
import dns from 'node:dns/promises';

const SERIAL_PATH = /^(COM\d{1,3}|\/dev\/[A-Za-z0-9._/-]+)$/;

export function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(low) || /^fe[89ab]/.test(low);
  }
  return false;
}

export const isLoopback = (ip) => ip === '::1' || /^127\./.test(ip) || /^::ffff:127\./i.test(ip);

/** Splits "host", "host:port", "[v6]" or "[v6]:port". Returns null when the text has any other shape (URL, path, credentials). */
function splitHost(text) {
  const m = /^\[([0-9a-fA-F:.]+)\](?::(\d{1,5}))?$/.exec(text) ?? /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text);
  if (!m) return null;
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535)) return null;
  return { name: m[1], port: m[2] };
}

/** @returns {Promise<string>} '' when the host is acceptable, else the reason it is not. */
export async function checkRelayHost(text, lookup = dns.lookup) {
  const parts = typeof text === 'string' ? splitHost(text.trim()) : null;
  if (!parts) return 'host must be an IP or a .local name, with an optional port (no URL, no path)';
  const { name } = parts;
  if (net.isIP(name)) {
    if (isLoopback(name)) return 'the hub itself is not a device (loopback address)';
    return isPrivateIp(name) ? '' : 'only addresses of the local network are allowed (10.x, 172.16-31.x, 192.168.x, 169.254.x, fc00::/7, fe80::/10)';
  }
  if (!/\.local$/i.test(name)) return 'only IP addresses and .local names are allowed';
  let found;
  try { found = await lookup(name, { all: true }); } catch { return `${name} does not resolve`; }
  if (!found.length) return `${name} does not resolve`;
  if (found.some((a) => !isPrivateIp(a.address))) return `${name} resolves outside the local network`;
  return '';
}

/**
 * @param {object} body {mode: 'none'|'http'|'serial', host?, port?}
 * @returns {Promise<{relay: {mode: string, host?: string, port?: string}} | {error: string}>}
 */
export async function parseRelay(body, lookup) {
  const mode = body?.mode;
  if (mode === 'none') return { relay: { mode: 'none' } };
  if (mode === 'http') {
    const host = String(body.host ?? '').trim();
    const why = await checkRelayHost(host, lookup);
    return why ? { error: why } : { relay: { mode, host } };
  }
  if (mode === 'serial') {
    const port = String(body.port ?? '').trim();
    return SERIAL_PATH.test(port) ? { relay: { mode, port } } : { error: 'port must look like COM3 or /dev/ttyUSB0' };
  }
  return { error: 'mode must be none, http or serial' };
}

/** Same relay (mode and target)? A swap to an identical choice does nothing, so a serial port is not closed and reopened. */
export const sameRelay = (a, b) => a.mode === b.mode && (a.host ?? '') === (b.host ?? '') && (a.port ?? '') === (b.port ?? '');
