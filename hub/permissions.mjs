// Pending permission requests: a Claude Code PermissionRequest hook posts one and waits; the page answers Allow or Deny.
// A request ends with 'allow', 'deny' or 'none' (delay, closed connection, cleared by the session moving on, replaced).
// 'none' makes the hook print nothing, so the terminal prompt decides.
import { createPending } from './pending.mjs';

export const DEFAULT_WAIT_S = 30;
export const MAX_WAIT_S = 120;

export function createPermissions(opts = {}) {
  const store = createPending({ ...opts, defaultWaitS: DEFAULT_WAIT_S, maxWaitS: MAX_WAIT_S, none: 'none' });

  const open = ({ session, agent, tool, cmd = '', detail = '', wait_s: waitS }) => store.open(session, agent, { tool, cmd, detail }, waitS);

  /** The page's Allow or Deny; false for another decision or an unknown id (already answered, expired). */
  function answer(id, decision) {
    if (decision !== 'allow' && decision !== 'deny') return false;
    return store.settle(id, decision);
  }

  /** The newest pending request of a session, as the page shows it. */
  function view(session) {
    const last = store.newest(session);
    return last && { id: last.id, tool: last.tool, cmd: last.cmd, detail: last.detail, until: last.until };
  }

  return { open, answer, release: store.release, clear: store.clear, clearAll: store.clearAll, view, onChange: store.onChange };
}
