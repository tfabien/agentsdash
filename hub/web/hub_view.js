// Logic of the sessions hub page: which sessions get a tile, in which order, focus and alerts, quota bars (grid shape and sizes: layout.js).
// No DOM here, so the tests run it directly; hub_page.js turns the results into elements.
import { fmtDuration } from './format.js';
import { paceLevel } from './screen.js';

const STALE_S = 15 * 60;                     // same rule as the screen: quotas older than 15 minutes show faint

/** A session waiting for the user (your turn, done): its tile has a trash button. */
export const waitsForYou = (s) => s.dot === 'your_turn' || s.dot === 'done';

/** A session waiting for the user for `limitS` seconds or more is idle: its tile is greyed out. */
export function isIdle(s, elapsedS = 0, limitS = 5 * 60) {
  return waitsForYou(s) && s.agents[0].age + elapsedS >= limitS;
}

/** A session with sub-agents gets a second tile beside its own: the team. */
export const hasTeam = (s) => s.agents.length > 1;
export const cellsOf = (s) => (hasTeam(s) ? 2 : 1);

const URGENCY = ['needs_you', 'error', 'your_turn', 'working', 'waiting_subs', 'done'];   // most urgent first, same order as the model's states
const urgency = (s) => { const i = URGENCY.indexOf(s.dot); return i < 0 ? URGENCY.length : i; };

/** Idle sessions last; before that the most urgent state first (needs you, error, your turn, working, done); ties keep the order of `rank`
 * (session id -> first appearance), so equal sessions do not jump. */
export function orderSessions(sessions, rank, idle) {
  const key = (s) => [idle(s) ? 1 : 0, urgency(s), rank.get(s.id) ?? 0];
  return [...sessions].sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]; });
}


/**
 * Setting focus_on_ask: a session with a question or an Allow/Deny held for the page goes full screen, and the view before it (the grid,
 * or another full-screen session) comes back once that request is answered, expired or gone. `auto`: null, or the auto full screen in
 * progress `{ id, req, from }`. `done`: request ids already shown once (a Back from an auto full screen does not bring it back).
 * A focus the user changed in the meantime wins: the page drops `auto` and restores nothing.
 */
export function autoFocus(sessions, focus, auto, done) {
  const req = (s) => (s.quest ? `q${s.quest.id}` : s.perm ? `p${s.perm.id}` : null);
  if (auto && focus !== auto.id) auto = null;
  if (auto && !sessions.some((s) => s.id === auto.id && req(s) === auto.req)) {
    focus = auto.from && sessions.some((s) => s.id === auto.from) ? auto.from : null;
    auto = null;
  }
  if (!auto) {
    const s = sessions.find((x) => req(x) && !done.has(req(x)));
    if (s) {
      done.add(req(s));
      if (focus !== s.id) auto = { id: s.id, req: req(s), from: focus };
      focus = s.id;
    }
  }
  return { focus, auto };
}

/** Sessions behind a full-screen one that need the user (a question, a permission, an error): needs you first. The orange arrow at the right opens the first. */
export function focusAlerts(sessions, focusId) {
  const rank = (s) => (s.dot === 'needs_you' ? 0 : s.dot === 'error' ? 1 : 2);
  return sessions.filter((s) => s.id !== focusId && rank(s) < 2).sort((a, b) => rank(a) - rank(b));
}

/** The most urgent state of a page that deserves a dot of color in the pager: 'needs_you', 'error' or ''. */
export const pageAlert = (page) => (page.some((s) => s.dot === 'needs_you') ? 'needs_you' : page.some((s) => s.dot === 'error') ? 'error' : '');

/** The most urgent alert on the pages before and after page `page`: the page arrows take its color, so a session that needs you is one tap away. */
export function sideAlerts(pages, page) {
  const worst = (list) => pageAlert(list.flat());
  return { prev: worst(pages.slice(0, Math.max(0, page))), next: worst(pages.slice(page + 1)) };
}

/** Quota bars of the bottom bar (drawn once for the whole page). */
export function quotaBars(usage, elapsedS) {
  if (!usage) return [];
  const stale = usage.age_s + elapsedS > STALE_S;
  const bar = (label, key) => {
    const pct = usage[`${key}_pct`], proj = usage[`${key}_proj`];
    if (pct === undefined) return null;
    const level = paceLevel({ pct, proj });
    const emptyS = usage[`${key}_empty_s`];
    const when = level === 'over' && emptyS > 0 && pct < 100 ? `empty ${fmtDuration(Math.max(0, emptyS - elapsedS))}` : `reset ${fmtDuration(Math.max(0, usage[`${key}_reset_s`] - elapsedS))}`;
    return { label, pct, level, text: `${pct}% ${when}`, stale };
  };
  return [bar('5h', 'h5'), bar('Week', 'd7')].filter(Boolean);
}

/** The grid page after a jump to `n` (arrows, swipe, pager) out of `count` pages. A session shown full screen keeps the grid page: Back returns to it. */
export function gotoPage(n, page, count, fullScreen) {
  return fullScreen ? page : Math.max(0, Math.min(n, count - 1));
}

/** How the bottom bar shows the widget button for the answer of GET /widget (null: not known yet or the hub has no such route). */
export function widgetButtonState(status) {
  if (!status?.supported) return { hidden: true, disabled: true, title: '' };
  return status.built
    ? { hidden: false, disabled: false, title: 'Open the floating widget' }
    : { hidden: false, disabled: true, title: 'Build it once: node hub/widget/build.mjs' };
}
