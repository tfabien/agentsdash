// The settings menu, shared by the single page and the hub page: a gear button that opens a panel above it. Every option is kept by the
// hub (POST /settings, state.settings), so all pages and all browsers follow. Adding an option = one entry in OPTIONS.
export const TILES_MIN = 2, TILES_MAX = 12;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function postSettings(patch) {
  return fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
}

/** What the panel offers. `kind`: 'choice' (segmented buttons), 'stepper' (- n +), 'toggle'. `after`: runs once the hub has the new value. */
export const OPTIONS = [
  { key: 'view', label: 'View', kind: 'choice', choices: [['hub', 'Hub'], ['single', 'Single']], hint: 'What the main address opens',
    after: (v, page) => { if (page !== v) location.assign(v === 'hub' ? '/hub' : '/?stay'); } },
  { key: 'max_tiles', label: 'Sessions shown on the hub', kind: 'stepper', min: TILES_MIN, max: TILES_MAX, hint: 'The least urgent fold into one tile' },
  { key: 'sound', label: 'Beeps', kind: 'choice', choices: [['all', 'All'], ['ask', 'Questions'], ['off', 'Off']], hint: 'Shared with the gadget buzzer' },
  { key: 'pulse', label: 'Pulse on events', kind: 'toggle', hint: 'A tile frame lights up when something happens' },
  { key: 'dim_idle', label: 'Grey out idle sessions', kind: 'toggle', hint: 'After 5 minutes waiting for you' },
];

/**
 * @param {{page: 'hub'|'single'}} opts the page that mounts it (choosing the other view navigates there)
 * @returns {{button: HTMLButtonElement, update: (settings: object) => void}}
 */
export function createSettingsMenu({ page }) {
  const button = el('button', 'chip gear', '⚙');
  button.title = 'Settings';
  button.setAttribute('aria-label', 'Settings');
  const panel = el('div', 'settings-panel');
  panel.hidden = true;
  document.body.append(panel);
  let current = {};
  const rows = new Map();                              // key -> function that shows the value

  const set = (opt, value) => {
    current = { ...current, [opt.key]: value };
    show();
    postSettings({ [opt.key]: value }).then(() => opt.after?.(value, page));
  };

  for (const opt of OPTIONS) {
    const row = el('div', 'srow');
    const text = el('div', 'stext');
    text.append(el('div', 'slabel', opt.label), el('div', 'shint', opt.hint));
    const ctl = el('div', 'sctl');
    if (opt.kind === 'choice') {
      const btns = opt.choices.map(([v, label]) => { const b = el('button', 'seg', label); b.onclick = () => set(opt, v); return [v, b]; });
      ctl.append(...btns.map(([, b]) => b));
      rows.set(opt.key, (val) => btns.forEach(([v, b]) => b.classList.toggle('on', v === val)));
    } else if (opt.kind === 'stepper') {
      const minus = el('button', 'seg', '−'), plus = el('button', 'seg', '+'), n = el('span', 'sval');
      minus.onclick = () => set(opt, Math.max(opt.min, (current[opt.key] ?? opt.max) - 1));
      plus.onclick = () => set(opt, Math.min(opt.max, (current[opt.key] ?? opt.max) + 1));
      ctl.append(minus, n, plus);
      rows.set(opt.key, (val) => { n.textContent = String(val); minus.disabled = val <= opt.min; plus.disabled = val >= opt.max; });
    } else {
      const b = el('button', 'switch');
      b.onclick = () => set(opt, !current[opt.key]);
      ctl.append(b);
      rows.set(opt.key, (val) => { b.classList.toggle('on', Boolean(val)); b.setAttribute('aria-pressed', String(Boolean(val))); });
    }
    row.append(text, ctl);
    panel.append(row);
  }

  function show() { for (const opt of OPTIONS) if (current[opt.key] !== undefined) rows.get(opt.key)(current[opt.key]); }

  button.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; };
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== button) panel.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

  return { button, update(settings) { current = { ...settings }; show(); } };
}
