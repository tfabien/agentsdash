// Logic of the sessions hub page: which sessions get a tile and what each tile says (grid shape and sizes: layout.js). No DOM here, so the
// tests run it directly; hub_page.js turns these models into elements.
import { formatAge, fmtDuration } from './format.js';
import { paceLevel, STATE_LABEL } from './screen.js';

const MAX_DOTS = 5;                          // agent dots in a tile header
const STALE_S = 15 * 60;                     // same rule as the screen: quotas older than 15 minutes show faint

/** A session waiting for the user (your turn, done) for `limitS` seconds or more is idle: its tile is greyed out. */
export function isIdle(s, elapsedS = 0, limitS = 5 * 60) {
  return (s.dot === 'your_turn' || s.dot === 'done') && s.agents[0].age + elapsedS >= limitS;
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


/** The most urgent state of a page that deserves a dot of color in the pager: 'needs_you', 'error' or ''. */
export const pageAlert = (page) => (page.some((s) => s.dot === 'needs_you') ? 'needs_you' : page.some((s) => s.dot === 'error') ? 'error' : '');

const ctxLevel = (pct) => (pct === null || pct === undefined ? 'unknown' : pct >= 80 ? 'bad' : pct >= 60 ? 'warn' : 'ok');

function planModel(plan) {
  if (!plan) return null;
  const parallel = Boolean(plan.state) && plan.total <= 16 && plan.state.length === plan.total;
  let segs = null;
  if (plan.total <= 16) {
    segs = Array.from({ length: plan.total }, (_, i) => (parallel ? plan.state[i] : i < plan.done ? 'd' : i === plan.done && plan.cur ? 'r' : 't'));
  }
  return {
    label: `PLAN ${plan.done}/${plan.total}`, segs, frac: plan.total ? plan.done / plan.total : 0,
    cur: plan.cur || (plan.done === plan.total ? 'Plan done' : ''), next: plan.next || '',
  };
}

/** What one tile shows for a session. `elapsedS`: seconds since the state arrived (ages run on). */
export function tileModel(s, elapsedS) {
  const lead = s.agents[0];
  const stateKey = s.dot;
  const who = s.agents.find((a) => a.state === stateKey) ?? lead;
  const options = s.ask ? String(s.ask.options ?? '').split('|').map((o) => o.trim()).filter(Boolean) : [];
  return {
    id: s.id,
    title: s.title || s.project,
    project: s.project,
    stateKey,
    stateText: `${STATE_LABEL[stateKey] ?? stateKey} ${formatAge(who.age + elapsedS)}`,
    needsYou: stateKey === 'needs_you',
    dots: s.agents.slice(0, MAX_DOTS).map((a) => a.state),
    moreDots: Math.max(0, s.agents.length - MAX_DOTS),
    ctxPct: s.ctx_pct ?? null,
    ctxLevel: ctxLevel(s.ctx_pct),
    cmd: lead.cmd || '',
    ask: s.ask ? { question: s.ask.question, options } : null,
    plan: planModel(s.plan),
  };
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

export function summaryText(sessions) {
  if (!sessions.length) return 'no session';
  const needs = sessions.filter((s) => s.dot === 'needs_you').length;
  const n = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;
  return needs ? `${n}, ${needs} ${needs === 1 ? 'needs' : 'need'} you` : n;
}
