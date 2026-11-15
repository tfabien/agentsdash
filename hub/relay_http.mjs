// Relay of the hub's events to a gadget over Wi-Fi: POST http://<gadget>/event and /usage, same bodies.
// send() never blocks: items wait in a queue, sent one at a time. An item that failed on the network or with a 5xx stays
// queued for the next try; coalescing keeps the latest item of each key (relay_queue.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { forDevice } from './ascii.mjs';
import { deviceKey, latestPerKey } from './relay_queue.mjs';

export const defaultLockFile = () => path.join(os.tmpdir(), 'agent-gadget-tft.lock');
const FAILURE_PAUSE_MS = 3000;

/**
 * @param {{host: string, timeoutMs?: number, lockFile?: string, retryMs?: number, pauseMs?: number, maxQueue?: number, fetchImpl?: Function}} opts
 * While `lockFile` exists (a screen .tft upload is running: the gadget aborts it on any other request) nothing is sent.
 * After a failure the relay waits `pauseMs` (3 s), keeping the failed item (not after a 4xx) and only the latest queued item of each key.
 * `locked` is true while the lock file holds the queue.
 * @returns {{send: (route: '/event'|'/usage'|'/dismiss'|'/settings', body: object) => void, stop: () => void, status: () => {ok: boolean, lastError: string, queued: number, locked: boolean}}}
 */
export function createHttpRelay({ host, timeoutMs = 2000, lockFile = defaultLockFile(), retryMs = 1000, pauseMs = FAILURE_PAUSE_MS, maxQueue = 50, fetchImpl = globalThis.fetch }) {
  let queue = [];
  let running = false;
  let ok = true;
  let lastError = '';
  let pauseUntil = 0;
  let timer = null;
  let stopped = false;
  let locked = false;

  const wake = (ms) => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; pump(); }, ms);
    timer.unref();
  };

  const coalesce = () => { queue = latestPerKey(queue); };

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length && !stopped) {
        if (fs.existsSync(lockFile)) { locked = true; wake(retryMs); return; }
        locked = false;
        const wait = pauseUntil - Date.now();
        if (wait > 0) { wake(wait); return; }
        const item = queue.shift();
        let status = 0;
        try {
          const r = await fetchImpl(`http://${host}${item.route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body), signal: AbortSignal.timeout(timeoutMs),
          });
          await r.arrayBuffer();
          status = r.status;
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          ok = true;
          lastError = '';
        } catch (e) {
          ok = false;
          lastError = String(e?.cause?.code ?? e?.message ?? e);
          pauseUntil = Date.now() + pauseMs;
          if (!stopped && !(status >= 400 && status < 500)) queue.unshift(item);   // network error or 5xx: try again (a newer item of the same key wins)
          coalesce();
        }
      }
    } finally { running = false; }
  }

  return {
    send(route, body) {
      if (stopped) return;
      body = forDevice(route, body);          // ASCII only (the gadget fonts) and cut to the firmware's buffers
      queue.push({ route, body, key: deviceKey(route, body) });
      if (queue.length > maxQueue) {
        coalesce();
        if (queue.length > maxQueue) queue = queue.slice(-maxQueue);
      }
      pump();
    },
    /** The hub swapped to another device: forget what is queued and send nothing more. */
    stop() { stopped = true; queue = []; clearTimeout(timer); timer = null; },
    status: () => ({ ok, lastError, queued: queue.length, locked }),
  };
}
