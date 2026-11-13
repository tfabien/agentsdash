// Marketplace updates: which installed themes have a newer version in their source, and a timer that installs them.
import { compareVersions } from './web/theme_schema.js';

const CACHE_MS = 24 * 3600 * 1000;
const CACHE_FORMAT = 2;                                            // raise it when a listing gains fields: older cached listings are fetched again
const SIX_HOURS = 6 * 3600 * 1000;

/** Adds `installed`, `installedVersion` and `updatable` to each listed theme. `installed` is the content of market.json. */
export function annotate(themes, installed) {
  return themes.map((t) => {
    const rec = installed[t.name];
    return { ...t, installed: Boolean(rec), installedVersion: rec?.version ?? '', updatable: Boolean(rec) && rec.source === t.source && compareVersions(t.version, rec.version) > 0 };
  });
}

/**
 * @param {{ store?: {read: () => object, write: (data: object) => void}, getInstalled: () => object, install: (theme: object) => Promise<unknown>, list: (source: string) => Promise<{themes: object[], errors: string[]}>,
 *   isActive?: () => boolean, onDone?: (r: {updated: string[], errors: string[]}) => void, intervalMs?: number, now?: () => number,
 *   setTimer?: typeof setInterval, clearTimer?: typeof clearInterval }} o
 */
export function createUpdater({ store = { read: () => ({}), write: () => {} }, getInstalled, install, list, isActive = () => true, onDone = () => {}, intervalMs = SIX_HOURS, now = Date.now, setTimer = setInterval, clearTimer = clearInterval }) {
  const cache = new Map();                                       // source -> { at, result }
  let last = 0;
  let timer = null;

  // A listing younger than 24 hours is reused, also after a hub restart (the disk store). A listing with errors is never kept: the next ask retries.
  const entry = (source) => cache.get(source) ?? store.read()[source];
  async function listCached(source) {
    const hit = entry(source);
    if (hit && hit.v === CACHE_FORMAT && now() - hit.at < CACHE_MS) { cache.set(source, hit); return hit.result; }
    const result = await list(source);
    if (!result.errors.length) { const fresh = { v: CACHE_FORMAT, at: now(), result }; cache.set(source, fresh); store.write({ ...store.read(), [source]: fresh }); }
    return result;
  }
  function forget() { cache.clear(); store.write({}); }

  /** Installs the newer version of every installed theme (or of `name` only). Lists are read fresh. */
  async function check(name) {
    forget();
    const installed = getInstalled();
    const wanted = Object.entries(installed).filter(([n]) => name === undefined || n === name);
    const updated = [];
    const errors = [];
    for (const source of new Set(wanted.map(([, rec]) => rec.source))) {
      const listing = await listCached(source);
      errors.push(...listing.errors);
      for (const theme of annotate(listing.themes, installed)) {
        if (!theme.updatable || (name !== undefined && theme.name !== name)) continue;
        try { await install(theme); updated.push(theme.name); } catch (err) { errors.push(`${theme.name}: ${err.message}`); }
      }
    }
    last = now();
    if (updated.length) onDone({ updated, errors });
    return { updated, errors };
  }

  const tick = () => { if (isActive()) check().catch(() => {}); };
  return {
    check,
    list: listCached,
    forget,
    refreshedAt: (sources) => Object.fromEntries(sources.map((s) => [s, entry(s)?.at ?? 0])),
    lastCheck: () => last,
    start() { if (timer) return; timer = setTimer(tick, intervalMs); timer?.unref?.(); tick(); },
    stop() { if (timer) clearTimer(timer); timer = null; },
  };
}
