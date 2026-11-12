// Relay of the hub's events to a gadget over Wi-Fi: POST http://<gadget>/event and /usage, same bodies.
// send() never blocks: items wait in a queue, sent one at a time. Each event carries the full state of its agent,
// so a dropped or coalesced event is repaired by the next one for the same agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const defaultLockFile = () => path.join(os.tmpdir(), 'agent-gadget-tft.lock');
const FAILURE_PAUSE_MS = 3000;

/**
 * @param {{host: string, timeoutMs?: number, lockFile?: string, retryMs?: number, maxQueue?: number, fetchImpl?: Function}} opts
 * While `lockFile` exists (a screen .tft upload is running: the gadget aborts it on any other request) nothing is sent.
 * After a failure the relay waits 3 s, keeping only the latest queued item of each agent.
 * @returns {{send: (route: '/event'|'/usage'|'/dismiss'|'/settings', body: object) => void, stop: () => void, status: () => {ok: boolean, lastError: string, queued: number}}}
 */
export function createHttpRelay({ host, timeoutMs = 2000, lockFile = defaultLockFile(), retryMs = 1000, maxQueue = 50, fetchImpl = globalThis.fetch }) {
  let queue = [];
  let running = false;
  let ok = true;
  let lastError = '';
  let pauseUntil = 0;
  let timer = null;
  let stopped = false;

  const wake = (ms) => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; pump(); }, ms);
    timer.unref();
  };

  function coalesce() {                       // keep the latest item per key, in order
    const seen = new Set();
    const kept = [];
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!seen.has(queue[i].key)) { seen.add(queue[i].key); kept.push(queue[i]); }
    }
    queue = kept.reverse();
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length && !stopped) {
        if (fs.existsSync(lockFile)) { wake(retryMs); return; }
        const wait = pauseUntil - Date.now();
        if (wait > 0) { wake(wait); return; }
        const item = queue.shift();
        try {
          const r = await fetchImpl(`http://${host}${item.route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body), signal: AbortSignal.timeout(timeoutMs),
          });
          await r.arrayBuffer();
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          ok = true;
          lastError = '';
        } catch (e) {
          ok = false;
          lastError = String(e?.cause?.code ?? e?.message ?? e);
          pauseUntil = Date.now() + FAILURE_PAUSE_MS;
          coalesce();
        }
      }
    } finally { running = false; }
  }

  return {
    send(route, body) {
      if (stopped) return;
      queue.push({ route, body, key: route === '/usage' ? 'usage' : route === '/settings' ? 'settings' : route === '/dismiss' ? `dismiss:${body.session}` : `${body.session}:${body.agent}` });
      if (queue.length > maxQueue) {
        coalesce();
        if (queue.length > maxQueue) queue = queue.slice(-maxQueue);
      }
      pump();
    },
    /** The hub swapped to another device: forget what is queued and send nothing more. */
    stop() { stopped = true; queue = []; clearTimeout(timer); timer = null; },
    status: () => ({ ok, lastError, queued: queue.length }),
  };
}
