// The gadget screen (480x272) drawn from the hub state. A port of devices/artillery-x3-esp32/firmware/display_hmi.cpp,
// layout.cpp, ui_state.cpp and ui_theme.h: same geometry, palette, pictures and wording, so the page looks like the screen.
// Drawing goes through a small `screen` object (pic, erase, fill, rect, circle, line, text, measure): the page gives it a
// canvas (canvas_screen.js), the tests give it a recorder. Nothing here touches the DOM.
import { formatAge, formatTokens, fmtDuration, modelLabel } from './format.js';

export const SCR_W = 480;
export const SCR_H = 272;

// Palette of ui_theme.h (RGB565).
export const COLOR = {
  SCREEN: 0x0882, BAR: 0x10C4, FRAME: 0x2188, PANEL: 0x10C4, ROW: 0x1906, TEXT: 0xE77E, LIGHT: 0xCE9B, FAINT: 0x6BB0,
  WORKING: 0x5EED, NEEDS: 0xF447, ERROR: 0xFA89, YOURTURN: 0x8D17, WAITING: 0x5D3F, ACCENT: 0xA39E, CHIP: 0x3A2B,
  ACCENT_DIM: 0x2A4F, NEEDS_DIM: 0x7A22,
};
export const rgb565 = (v) => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31].map(Math.floor);

// Picture ids of agent-gadget.tft.
const PIC = { BACKGROUND: 16, ROW: 17, ROW_COMPACT: 18, SPRITE_BIG: 27, SPRITE_SMALL: 35, SPRITE_TINY: 43, BLINK: 36 };
const S12 = 12, S16 = 16, S20 = 20;                               // font ids: secondary lines, names and titles
const LINE_H = { 12: 14, 16: 18, 20: 22 };
const TEAM_ROWS = 7;
const STALE_S = 15 * 60;                                // quotas not refreshed for 15 minutes show faint
const PULSE_STEPS = 12;

const STATE_COLOR = { needs_you: COLOR.NEEDS, error: COLOR.ERROR, your_turn: COLOR.YOURTURN, working: COLOR.WORKING, waiting_subs: COLOR.WAITING, done: COLOR.FAINT };
export const STATE_LABEL = { needs_you: 'needs you', error: 'error', your_turn: 'your turn', working: 'working', waiting_subs: 'waiting', done: 'done' };
const stateColor = (s) => STATE_COLOR[s] ?? COLOR.FAINT;

/** Role (agent_type) to sprite index; unknown roles get the generic look. */
export function roleIndex(role) {
  const r = String(role).toLowerCase();
  if (r === 'lead') return 0;
  if (r.startsWith('general')) return 1;
  if (r.includes('explor')) return 2;
  if (r.includes('plan')) return 3;
  if (r.includes('review')) return 4;
  if (r.includes('test')) return 5;
  if (r.includes('code') || r.includes('dev')) return 6;
  return 7;
}

// ---------- text helpers (displayFit and wrapPx of the firmware) ----------
/** Cut with "~" when `s` is wider than `width`. `m(text)` measures a string in pixels. */
export function fitText(s, width, m) {
  s = String(s);
  if (m(s) <= width) return s;
  const tilde = m('~');
  let px = 0, out = '';
  for (const ch of s) {
    const w = m(ch);
    if (px + w + tilde > width) break;
    out += ch;
    px += w;
  }
  return out ? `${out}~` : '';
}

/** Word wrap into at most `maxLines` lines; the last line is cut with "~" when text remains. */
export function wrapText(s, width, maxLines, m) {
  const out = [];
  let rest = String(s).trim();
  while (rest && out.length < maxLines) {
    if (out.length === maxLines - 1 || m(rest) <= width) { out.push(fitText(rest, width, m)); break; }
    let cut = -1;
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] !== ' ') continue;
      if (m(rest.slice(0, i)) > width) break;
      cut = i;
    }
    if (cut < 0) { out.push(fitText(rest, width, m)); break; }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut + 1).trim();
  }
  return out;
}

