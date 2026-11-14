// Pending questions: a Claude Code PreToolUse hook on AskUserQuestion posts the questions and waits; the page picks the answers.
// A question ends with a list of picks (one list of option indexes per question) or null (delay, closed connection, the TERMINAL
// button, cleared by the session moving on, replaced). null makes the hook print nothing, so the terminal asks the question itself.
// The hub keeps option indexes only: the hook maps them back to the exact labels and question texts it received.
import crypto from 'node:crypto';

export const DEFAULT_WAIT_S = 60;
export const MAX_WAIT_S = 300;
export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 4;

const clampWait = (v) => (Number.isFinite(v) ? Math.min(MAX_WAIT_S, Math.max(1, Math.trunc(v))) : DEFAULT_WAIT_S);
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);

/** The questions of a POST /question body, cleaned for display; null when there is none or one has fewer than 2 options. */
export function cleanQuestions(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_QUESTIONS) return null;
  const out = [];
  for (const q of list) {
    if (!q || typeof q !== 'object' || !Array.isArray(q.options)) return null;
    const options = q.options.slice(0, MAX_OPTIONS).map((o) => str(o, 200));
    if (options.length < 2) return null;
    out.push({ question: str(q.question, 1000), header: str(q.header, 40), options, multi: q.multi === true });
  }
  return out;
}

/** True when `picks` answers every question: a list per question, of distinct valid indexes, one for a single choice, at least one for a multi choice. */
export function validPicks(questions, picks) {
  if (!Array.isArray(picks) || picks.length !== questions.length) return false;
  return questions.every((q, i) => {
    const p = picks[i];
    if (!Array.isArray(p) || p.length < 1 || (!q.multi && p.length !== 1)) return false;
    if (new Set(p).size !== p.length) return false;
    return p.every((k) => Number.isInteger(k) && k >= 0 && k < q.options.length);
  });
}

export function createQuestions(opts = {}) {
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? clearTimeout;
  const pending = new Map();                           // id -> {id, session, agent, questions, until, timer, resolve}
  const listeners = [];
  const changed = () => { for (const fn of listeners) { try { fn(); } catch { /* listener errors stay local */ } } };

  function finish(id, picks) {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id);
    clearTimer(p.timer);
    p.resolve(picks);
    return true;
  }

  function open({ session, agent, questions, wait_s: waitS }) {
    for (const p of [...pending.values()]) if (p.session === session && p.agent === agent) finish(p.id, null);
    const id = crypto.randomUUID();
    const wait = clampWait(waitS);
    const promise = new Promise((resolve) => {
      const timer = setTimer(() => { if (finish(id, null)) changed(); }, wait * 1000);
      pending.set(id, { id, session, agent, questions, until: now() + wait * 1000, timer, resolve });
    });
    changed();
    return { id, promise };
  }

  /** The page's picks; false when the id is unknown (already answered, expired) or the picks do not fit the questions. */
  function answer(id, picks) {
    const p = pending.get(id);
    if (!p || !validPicks(p.questions, picks)) return false;
    finish(id, picks);
    changed();
    return true;
  }

  /** Nobody answers from the page (TERMINAL button, or the hook went away): the terminal asks. */
  function release(id) {
    if (!finish(id, null)) return false;
    changed();
    return true;
  }

  /** Ends the questions of one agent of a session (or every agent when `agent` is left out). */
  function clear(session, agent) {
    let any = false;
    for (const p of [...pending.values()]) if (p.session === session && (agent === undefined || p.agent === agent)) any = finish(p.id, null) || any;
    if (any) changed();
    return any;
  }

  function clearAll() {
    let any = false;
    for (const p of [...pending.values()]) any = finish(p.id, null) || any;
    if (any) changed();
  }

  /** The newest pending question of a session, as the page shows it. */
  function view(session) {
    let last = null;
    for (const p of pending.values()) if (p.session === session) last = p;
    return last && { id: last.id, until: last.until, questions: last.questions };
  }

  return { open, answer, release, clear, clearAll, view, onChange: (fn) => { listeners.push(fn); } };
}
