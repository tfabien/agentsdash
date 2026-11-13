// The settings menu, shared by the single page and the hub page: a gear button that opens a panel above it. Every option is kept by the
// hub (POST /settings, state.settings), so all pages and all browsers follow. Adding an option = one entry in OPTIONS.
import { relayLabel } from './format.js';
import { icon } from './icons.js';
import { validRules } from './rules.js';

export const TILES_MIN = 0, TILES_MAX = 12;          // tiles per page; 0 is Auto (what fits the window)

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function postSettings(patch) {
  return fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
}

/** What the panel offers. `kind`: 'choice' (segmented buttons), 'stepper' (- n +), 'toggle'. `after`: runs once the hub has the new value. */
export const OPTIONS = [
  { key: 'max_tiles', label: 'Tiles per page', kind: 'stepper', min: TILES_MIN, max: TILES_MAX, format: (v) => (v === 0 ? 'Auto' : String(v)),
    hint: 'Auto fits the window; 1 shows one session at a time. More sessions make pages' },
  { key: 'sound', label: 'Beeps', kind: 'choice', choices: [['all', 'All'], ['ask', 'Questions'], ['off', 'Off']], hint: 'Shared with the gadget buzzer' },
  { key: 'pulse', label: 'Pulse on events', kind: 'toggle', hint: 'A tile frame lights up when something happens' },
  { key: 'done_excerpt', label: 'Reply when it is your turn', kind: 'choice', choices: [['first', 'First'], ['last', 'Last'], ['off', 'Off']],
    hint: 'First or last paragraph of the reply, in place of "Done, waiting for you"' },
  { key: 'dim_idle', label: 'Grey out idle sessions', kind: 'toggle', hint: 'After 5 minutes waiting for you' },
];

const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const MODES = [['none', 'None'], ['http', 'Wi-Fi'], ['serial', 'USB']];

/**
 * The "Device" section: relay state, the choice (none, Wi-Fi host, USB port), Apply and Test. The hub validates and swaps the relay
 * while it runs. What the user is typing is a draft: the hub's state (pushed every second) only fills it while nothing is edited.
 * @returns {{node: HTMLElement, update: (relay: object|undefined) => void}}
 */