// ---------- state helpers ----------
/** Rows of the team panel: [slots (1-based), more]. Past 7 sub-agents: 6 rows and "+N more"; done agents drop first,
 * then the least recently seen (the longest in its state: `age`). */
export function teamOrder(subs) {
  const n = subs.length;
  if (n <= TEAM_ROWS) return { order: subs.map((_, i) => i + 1), more: 0 };
  const keep = new Set(subs.map((_, i) => i + 1));
  while (keep.size > TEAM_ROWS - 1) {
    let victim = -1;
    for (let pass = 0; pass < 2 && victim < 0; pass++) {
      for (let i = 1; i <= n; i++) {
        if (!keep.has(i)) continue;
        if (pass === 0 && subs[i - 1].state !== 'done') continue;
        if (victim < 0 || subs[i - 1].age > subs[victim - 1].age) victim = i;
      }
    }
    keep.delete(victim);
  }
  return { order: [...keep].sort((a, b) => a - b), more: n - keep.size };
}

/** Pace level of a quota window from its projection: < 85 ok, 85..100 tight, > 100 over. */
export function paceLevel({ pct, proj }) {
  if (pct >= 100) return 'over';
  if (proj === undefined || proj === null || proj < 0) return 'unknown';
  if (proj > 100) return 'over';
  return proj >= 85 ? 'tight' : 'ok';
}
const PACE_COLOR = { ok: COLOR.WORKING, tight: COLOR.NEEDS, over: COLOR.ERROR, unknown: COLOR.FAINT };

function lerp565(a, b, t, n) {
  const ch = (v, sh, mask) => (v >> sh) & mask;
  const mix = (sh, mask) => ch(a, sh, mask) + Math.trunc(((ch(b, sh, mask) - ch(a, sh, mask)) * t) / n);
  return (mix(11, 31) << 11) | (mix(5, 63) << 5) | mix(0, 31);
}

const planParallel = (p) => Boolean(p.state) && p.total <= 16 && p.state.length === p.total;
const planRunning = (p, i) => (planParallel(p) ? p.state[i] === 'r' : i === p.done && Boolean(p.cur));

// ---------- geometry (layout.cpp) ----------
const leadRect = (nSubs) => (nSubs === 0 ? { x: 12, y: 36, w: 460, h: 204 } : { x: 12, y: 36, w: 150, h: 204 });
const menuRow = (i) => ({ x: 12, y: 38 + i * 40, w: 460, h: 36 });
const MUTE = { x: 370, y: 250, w: 42, h: 22 };
const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function layoutRows(nSubs) {
  if (nSubs <= 0) return [];
  if (nSubs <= 4) return Array.from({ length: nSubs }, (_, i) => ({ x: 176, y: 58 + i * 45, w: 290, h: 42 }));
  return Array.from({ length: Math.min(nSubs, 7) }, (_, i) => ({ x: 176, y: 58 + i * 24, w: 290, h: 22 }));
}

/** Segments of the plan bar inside the lead panel `p`. Past 16 steps the bar is continuous (seg = w / total). */
export function planBar(p, total) {
  const x = p.x + 6, w = p.w - 12, y = p.y + 130;
  const seg = total <= 16 ? Math.trunc((w - 2 * (total - 1)) / total) : w / total;
  return { x, y, w, h: 6, seg, step: total <= 16 ? seg + 2 : seg };
}

/**
 * Tap at (x, y) in screen pixels. ctx: {sessions, selected, menu, asking?}.
 * @returns {{kind: 'planStep'|'tab'|'mute'|'lead'|'row'|'menuRow'|'trashRow'|'more'|'none', index?: number}}
 */
