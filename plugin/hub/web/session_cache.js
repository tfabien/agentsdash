// Session cache of the pages. A hub restart empties the hub's memory: the pages keep the sessions they knew (in localStorage, so a
// reload also keeps them) and draw them as "stale" until the new hub reports them or the time limit passes.
// The hub tells a restart apart: every state carries `boot` (the start time of that hub).
// - A session missing from a state of the same hub that confirmed it before has ended or was dismissed: it leaves the cache.
// - A session missing from a state of a newer hub is carried as stale, for STALE_MS after the last time a hub confirmed it.

export const STALE_MS = 10 * 60 * 1000;
const KEY = 'standup.sessions';

/**
 * @param storage  localStorage-like ({getItem, setItem}); may be null or throw (private mode): the cache then lives in memory only
 * @param now      () => ms, replaced in tests
 */
export function createSessionCache(storage, now = Date.now) {
  let entries = new Map();                          // id -> {session, seen: ms of the last confirmation, boot: hub that confirmed it}
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (Array.isArray(saved)) entries = new Map(saved.filter((e) => e && e.session?.id).map((e) => [e.session.id, e]));
  } catch { /* no cache */ }

  const save = () => { try { storage?.setItem(KEY, JSON.stringify([...entries.values()])); } catch { /* quota or private mode */ } };

  /** The state to show: the hub's sessions, then the cached ones the hub does not know yet (marked `stale`, ages moved on). */
  function merge(next) {
    const t = now();
    const boot = next.boot ?? null;
    const live = new Set(next.sessions.map((s) => s.id));
    const carried = [];
    for (const [id, e] of [...entries]) {
      if (live.has(id)) continue;
      const lost = e.boot === boot || boot === null;                // confirmed by this very hub before: it ended or was dismissed
      if (lost || t - e.seen > STALE_MS) { entries.delete(id); continue; }
      const gone = Math.floor((t - e.seen) / 1000);
      carried.push({ ...e.session, stale: true, agents: e.session.agents.map((a) => ({ ...a, age: a.age + gone })) });
    }
    for (const s of next.sessions) entries.set(s.id, { session: s, seen: t, boot });
    save();
    return carried.length ? { ...next, sessions: [...next.sessions, ...carried] } : next;
  }

  /** Right after a page load, before any hub state: the cached sessions still inside the time limit, all stale. */
  function restore() {
    const t = now();
    return [...entries.values()].filter((e) => t - e.seen <= STALE_MS).map((e) => {
      const gone = Math.floor((t - e.seen) / 1000);
      return { ...e.session, stale: true, agents: e.session.agents.map((a) => ({ ...a, age: a.age + gone })) };
    });
  }

  /** The user dismissed a session on the page: it does not come back from the cache. */
  function forget(id) {
    if (entries.delete(id)) save();
  }

  return { merge, forget, restore };
}
