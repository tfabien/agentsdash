// Pending questions: a Claude Code PreToolUse hook on AskUserQuestion posts the questions and waits; the page picks the answers.
// A question ends with a list of picks (one list of option indexes per question) or null (delay, closed connection, the TERMINAL
// button, cleared by the session moving on, replaced). null makes the hook print nothing, so the terminal asks the question itself.
// The hub keeps option indexes only: the hook maps them back to the exact labels and question texts it received.
import { createPending } from './pending.mjs';

export const DEFAULT_WAIT_S = 600;
export const MAX_WAIT_S = 600;                  // the terminal or the app shows the question meanwhile: the wait only bounds a stuck hook
export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 4;

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
  const store = createPending({ ...opts, defaultWaitS: DEFAULT_WAIT_S, maxWaitS: MAX_WAIT_S, none: null });

  const open = ({ session, agent, questions, wait_s: waitS }) => store.open(session, agent, { questions }, waitS);

  /** The page's picks; false when the id is unknown (already answered, expired) or the picks do not fit the questions. */
  function answer(id, picks) {
    const p = store.get(id);
    if (!p || !validPicks(p.questions, picks)) return false;
    return store.settle(id, picks);
  }

  /** The newest pending question of a session, as the page shows it. */
  function view(session) {
    const last = store.newest(session);
    return last && { id: last.id, until: last.until, questions: last.questions };
  }

  // release(id): nobody answers from the page (TERMINAL button, or the hook went away), the terminal asks.
  return { open, answer, release: store.release, clear: store.clear, clearAll: store.clearAll, view, onChange: store.onChange };
}