export function hitTest(x, y, ctx) {
  if (y < 34) return inside({ x: 6, y: 0, w: 468, h: 34 }, x, y) ? { kind: 'tab' } : { kind: 'none' };
  if (inside({ x: MUTE.x, y: 242, w: MUTE.w, h: 30 }, x, y)) return { kind: 'mute' };
  if (ctx.menu) {
    for (let i = 0; i < ctx.sessions.length; i++) {
      const r = menuRow(i);
      if (inside(r, x, y)) return x >= r.x + r.w - 44 ? { kind: 'trashRow', index: i } : { kind: 'menuRow', index: i };    // the trash icon is at the right end
    }
    return { kind: 'none' };
  }
  const s = ctx.sessions[ctx.selected];
  const nSubs = s && !s.ask ? s.agents.length - 1 : 0;
  if (s && !s.ask && s.plan) {                          // a step of the plan bar (a taller target than the bar itself)
    const b = planBar(leadRect(nSubs), s.plan.total);
    if (x >= b.x && x < b.x + b.w && y >= b.y - 8 && y < b.y + b.h + 8) return { kind: 'planStep', index: Math.min(s.plan.total - 1, Math.floor((x - b.x) / b.step)) };
  }
  if (inside(leadRect(nSubs), x, y)) return { kind: 'lead' };
  const rows = layoutRows(nSubs);
  for (let i = 0; i < rows.length; i++) {
    if (inside(rows[i], x, y)) return nSubs >= 8 && i === 6 ? { kind: 'more' } : { kind: 'row', index: i };
  }
  return { kind: 'none' };
}

// ---------- the scene ----------
/**
 * @param screen drawing surface (see top of file)
 * @param state  GET /state body of the hub
 * @param ui     {bare?: true (no title bar, no status bar: a tile of the hub page), elapsedS, menu, planStep: {session, index}|null, detail: {session, agent}|null, sound: 'all'|'ask'|'off', tick, pulse, timeText, eventsTo}
 *               elapsedS: seconds since `state` arrived (ages and countdowns run on); tick: 300 ms animation tick; pulse: 100 ms phase
 */
