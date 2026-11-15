// A store of pending requests that a hook waits on: the permission store and the question store build on it.
// Each entry belongs to one agent of one session and ends with a value: the page's answer, or `none` when nobody answers
// (delay, closed connection, cleared by the session moving on, replaced by a newer entry of the same agent).
import crypto from 'node:crypto';

/**
 * opts: defaultWaitS and maxWaitS bound the wait; none is the value of an entry nobody answered;
 * now, setTimer and clearTimer replace the clock in tests.
 */
export function createPending({ defaultWaitS, maxWaitS, none, now = Date.now, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = clearTimeout }) {
  const clampWait = (v) => (Number.isFinite(v) ? Math.min(maxWaitS, Math.max(1, Math.trunc(v))) : defaultWaitS);
  const pending = new Map();                           // id -> {id, session, agent, ...fields, until, timer, resolve}
  const listeners = [];
  const changed = () => { for (const fn of listeners) { try { fn(); } catch { /* listener errors stay local */ } } };

  /** Ends one entry with `value`; false when the id is unknown (already ended). Reports no change: the caller does. */
  function finish(id, value) {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id);
    clearTimer(p.timer);
    p.resolve(value);
    return true;
  }

  /** A new entry; it replaces the pending entry of the same session and agent, and ends with `none` after the wait. */
  function open(session, agent, fields, waitS) {
    for (const p of [...pending.values()]) if (p.session === session && p.agent === agent) finish(p.id, none);
    const id = crypto.randomUUID();
    const wait = clampWait(waitS);
    const promise = new Promise((resolve) => {
      const timer = setTimer(() => { if (finish(id, none)) changed(); }, wait * 1000);
      pending.set(id, { ...fields, id, session, agent, until: now() + wait * 1000, timer, resolve });
    });
    changed();
    return { id, promise };
  }

  /** Ends one entry with the page's answer; false when the id is unknown. */
  function settle(id, value) {
    if (!finish(id, value)) return false;
    changed();
    return true;
  }

  /** Ends one entry with `none` (nobody answers from the page); false when the id is unknown. */
  const release = (id) => settle(id, none);

  /** Ends the entries of one agent of a session (or every agent when `agent` is left out); true when one ended. */
  function clear(session, agent) {
    let any = false;
    for (const p of [...pending.values()]) if (p.session === session && (agent === undefined || p.agent === agent)) any = finish(p.id, none) || any;
    if (any) changed();
    return any;
  }

  function clearAll() {
    let any = false;
    for (const p of [...pending.values()]) any = finish(p.id, none) || any;
    if (any) changed();
  }

  /** The newest pending entry of a session, or null. */
  function newest(session) {
    let last = null;
    for (const p of pending.values()) if (p.session === session) last = p;
    return last;
  }

  return { open, settle, release, clear, clearAll, get: (id) => pending.get(id), newest, onChange: (fn) => { listeners.push(fn); } };
}
