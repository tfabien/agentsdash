// Relay of the hub's events to a gadget over USB: one JSON line per event or usage report on the ESP32's serial port.
// Line: {"type":"event"|"usage"|"dismiss"|"settings","body":{...}}\n  (body = the POST body, same wire format as over Wi-Fi).
// The hub owns the COM port: release() lets another tool (pio upload, hmi_bridge) take it, reopen() takes it back.
// Needs the optional `serialport` package, loaded only when the port is opened.
import { capQueue, latestPerKey, queueItem } from './relay_queue.mjs';

export const SETTLE_MS = 2500;      // opening the port resets the ESP32: it needs about 2.5 s before it reads again
export const RETRY_MS = 5000;       // reconnect delay when the port is missing or lost
const NO_SERIALPORT = 'serialport package not installed (run: npm install serialport, in hub)';

async function defaultOpen(path, baud) {
  let mod;
  try { mod = await import('serialport'); } catch { throw new Error(NO_SERIALPORT); }
  return new Promise((resolve, reject) => {
    const port = new mod.SerialPort({ path, baudRate: baud, autoOpen: false });
    port.open((err) => (err ? reject(err) : resolve(port)));
  });
}

/** Serial ports of this computer, for the settings page. `error` says why there is no list (serialport missing). */
export async function listSerialPorts() {
  let mod;
  try { mod = await import('serialport'); } catch { return { ports: [], error: NO_SERIALPORT }; }
  try {
    const found = await mod.SerialPort.list();
    return { ports: found.map((p) => ({ path: p.path, label: [p.friendlyName, p.manufacturer].filter(Boolean).join(' - ') })) };
  } catch (e) { return { ports: [], error: String(e?.message ?? e) }; }
}

/**
 * @param {{path: string, baud?: number, open?: (path: string, baud: number) => Promise<object>, settleMs?: number, retryMs?: number, maxQueue?: number,
 *   replay?: () => Array<{route: string, body: object}>}} opts
 * `open` returns a port with write(data, cb), close(cb) and on('error'|'close', fn).
 * `replay` gives the hub's live state (settings, last event of each live agent): each open resets the ESP32, so these items
 * go ahead of the queue once the port has settled, and a newer queued item of the same key still wins.
 * @returns {{start: () => void, send: (route: '/event'|'/usage', body: object) => void, release: () => void, reopen: () => void,
 *   status: () => {ok: boolean, connected: boolean, released: boolean, lastError: string, queued: number}}}
 */
export function createSerialRelay({ path, baud = 115200, open = defaultOpen, settleMs = SETTLE_MS, retryMs = RETRY_MS, maxQueue = 50, replay = () => [] }) {
  let port = null;
  let connecting = false;
  let ready = false;                  // the settle time after open has passed
  let released = false;
  let lastError = '';
  let queue = [];
  let retryTimer = null;
  let settleTimer = null;

  const unref = (t) => { t.unref?.(); return t; };

  function scheduleRetry() {
    if (released || retryTimer) return;
    retryTimer = unref(setTimeout(() => { retryTimer = null; connect(); }, retryMs));
  }

  function drop(error) {
    if (!port) return;
    port = null;
    ready = false;
    lastError = error;
    clearTimeout(settleTimer);
    scheduleRetry();
  }

  function flush() {
    while (port && ready && queue.length) {
      const item = queue.shift();
      const p = port;
      p.write(`${JSON.stringify({ type: item.type, body: item.body })}\n`, (err) => { if (err && port === p) drop(String(err.message ?? err)); });
    }
  }

  function connect() {
    if (released || connecting || port) return;
    connecting = true;
    open(path, baud).then((p) => {
      connecting = false;
      if (released) { p.close?.(() => {}); return; }
      port = p;
      lastError = '';
      p.on('error', (e) => { if (port === p) drop(String(e?.message ?? e)); });
      p.on('close', () => { if (port === p) drop('port closed'); });
      settleTimer = unref(setTimeout(() => {
        ready = true;
        let back = [];
        try { back = replay().map(({ route, body }) => itemOf(route, body)); } catch { /* nothing to replay */ }
        queue = latestPerKey([...back, ...queue]);
        flush();
      }, settleMs));
    }).catch((e) => {
      connecting = false;
      lastError = String(e?.message ?? e);
      scheduleRetry();
    });
  }

  function itemOf(route, body) {
    const type = route === '/usage' ? 'usage' : route === '/settings' ? 'settings' : route === '/dismiss' ? 'dismiss' : 'event';
    return { ...queueItem(route, body), type };     // ASCII only (the gadget fonts) and cut to the firmware's buffers
  }

  return {
    start: connect,
    send(route, body) {
      queue.push(itemOf(route, body));
      queue = capQueue(queue, maxQueue);
      flush();
    },
    release() {
      released = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      clearTimeout(settleTimer);
      ready = false;
      if (port) { const p = port; port = null; p.close?.(() => {}); }
    },
    reopen() { released = false; connect(); },
    status: () => ({ ok: port !== null && lastError === '', connected: port !== null, released, lastError, queued: queue.length }),
  };
}