export function renderScreen(screen, state, ui) {
  const sessions = state.sessions ?? [];
  const m = (font) => (t) => screen.measure(t, font);
  const fit = (s, w, font) => fitText(s, w, m(font));
  const line = (x, y, w, font, fg, bg, s, align = 0) => screen.text(x, y, w, font, fg, bg, fit(s, w, font), align);
  const ageOf = (a) => formatAge(a.age + ui.elapsedS);

  drawMain();
  drawBottom();

  // ----- main view -----
  function drawMain() {
    screen.pic(PIC.BACKGROUND, 0, 0);
    if (!sessions.length) { drawEmpty(); return; }
    const sel = Math.max(0, sessions.findIndex((s) => s.id === state.view?.session));
    const s = sessions[sel];
    const subs = s.agents.slice(1);
    const asking = Boolean(s.ask);
    const panelSubs = asking || ui.menu ? 0 : subs.length;
    const detailSlot = asking || ui.menu || !ui.detail || ui.detail.session !== s.id ? 0 : subs.findIndex((a) => a.id === ui.detail.agent) + 1;
    if (!ui.bare) drawTopBar(sessions, sel);
    drawLeadPanel(s, subs, panelSubs, detailSlot, sessions, sel);
    if (panelSubs > 0) drawTeam(s, subs, detailSlot);
  }

  function drawEmpty() {
    screen.fill(6, 2, 468, 28, COLOR.FRAME);
    screen.text(14, 5, 440, S20, COLOR.FAINT, COLOR.FRAME, 'NO SESSION');
    const p = leadRect(0);
    screen.erase(p.x, p.y, p.w, p.h);
    screen.fill(156, 36, 20, 204, COLOR.PANEL);
    line(p.x + 6, p.y + 8, p.w - 12, S20, COLOR.TEXT, COLOR.PANEL, 'No agents yet');
    line(p.x + 6, p.y + 40, p.w - 12, S16, COLOR.LIGHT, COLOR.PANEL, 'Events go to');
    line(p.x + 6, p.y + 58, p.w - 12, S16, COLOR.TEXT, COLOR.PANEL, ui.eventsTo ?? '(unknown)');
  }

  // State dot, name, agent count; the name takes what the count leaves.
  function sessionText(s, x, y, w, h, font, fg, bg, chipBg) {
    screen.circle(x + 5, y + h / 2, 4, stateColor(s.dot));
    const count = String(s.agents.length);
    const cw = screen.measure(count, S16) + 8;
    const tw = w - 13 - cw - 4;
    screen.text(x + 13, y + (h - LINE_H[font]) / 2, tw, font, fg, bg, fit(s.title || s.project, tw, font));
    if (chipBg !== bg) screen.fill(x + w - cw, y + h / 2 - 8, cw, 16, chipBg);
    screen.text(x + w - cw, y + h / 2 - 9, cw, S16, COLOR.TEXT, chipBg, count, 1);
  }

  function drawTopBar(all, sel) {
    const ns = all.length;
    const dotsW = ns > 1 ? ns * 18 : 0, caretW = ns > 1 ? 24 : 0;
    screen.fill(6, 2, 468, 28, COLOR.FRAME);
    sessionText(all[sel], 10, 4, 460 - dotsW - caretW, 24, S20, COLOR.TEXT, COLOR.FRAME, COLOR.CHIP);
    if (ns > 1) {
      const x0 = 6 + 468 - caretW - dotsW;
      all.forEach((s, t) => {
        const cx = x0 + 9 + t * 18;
        if (t === sel) screen.circle(cx, 16, 7, COLOR.LIGHT);
        screen.circle(cx, 16, t === sel ? 5 : 4, stateColor(s.dot));
      });
      const cx = 6 + 468 - 18, cy = 13;                     // caret v: a tap opens the session list
      screen.fill(cx, cy, 10, 2, COLOR.LIGHT);
      screen.fill(cx + 2, cy + 2, 6, 2, COLOR.LIGHT);
      screen.fill(cx + 4, cy + 4, 2, 2, COLOR.LIGHT);
    }
  }

  // A working robot closes its eyes for one 300 ms tick in fifteen (robots staggered by `seed`).
  function sprite(x, y, base, state_, seed) {
    const closed = state_ === 'working' && (ui.tick + seed * 4) % 15 === 0;
    screen.pic(base + (closed ? PIC.BLINK : 0), x, y);
  }

  function drawLeadPanel(s, subs, panelSubs, detailSlot, all, sel) {
    const p = leadRect(panelSubs);
    if (panelSubs === 0) { screen.erase(p.x, p.y, p.w, p.h); screen.fill(156, 36, 20, 204, COLOR.PANEL); } else screen.erase(12, 36, 158, 204);
    if (ui.menu) { drawMenu(all, sel); return; }
    if (detailSlot) { drawDetail(subs[detailSlot - 1], p); return; }
    const lead = s.agents[0];
    const x = p.x + 6, w = p.w - 12;
    sprite(x, p.y + 6, PIC.SPRITE_BIG, lead.state, 0);
    const tx = x + 42, tw = p.x + p.w - 4 - tx;
    const wide = p.w > 200, ringW = wide ? 160 : 0;          // wide panel: the ring sits at the right end of the header
    line(tx, p.y + 4, tw - ringW, S20, COLOR.TEXT, COLOR.PANEL, s.project);
    line(tx, p.y + 26, tw - ringW, S16, stateColor(lead.state), COLOR.PANEL, `${STATE_LABEL[lead.state]} ${ageOf(lead)}`);
    drawCtxRing(p, wide, tx, tw, s.ctx_pct, s.ctx_k, lead.model);
    if (s.ask) { drawQuestion(s.ask, x, p.y + 68, w, p); return; }
    wrapText(lead.cmd, w, 2, m(S16)).forEach((l, i) => screen.text(x, p.y + 68 + i * 18, w, S16, COLOR.LIGHT, COLOR.PANEL, l));
    const y = p.y + 110;
    if (s.plan) drawPlan(s.plan, x, y, w, p, s.id);
    else if (lead.prev) {
      screen.text(x, y, w, S16, COLOR.ACCENT, COLOR.PANEL, 'BEFORE');
      wrapText(lead.prev, w, 2, m(S16)).forEach((l, i) => screen.text(x, y + 20 + i * 18, w, S16, COLOR.LIGHT, COLOR.PANEL, l));
    }
  }

  // Context fill as a ring with the percentage in the middle. Wide panel: big ring at the right end of the header, model and size to its left.
  // Narrow panel (team beside it): model under the state line, small ring at its right end.
  function drawCtxRing(p, wide, tx, tw, pct, ctxK, model) {
    const known = pct !== null && pct !== undefined;
    const col = !known ? COLOR.FAINT : pct >= 80 ? COLOR.ERROR : pct >= 60 ? COLOR.NEEDS : COLOR.WORKING;
    const label = model ? modelLabel(model) : '';
    if (wide) {
      const r = 17, cx = p.x + p.w - 8 - r - 3, cy = p.y + 26;
      screen.ring(cx, cy, r, 5, known ? Math.min(pct, 100) / 100 : 0, col, COLOR.CHIP);
      if (known) screen.text(cx - 16, cy - 9, 32, S16, col, COLOR.PANEL, String(pct), 1);
      const rx = cx - r - 12, w = 140;
      if (label) screen.text(rx - w, p.y + 8, w, S16, COLOR.LIGHT, COLOR.PANEL, fit(label, w, S16), 2);
      if (ctxK > 0) screen.text(rx - w, p.y + 28, w, S16, COLOR.FAINT, COLOR.PANEL, `${ctxK}k ctx`, 2);
      return;
    }
    const cx = p.x + p.w - 6 - 12, cy = p.y + 54;
    screen.ring(cx, cy, 9.5, 3.5, known ? Math.min(pct, 100) / 100 : 0, col, COLOR.CHIP);
    if (known) screen.text(cx - 14, cy - 7, 28, S12, col, COLOR.PANEL, String(pct), 1);
    if (label) line(tx, p.y + 46, tw - 28, S16, COLOR.LIGHT, COLOR.PANEL, label);
  }

  function drawPlan(plan, x, y, w, p, sid) {
    line(x, y, w, S16, COLOR.ACCENT, COLOR.PANEL, `PLAN ${plan.done}/${plan.total}`);
    const b = planBar(p, plan.total), by = b.y;
    const pick = ui.planStep && ui.planStep.session === sid ? ui.planStep.index : -1;
    if (plan.total <= 16) {
      const ph = ui.pulse % (2 * PULSE_STEPS);
      const level = ph < PULSE_STEPS ? ph : 2 * PULSE_STEPS - ph;
      for (let i = 0; i < plan.total; i++) {
        let c;
        if (planParallel(plan)) c = plan.state[i] === 'd' ? COLOR.WORKING : plan.state[i] === 'r' ? lerp565(COLOR.ACCENT_DIM, COLOR.ACCENT, level, PULSE_STEPS) : COLOR.CHIP;
        else c = i < plan.done ? COLOR.WORKING : planRunning(plan, i) ? lerp565(COLOR.ACCENT_DIM, COLOR.ACCENT, level, PULSE_STEPS) : COLOR.CHIP;
        screen.fill(x + i * b.step, by, b.seg, 6, c);
      }
      if (pick >= 0) screen.rect(x + pick * b.step - 1, by - 2, b.seg + 2, 10, COLOR.TEXT);
    } else {
      screen.fill(x, by, w, 6, COLOR.CHIP);
      const done = Math.trunc((w * plan.done) / plan.total);
      if (done > 0) screen.fill(x, by, done, 6, COLOR.WORKING);
      if (pick >= 0) screen.rect(x + pick * b.step - 1, by - 2, Math.max(4, b.step) + 2, 10, COLOR.TEXT);
    }
    const item = pick >= 0 ? plan.items?.[pick] : null;
    if (item) {                                         // preview of the tapped step instead of the current one
      const col = item.state === 'd' ? COLOR.WORKING : item.state === 'r' ? COLOR.ACCENT : COLOR.LIGHT;
      const label = item.state === 'd' ? 'done' : item.state === 'r' ? 'in progress' : 'to do';
      screen.text(x, by + 10, w, S16, col, COLOR.PANEL, `STEP ${pick + 1} - ${label}`);
      wrapText(item.title, w, 2, m(S16)).forEach((l, i) => screen.text(x, by + 28 + i * 18, w, S16, COLOR.TEXT, COLOR.PANEL, l));
      return;
    }
    if (pick >= 0) {                                    // the hub sent no step titles (old hub, or no event since the plan changed)
      screen.text(x, by + 10, w, S16, COLOR.LIGHT, COLOR.PANEL, `STEP ${pick + 1} of ${plan.total}`);
      screen.text(x, by + 28, w, S16, COLOR.FAINT, COLOR.PANEL, 'titles arrive with the next event');
      return;
    }
    const cur = plan.cur || (plan.done === plan.total ? 'Plan done' : '');
    wrapText(cur, w, 2, m(S20)).forEach((l, i) => screen.text(x, by + 10 + i * 22, w, S20, COLOR.TEXT, COLOR.PANEL, l));
    if (plan.next) line(x, p.y + p.h - 20, w, S16, COLOR.FAINT, COLOR.PANEL, `next: ${plan.next}`);
  }

  // Question of the lead (full width): bold 20 in orange (2 lines with 4 options, else 3), then one numbered option per line.
  function drawQuestion(ask, x, y, w, p) {
    const opts = String(ask.options).split('|').map((o) => o.trim()).filter(Boolean);
    const q = wrapText(ask.question, w, opts.length > 3 ? 2 : 3, m(S20));
    q.forEach((l, i) => screen.text(x, y + i * 22, w, S20, COLOR.NEEDS, COLOR.PANEL, l));
    const oy = y + q.length * 22 + 6;
    const maxOpt = Math.trunc((p.y + p.h - 4 - oy) / 18);
    opts.slice(0, maxOpt).forEach((o, i) => line(x, oy + i * 18, w, S16, COLOR.LIGHT, COLOR.PANEL, `${i + 1}. ${o}`));
  }

  // Detail of a tapped sub-agent: role, state, tokens, command (cmd + detail), previous command, hint.
  function drawDetail(a, p) {
    const x = p.x + 6, w = p.w - 12;
    sprite(x, p.y + 6, PIC.SPRITE_BIG + roleIndex(a.role), a.state, 0);
    const tx = x + 42, tw = p.x + p.w - 4 - tx;
    line(tx, p.y + 4, tw, S20, COLOR.TEXT, COLOR.PANEL, a.role);
    line(tx, p.y + 26, tw, S16, stateColor(a.state), COLOR.PANEL, `${STATE_LABEL[a.state]} ${ageOf(a)}`);
    const info = [a.model ? modelLabel(a.model) : '', a.tok ? `${formatTokens(a.tok)} tokens` : ''].filter(Boolean).join(' - ');
    if (info) line(tx, p.y + 44, tw, S16, COLOR.LIGHT, COLOR.PANEL, info);
    screen.text(x, p.y + 66, w, S16, COLOR.ACCENT, COLOR.PANEL, 'COMMAND');
    const full = a.detail && !a.cmd.includes(a.detail) ? `${a.cmd} ${a.detail}` : a.cmd;
    wrapText(full, w, 3, m(S16)).forEach((l, i) => screen.text(x, p.y + 84 + i * 18, w, S16, a.state === 'needs_you' ? COLOR.NEEDS : COLOR.TEXT, COLOR.PANEL, l));
    if (a.prev) {
      screen.text(x, p.y + 142, w, S16, COLOR.ACCENT, COLOR.PANEL, 'BEFORE');
      line(x, p.y + 160, w, S16, COLOR.LIGHT, COLOR.PANEL, `${a.prev} (${formatAge(a.prev_age + ui.elapsedS)} ago)`);
    }
    screen.text(x, p.y + p.h - 22, w, S16, COLOR.FAINT, COLOR.PANEL, 'tap here to go back');
  }

  // Session menu: one 36 px row per session; the selected one is framed.
  function drawMenu(all, sel) {
    all.forEach((s, t) => {
      const r = menuRow(t);
      const bg = t === sel ? COLOR.FRAME : COLOR.ROW;
      screen.fill(r.x, r.y, r.w, r.h, bg);
      if (t === sel) screen.rect(r.x, r.y, r.w, r.h, COLOR.LIGHT);
      sessionText(s, r.x + 8, r.y + 4, r.w - 16 - 36, r.h - 8, S20, COLOR.TEXT, bg, COLOR.CHIP);
      trash(r.x + r.w - 30, r.y + 9);
    });
  }

  // Trash can (hides a session): lid, handle, body and two slots, in a 14x17 box at (x, y).
  function trash(x, y) {
    const c = COLOR.LIGHT;
    screen.line(x, y + 3, x + 14, y + 3, c);
    screen.line(x + 4, y, x + 10, y, c);
    screen.line(x + 4, y, x + 4, y + 3, c);
    screen.line(x + 10, y, x + 10, y + 3, c);
    screen.line(x + 2, y + 6, x + 3, y + 17, c);
    screen.line(x + 12, y + 6, x + 11, y + 17, c);
    screen.line(x + 3, y + 17, x + 11, y + 17, c);
    screen.line(x + 5.5, y + 8, x + 5.5, y + 15, c);
    screen.line(x + 8.5, y + 8, x + 8.5, y + 15, c);
  }

  // ----- team panel -----
  function drawTeam(s, subs, detailSlot) {
    const { order, more } = teamOrder(subs);
    const rows = layoutRows(subs.length);
    const compact = subs.length > 4;
    screen.erase(170, 36, 302, 204);
    if (more > 0 && rows.length === TEAM_ROWS) {
      const r = rows[TEAM_ROWS - 1];
      screen.pic(PIC.ROW_COMPACT, r.x, r.y);
      screen.text(r.x + 30, r.y + 2, r.w - 34, S16, COLOR.FAINT, COLOR.ROW, `+${more} more`);
    }
    const working = subs.filter((a) => a.state === 'working').length;
    line(176, 38, 290, S16, COLOR.FAINT, COLOR.PANEL, `TEAM - ${subs.length} ${subs.length === 1 ? 'SUB-AGENT' : 'SUB-AGENTS'} - ${working} WORKING`);
    order.forEach((slot, i) => drawRow(subs[slot - 1], rows[i], compact, i + 1));
    const want = order.indexOf(detailSlot);
    if (detailSlot && want >= 0) screen.rect(rows[want].x - 1, rows[want].y - 1, rows[want].w + 2, rows[want].h + 2, COLOR.LIGHT);
  }

  function drawRow(a, r, compact, seed) {
    const done = a.state === 'done';
    screen.pic(compact ? PIC.ROW_COMPACT : PIC.ROW, r.x, r.y);
    const pulseDim = a.state === 'needs_you' && Math.trunc(ui.tick / 4) % 2 === 1;
    screen.fill(r.x + 2, r.y + 3, 3, r.h - 6, pulseDim ? COLOR.NEEDS_DIM : stateColor(a.state));
    const nameCol = done ? COLOR.FAINT : COLOR.TEXT;
    const actCol = done ? COLOR.FAINT : a.state === 'needs_you' ? COLOR.NEEDS : COLOR.LIGHT;
    const ageW = 48;
    const tokW = a.tok ? 46 : 0, tokText = a.tok ? formatTokens(a.tok) : '';
    if (compact) {
      sprite(r.x + 9, r.y + 2, PIC.SPRITE_TINY + roleIndex(a.role), a.state, seed);
      line(r.x + 30, r.y + 2, 104, S16, nameCol, COLOR.ROW, a.role);
      line(r.x + 138, r.y + 2, r.w - 142 - ageW - tokW, S16, actCol, COLOR.ROW, a.cmd);
      if (tokW) line(r.x + r.w - ageW - tokW, r.y + 2, tokW - 4, S16, COLOR.FAINT, COLOR.ROW, tokText, 2);
    } else {
      sprite(r.x + 9, r.y + 7, PIC.SPRITE_SMALL + roleIndex(a.role), a.state, seed);
      const tx = r.x + 40, tw = r.w - 44;
      line(tx, r.y + 1, tw - ageW, S20, nameCol, COLOR.ROW, a.role);
      const used = screen.measure(a.role, S20) + 8;           // the model follows the role name when there is room
      if (a.model && used + 50 < tw - ageW) line(tx + used, r.y + 6, tw - ageW - used, S12, COLOR.FAINT, COLOR.ROW, modelLabel(a.model));
      line(tx, r.y + 22, tw - tokW, S16, actCol, COLOR.ROW, a.cmd);
      if (tokW) line(tx + tw - tokW, r.y + 22, tokW, S16, COLOR.FAINT, COLOR.ROW, tokText, 2);
    }
    line(r.x + r.w - 4 - 44, r.y + (compact ? 2 : 3), 44, S16, COLOR.FAINT, COLOR.ROW, ageOf(a), 2);
  }

  // ----- bottom bar: quotas, sound button, clock -----
  function drawBottom() {
    if (ui.bare) return;                                // a grid tile: no status bar, the hub page shows the quotas once
    screen.erase(0, 250, SCR_W, 22);
    const u = state.usage;
    const stale = !u || u.age_s + ui.elapsedS > STALE_S;
    if (u) {
      if (u.h5_pct !== undefined) quota(6, 176, 252, '5h', 'h5', u, stale);
      if (u.d7_pct !== undefined) quota(180, MUTE.x - 4, 252, 'Week', 'd7', u, stale);
    }
    soundIcon(ui.sound);
    if (ui.timeText) screen.text(416, 250, 60, S20, COLOR.TEXT, COLOR.BAR, ui.timeText, 2);       // the small clock of the bottom bar
  }

  function quota(x, slotEnd, y, label, key, u, stale) {
    const pct = u[`${key}_pct`], proj = u[`${key}_proj`];
    const level = paceLevel({ pct, proj });
    const col = stale ? COLOR.FAINT : PACE_COLOR[level];
    const lw = screen.measure(label, S16) + 4;
    screen.text(x, y, lw, S16, COLOR.LIGHT, COLOR.BAR, label);
    x += lw;
    screen.fill(x, y + 7, 36, 6, COLOR.CHIP);
    const filled = Math.trunc((36 * Math.min(pct, 100)) / 100);
    if (filled > 0) screen.fill(x, y + 7, filled, 6, col);
    x += 40;
    const emptyS = u[`${key}_empty_s`];
    let t = `${pct}%`;
    if (level === 'over' && emptyS > 0 && pct < 100) t += ` empty ${fmtDuration(Math.max(0, emptyS - ui.elapsedS))}`;
    else t += ` reset ${fmtDuration(Math.max(0, u[`${key}_reset_s`] - ui.elapsedS))}`;
    screen.text(x, y, slotEnd - x, S16, stale ? COLOR.FAINT : COLOR.TEXT, COLOR.BAR, fit(t, slotEnd - x, S16));
  }

  // Speaker icon on a chip: all = light, 2 waves; ask only = orange, 1 wave; off = faint with a red cross.
  function soundIcon(mode) {
    const ic = mode === 'all' ? COLOR.TEXT : mode === 'ask' ? COLOR.NEEDS : COLOR.FAINT;
    screen.fill(MUTE.x, MUTE.y + 1, MUTE.w, MUTE.h - 2, COLOR.CHIP);
    const x = MUTE.x + 8, y = MUTE.y + 3;
    screen.fill(x, y + 5, 4, 6, ic);
    screen.fill(x + 4, y + 3, 2, 10, ic);
    screen.fill(x + 6, y + 1, 2, 14, ic);
    if (mode === 'off') {
      screen.line(x + 11, y + 3, x + 21, y + 13, COLOR.ERROR);
      screen.line(x + 11, y + 13, x + 21, y + 3, COLOR.ERROR);
      return;
    }
    screen.fill(x + 11, y + 5, 2, 6, ic);
    if (mode === 'all') screen.fill(x + 15, y + 2, 2, 12, ic);
  }
}
