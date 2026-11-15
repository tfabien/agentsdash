// Queue rules shared by the device relays (relay_http.mjs, relay_serial.mjs): every item has a key, and coalescing keeps
// the latest item of each key.

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
