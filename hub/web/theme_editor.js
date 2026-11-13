// The color editor of the theme view: one color input per color of the theme and one for the icon accent, with a live preview, a contrast warning,
// Reset (drops the user's edits of this theme and variant) and Save as theme (a user theme file). It edits a draft `{ colors, accent }`; the host
// stores it (setting `themeOverrides`) and writes the theme file.
import { COLOR_KEYS, resolvePalette, contrastRatio } from './theme_schema.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const NAME = /^[a-z0-9-]{1,32}$/;
const HEX = /^#[0-9a-f]{6}$/;
const MIN_CONTRAST = 4.5;

/** `#rrggbb` of a CSS color given as `#rrggbb` or `rgb(r,g,b)` (what themeColor returns for a built-in color). */
export function toHex(css) {
  if (HEX.test(css)) return css;
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(css);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000';
}

/**
 * @param {{draw: (canvas: HTMLCanvasElement, theme: object, accent: string) => void, themeColor: (theme: object, key: string) => string,
 *   onChange: (draft: object) => void, onReset: () => void, onSave: (info: {name: string, label: string}) => Promise<void>, onBack: () => void}} p
 * @returns {{element: HTMLElement, open: (theme: object, variant: string, override: object) => void, redraw: () => void}}
 */
export function createThemeEditor({ draw, themeColor, onChange, onReset, onSave, onBack }) {
  const root = el('div', 'tedit');
  const back = el('button', 'chip', '← Themes');
  const title = el('div', 'tname');
  const canvas = el('canvas', 'tpreview');
  const warn = el('div', 'shint twarn');
  const grid = el('div', 'tfields');
  const accentRow = el('label', 'tfield');
  const accentInput = el('input'); accentInput.type = 'color';
  const accentOff = el('button', 'chip', 'No accent');
  accentOff.title = 'Icons keep their own colors';
  accentRow.append(el('span', '', 'Icon accent'), accentInput, accentOff);
  const reset = el('button', 'chip', 'Reset edits');
  const nameInput = el('input', 'dinput'); nameInput.placeholder = 'Save as: name (a-z, 0-9, -)'; nameInput.spellcheck = false;
  const save = el('button', 'chip', 'Save as theme');
  const saveRow = el('div', 'mtools'); saveRow.append(reset, nameInput, save);
  const note = el('div', 'shint');
  root.append(back, title, canvas, warn, grid, accentRow, saveRow, note);

  let theme = null, variant = '', draft = { colors: {}, accent: '' }, timer = null;
  const inputs = new Map();

  const effective = () => resolvePalette(theme, variant, { colors: draft.colors, accent: draft.accent });
  const view = () => { const e = effective(); return { ...theme, colors: e.colors }; };
  function refresh() {
    const v = view();
    draw(canvas, v, effective().accent);
    const text = themeColor(v, 'TEXT'), low = ['PANEL', 'SCREEN'].some((k) => contrastRatio(toHex(text), toHex(themeColor(v, k))) < MIN_CONTRAST);
    warn.textContent = low ? 'Low contrast: the text is hard to read on the panel or the screen background.' : '';
  }
  const push = () => { clearTimeout(timer); timer = setTimeout(() => onChange({ colors: { ...draft.colors }, ...(draft.accent ? { accent: draft.accent } : {}) }), 200); };

  for (const key of COLOR_KEYS) {
    const row = el('label', 'tfield');
    const input = el('input'); input.type = 'color';
    input.oninput = () => { draft.colors[key] = input.value; refresh(); push(); };
    inputs.set(key, input);
    row.append(el('span', '', key), input);
    grid.append(row);
  }
  accentInput.oninput = () => { draft.accent = accentInput.value; refresh(); push(); };
  accentOff.onclick = () => { draft.accent = ''; accentInput.value = '#ffffff'; refresh(); push(); };
  back.onclick = onBack;
  reset.onclick = () => { clearTimeout(timer); onReset(); };
  save.onclick = async () => {
    if (!NAME.test(nameInput.value)) { note.textContent = 'The name is 1 to 32 characters among a-z, 0-9 and -.'; return; }
    save.disabled = true;
    try { await onSave({ name: nameInput.value, label: nameInput.value, override: { colors: { ...draft.colors }, ...(draft.accent ? { accent: draft.accent } : {}) } }); note.textContent = ''; } catch (err) { note.textContent = String(err.message ?? err); }
    save.disabled = false;
  };

  /** Shows the editor for `theme` under `variant`, starting from the saved `override` ({ colors, accent }). */
  function open(t, v, override) {
    theme = t; variant = v;
    draft = { colors: { ...(override?.colors ?? {}) }, accent: override?.accent ?? '' };
    title.textContent = `Colors of ${t.label || t.name}${v && t.variants?.[v] ? ` (${t.variants[v].label})` : ''}`;
    const e = effective(), vt = view();
    for (const [key, input] of inputs) input.value = toHex(e.colors[key] ?? themeColor(vt, key));
    accentInput.value = e.accent || '#ffffff';
    note.textContent = '';
    refresh();
  }
  return { element: root, open, redraw: () => { if (theme) refresh(); } };
}