function createDeviceSection() {
  const node = el('div', 'sdevice');
  const status = el('div', 'dstatus');
  const modes = new Map(MODES.map(([v, label]) => { const b = el('button', 'seg', label); b.onclick = () => { draft.mode = v; dirty = true; if (v === 'serial') loadPorts(); render(); }; return [v, b]; }));
  const host = el('input', 'dinput');
  host.placeholder = '192.168.1.100 or esp32.local';
  host.spellcheck = false;
  host.oninput = () => { draft.host = host.value; dirty = true; };
  const port = el('select', 'dinput');
  port.onchange = () => { draft.port = port.value; dirty = true; };
  const portNote = el('div', 'shint');
  const apply = el('button', 'seg', 'Apply');
  const test = el('button', 'seg', 'Test');
  const result = el('div', 'dresult');
  let draft = { mode: 'none', host: '', port: '' };
  let dirty = false;
  let known = {};
  let ports = null;                                      // {ports, error} once listed

  const modeRow = el('div', 'sctl'), actionRow = el('div', 'sctl');
  modeRow.append(...modes.values());
  actionRow.append(apply, test);
  node.append(el('div', 'slabel', 'Device'), status, modeRow, host, port, portNote, actionRow, result);

  async function loadPorts() {
    try { ports = await (await fetch('/relay/ports')).json(); } catch { ports = { ports: [], error: 'the hub did not answer' }; }
    render();
  }

  function render() {
    for (const [v, b] of modes) b.classList.toggle('on', v === draft.mode);
    host.hidden = draft.mode !== 'http';
    port.hidden = portNote.hidden = draft.mode !== 'serial';
    if (document.activeElement !== host) host.value = draft.host;
    const paths = new Set([...(ports?.ports ?? []).map((p) => p.path), ...(draft.port ? [draft.port] : [])]);
    port.replaceChildren(...[...paths].map((path) => { const o = el('option', '', (ports?.ports ?? []).find((p) => p.path === path)?.label ? `${path} (${ports.ports.find((p) => p.path === path).label})` : path); o.value = path; return o; }));
    if (draft.port) port.value = draft.port; else if (paths.size) draft.port = port.value;
    portNote.textContent = ports?.error ?? (ports && !ports.ports.length ? 'No serial port found' : '');
    apply.disabled = !dirty;
    test.disabled = known.mode === undefined || known.mode === 'none';
    const label = relayLabel(known.mode ? known : undefined);
    status.textContent = label ? `${label.text}${label.why ? ` - ${label.why}` : ''}${known.queued ? ` (${known.queued} queued)` : ''}` : 'No device';
    status.className = `dstatus ${label ? (label.ok ? 'ok' : 'down') : ''}`;
  }

  const say = (text, ok) => { result.textContent = text; result.className = `dresult ${ok ? 'ok' : 'down'}`; };
  apply.onclick = async () => {
    const r = await post('/relay', { mode: draft.mode, host: draft.host, port: draft.port });
    if (!r.ok) { say(await r.text(), false); return; }
    dirty = false;
    say((await r.json()).saved ? 'Applied and saved in agent-gadget.json' : 'Applied (could not save the file, lost at the next hub restart)', true);
    render();
  };
  test.onclick = async () => {
    test.disabled = true;
    say('Testing...', true);
    try { const r = await (await post('/relay/test')).json(); say(r.ok ? `OK, ${r.detail}` : `Failed: ${r.error}`, r.ok); } catch { say('Failed: the hub did not answer', false); }
    render();
  };

  return {
    node,
    update(relay) {
      known = relay ?? { mode: 'none' };
      if (!dirty) { draft = { mode: known.mode ?? 'none', host: known.host ?? '', port: known.port ?? '' }; if (draft.mode === 'serial' && !ports) loadPorts(); }
      render();
    },
  };
}

/**
 * The "Project rules" section: one row per rule (folder pattern, icon pack, badge color). A row is posted once it is valid (pattern not empty,
 * color blank or #rrggbb); the rows being typed stay local. Pushed state only replaces the rows when someone else changed the rules.
 * @returns {{node: HTMLElement, update: (rules: object[]|undefined, packs: object[]|undefined) => void}}
 */
