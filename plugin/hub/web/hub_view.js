// Logic of the sessions hub page: which sessions get a tile, the grid shape, and what each tile says. No DOM here, so the
// tests run it directly; hub_page.js turns these models into elements.
import { formatAge, fmtDuration } from './format.js';
import { paceLevel, STATE_LABEL } from './screen.js';

export const MAX_TILES = 6;                  // past this many sessions the least urgent fold into one placeholder
const MAX_DOTS = 5;                          // agent dots in a tile header
const STALE_S = 15 * 60;                     // same rule as the screen: quotas older than 15 minutes show faint
const URGENCY = { needs_you: 0, error: 1, working: 2, waiting_subs: 3, your_turn: 4, done: 5 };
const urgency = (s) => URGENCY[s.dot] ?? 5;

/** Columns and rows of the grid for `n` tiles (placeholder included): wide screens like 3 columns, 4 tiles make a square. */
export function gridShape(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  const cols = n === 4 ? 2 : n <= 9 ? Math.min(3, n) : Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/** Sessions that get a tile, and how many are folded. Past `max` the most urgent keep a tile (needs you, error, working, ...),
 * shown in the order of the hub so the grid does not jump; one cell is kept for the placeholder. */
export function planTiles(sessions, { max = MAX_TILES, showAll = false } = {}) {
  if (showAll || sessions.length <= max) return { tiles: sessions, hidden: 0 };
  const keep = new Set(sessions.map((s, i) => ({ s, i })).sort((a, b) => urgency(a.s) - urgency(b.s) || a.i - b.i).slice(0, max - 1).map((x) => x.s));
  return { tiles: sessions.filter((s) => keep.has(s)), hidden: sessions.length - keep.size };
}

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
