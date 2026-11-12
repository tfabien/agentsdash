// The theme button of the bottom bar and its dialog: one card per theme with a preview (its colors and its eight agents), a click applies it.
// The choice is the `theme` setting of the hub, so every page follows (see themes.js).
import { listThemes, themeColor } from './themes.js';
import { iconPackFor, onIconsLoaded } from './icon_packs.js';
import { postSettings } from './settings.js';
import { icon } from './icons.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const SWATCHES = ['FRAME', 'PANEL', 'TEXT', 'WORKING', 'NEEDS', 'ERROR', 'ACCENT'];
const ICON_W = 36, ICON_H = 42, GAP = 6;

/** The eight agents of a theme, on its panel color, drawn at `k` pixels per unit. */
function drawPreview(canvas, theme) {
  const k = 1.1, ratio = window.devicePixelRatio || 1;
  const w = 8 * ICON_W + 9 * GAP, h = ICON_H + 2 * GAP;
  canvas.width = Math.round(w * k * ratio); canvas.height = Math.round(h * k * ratio);
  canvas.style.width = `${w * k}px`; canvas.style.height = `${h * k}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k * ratio, 0, 0, k * ratio, 0, 0);
  ctx.fillStyle = themeColor(theme, 'PANEL'); ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill();
  const pack = iconPackFor(theme.iconPack);
  for (let role = 0; role < 8; role++) { ctx.save(); ctx.translate(GAP + role * (ICON_W + GAP), GAP); pack.draw(ctx, role, false); ctx.restore(); }
}

/**
 * @returns {{button: HTMLButtonElement, update: (name: string|undefined) => void}}
 */
export function createThemeDialog() {
  const button = el('button', 'chip themebtn');
  button.append(icon('palette'));
  button.title = 'Theme';
  button.setAttribute('aria-label', 'Theme');
  const dialog = el('dialog', 'theme-dialog');
  const head = el('div', 'thead');
  const close = el('button', 'chip', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(el('div', 'ttitle', 'Theme'), close);
  const list = el('div', 'tlist');
  dialog.append(head, el('div', 'shint', 'Colors and agent icons of the page, for every browser'), list);
  document.body.append(dialog);

  const cards = new Map();
  let shown = '', chosenName = 'default';
  function rebuild() {                                       // the cards follow the catalog: rebuilt only when it changed
    const themes = listThemes();
    const key = JSON.stringify(themes);
    if (key === shown) return;
    shown = key;
    cards.clear();
    list.replaceChildren();
    for (const theme of themes) {
      const card = el('button', 'tcard');
      card.type = 'button';
      const preview = el('canvas', 'tpreview');
      const swatches = el('div', 'tswatches');
      for (const k of SWATCHES) { const sw = el('span', 'tsw'); sw.style.background = themeColor(theme, k); swatches.append(sw); }
      const name = el('div', 'tname', theme.label ?? theme.name);
      const by = el('div', 'shint', `${iconPackFor(theme.iconPack).label} icons${theme.author ? ` · ${theme.author}` : ''}`);
      card.append(preview, name, by, swatches);
      card.onclick = () => { update(theme.name); postSettings({ theme: theme.name }); };
      list.append(card);
      cards.set(theme.name, { card, preview, theme });
    }
  }

  function update(name) {
    rebuild();
    chosenName = cards.has(name) ? name : 'default';
    for (const [n, c] of cards) { c.card.classList.toggle('on', n === chosenName); c.card.setAttribute('aria-pressed', String(n === chosenName)); }
  }

  button.onclick = () => { rebuild(); update(chosenName); for (const c of cards.values()) drawPreview(c.preview, c.theme); dialog.showModal(); };
  onIconsLoaded(() => { if (dialog.open) for (const c of cards.values()) drawPreview(c.preview, c.theme); });
  close.onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });     // a click on the backdrop closes

  update(undefined);
  return { button, update };
}