function createRulesSection() {
  const node = el('div', 'srules');
  const list = el('div', 'rlist');
  const add = el('button', 'seg', 'Add rule');
  node.append(el('div', 'slabel', 'Project rules'), el('div', 'shint', 'First match wins. Folder pattern: *, ** and ? (sub-folders match too). Blank pack = theme default'), list, add);
  let draft = [], seen = '[]', packs = [];

  const clean = (r) => ({ match: r.match.trim(), ...(r.iconPack ? { iconPack: r.iconPack } : {}), ...(r.badgeColor ? { badgeColor: r.badgeColor } : {}) });
  const valid = () => draft.filter((r) => r.match.trim() && (!r.badgeColor || /^#[0-9a-f]{6}$/i.test(r.badgeColor))).map(clean);
  const save = () => { const rules = valid(); if (validRules(rules)) postSettings({ rules }); };

  function render() {
    list.replaceChildren(...draft.map((r, i) => {
      const row = el('div', 'rrow');
      const match = el('input', 'dinput'); match.value = r.match; match.placeholder = '**/my-project*'; match.spellcheck = false;
      match.oninput = () => { r.match = match.value; };
      match.onchange = save;
      const pack = el('select', 'dinput');
      const names = ['', ...packs.map((p) => p.name)];
      if (r.iconPack && !names.includes(r.iconPack)) names.push(r.iconPack);
      pack.append(...names.map((n) => { const o = el('option', '', n || 'Theme default'); o.value = n; return o; }));
      pack.value = r.iconPack ?? '';
      pack.onchange = () => { r.iconPack = pack.value || undefined; save(); };
      const color = el('input', 'dinput rcolor'); color.value = r.badgeColor ?? ''; color.placeholder = '#rrggbb'; color.spellcheck = false;
      color.oninput = () => { r.badgeColor = color.value.trim() || undefined; color.classList.toggle('bad', !!r.badgeColor && !/^#[0-9a-f]{6}$/i.test(r.badgeColor)); };
      color.onchange = save;
      const del = el('button', 'seg', '×'); del.title = 'Delete rule'; del.setAttribute('aria-label', 'Delete rule');
      del.onclick = () => { draft.splice(i, 1); render(); save(); };
      row.append(match, pack, color, del);
      return row;
    }));
  }
  add.onclick = () => { draft.push({ match: '' }); render(); };

  return {
    node,
    update(rules, catalogPacks) {
      packs = catalogPacks ?? packs;
      const srv = JSON.stringify(rules ?? []);
      if (srv !== seen && srv !== JSON.stringify(valid())) { draft = (rules ?? []).map((r) => ({ ...r })); render(); }
      seen = srv;
    },
  };
}

/**
 * @returns {{button: HTMLButtonElement, panel: HTMLElement, update: (settings: object, catalog?: object) => void}}
 */
export function createSettingsMenu() {
  const button = el('button', 'chip gear');
  button.append(icon('gear'));
  button.title = 'Settings';
  button.setAttribute('aria-label', 'Settings');
  const panel = el('div', 'vpanel');
  let current = {};
  const rows = new Map();                              // key -> function that shows the value

  const set = (opt, value) => {
    current = { ...current, [opt.key]: value };
    show();
    postSettings({ [opt.key]: value }).then(() => opt.after?.(value));
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
      minus.onclick = () => set(opt, Math.max(opt.min, (current[opt.key] ?? opt.min) - 1));
      plus.onclick = () => set(opt, Math.min(opt.max, (current[opt.key] ?? opt.min) + 1));
      ctl.append(minus, n, plus);
      rows.set(opt.key, (val) => { n.textContent = opt.format ? opt.format(val) : String(val); minus.disabled = val <= opt.min; plus.disabled = val >= opt.max; });
    } else {
      const b = el('button', 'switch');
      b.onclick = () => set(opt, !current[opt.key]);
      ctl.append(b);
      rows.set(opt.key, (val) => { b.classList.toggle('on', Boolean(val)); b.setAttribute('aria-pressed', String(Boolean(val))); });
    }
    row.append(text, ctl);
    panel.append(row);
  }

  const rulesSection = createRulesSection();
  panel.append(rulesSection.node);

  function show() { for (const opt of OPTIONS) if (current[opt.key] !== undefined) rows.get(opt.key)(current[opt.key]); }

  return { button, panel, update(settings, catalog) { current = { ...settings }; show(); rulesSection.update(settings.rules, catalog?.packs); } };
}

/**
 * The device button of the bottom bar, apart from the settings gear: its icon is the state of the relay (no device configured, connected,
 * unreachable) and it opens the Device panel.
 * @returns {{button: HTMLButtonElement, panel: HTMLElement, updateRelay: (relay: object|undefined) => void}}
 */
export function createDeviceMenu() {
  const button = el('button', 'chip devbtn');
  button.setAttribute('aria-label', 'Device');
  const panel = el('div', 'vpanel');
  const device = createDeviceSection();
  panel.append(device.node);
  let shown = '';

  return {
    button, panel,
    updateRelay(relay) {
      device.update(relay);
      const label = relayLabel(relay);
      const state = !label ? 'none' : label.ok ? 'ok' : 'down';
      if (shown !== state) { shown = state; button.className = `chip devbtn ${state}`; button.replaceChildren(icon(state === 'none' ? 'plugoff' : 'plug')); }
      button.title = label ? `Device: ${label.text}${label.why ? `. ${label.why}` : ''}` : 'Device: not configured (click to set up)';
    },
  };
}
