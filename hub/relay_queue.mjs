// Queue rules shared by the device relays (relay_http.mjs, relay_serial.mjs): every item has a key, and coalescing keeps
// the latest item of each key, and a queue over its cap keeps the latest item of each key, then the newest items.
import { forDevice } from './ascii.mjs';

/**
 * Key of a device item: one per agent event (`<session>:<agent>`), one per session for usage (each body carries that
 * session's context and the global quotas), one per dismissed session, one for the settings.
 */
export function deviceKey(route, body) {
  if (route === '/usage') return `usage:${body?.session ?? ''}`;
  if (route === '/settings') return 'settings';
  if (route === '/dismiss') return `dismiss:${body?.session}`;
  return `${body?.session}:${body?.agent}`;
}

/** The latest item of each key, in the order of those latest items. */
export function latestPerKey(queue) {
  const seen = new Set();
  const kept = [];
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!seen.has(queue[i].key)) { seen.add(queue[i].key); kept.push(queue[i]); }
  }
  return kept.reverse();
}

/** A queue item: the body goes through forDevice (ASCII only, cut to the firmware's buffers), the key uses the cut body. */
export function queueItem(route, body) {
  body = forDevice(route, body);
  return { route, body, key: deviceKey(route, body) };
}

/** The queue under `maxQueue` items: unchanged when it fits, else the latest item of each key, then only the newest. */
export function capQueue(queue, maxQueue) {
  if (queue.length <= maxQueue) return queue;
  const kept = latestPerKey(queue);
  return kept.length > maxQueue ? kept.slice(-maxQueue) : kept;
}
