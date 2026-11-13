// Marketplace updates: which installed themes have a newer version in their source, and a timer that installs them.
import { compareVersions } from './web/theme_schema.js';

const CACHE_MS = 10 * 60 * 1000;
const SIX_HOURS = 6 * 3600 * 1000;

/** Adds `installed`, `installedVersion` and `updatable` to each listed theme. `installed` is the content of market.json. */
export function annotate(themes, installed) {
  return themes.map((t) => {
    const rec = installed[t.name];
    return { ...t, installed: Boolean(rec), installedVersion: rec?.version ?? '', updatable: Boolean(rec) && rec.source === t.source && compareVersions(t.version, rec.version) > 0 };
  });
}

/**
 * @param {{ getInstalled: () => object, install: (theme: object) => Promise<unknown>, list: (source: string) => Promise<{themes: object[], errors: string[]}>,
 *   isActive?: () => boolean, onDone?: (r: {updated: string[], errors: string[]}) => void, intervalMs?: number, now?: () => number,
 *   setTimer?: typeof setInterval, clearTimer?: typeof clearInterval }} o
 */
export function createUpdater({ getInstalled, install, list, isActive = () => true, onDone = () => {}, intervalMs = SIX_HOURS, now = Date.now, setTimer = setInterval, clearTimer = clearInterval }) {
  const cache = new Map();                                       // source -> { at, result }
  let last = 0;
  let timer = null;

  async function listCached(source) {
    const hit = cache.get(source);
    if (hit && now() - hit.at < CACHE_MS) return hit.result;
    const result = await list(source);
    cache.set(source, { at: now(), result });
    return result;
  }

  /** Installs the newer version of every installed theme (or of `name` only). Lists are read fresh. */
  async function check(name) {
    cache.clear();
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
    forget: () => cache.clear(),
    lastCheck: () => last,
    start() { if (timer) return; timer = setTimer(tick, intervalMs); timer?.unref?.(); tick(); },
    stop() { if (timer) clearTimer(timer); timer = null; },
  };
}
