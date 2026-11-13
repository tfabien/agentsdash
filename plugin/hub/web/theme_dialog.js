// The theme button of the bottom bar and its view (it opens in place of the agents, see views.js): one card per theme with a preview (its colors and its eight agents), a click applies it.
// The choice is the `theme` setting of the hub, so every page follows (see themes.js).
import { listThemes, themeColor } from './themes.js';
import { iconPackFor, onIconsLoaded, clearIconCache } from './icon_packs.js';
import { postSettings } from './settings.js';
import { icon } from './icons.js';
import { createMarket } from './market.js';

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
 * @returns {{button: HTMLButtonElement, panel: HTMLElement, onOpen: () => void, update: (name: string|undefined) => void}}
 */
export function createThemeMenu() {
  const button = el('button', 'chip themebtn');
  button.append(icon('palette'));
  button.title = 'Theme';
  button.setAttribute('aria-label', 'Theme');
  const panel = el('div', 'vpanel vwide');
  const reload = el('button', 'chip', '↻ Reload');
  reload.title = 'Rescan the theme and icon folders';
  reload.onclick = async () => {                             // the hub rescans and pushes the new catalog to every page
    reload.disabled = true;
    try { await fetch('/reload', { method: 'POST' }); clearIconCache(); } catch { /* the hub is unreachable: nothing changes */ }
    reload.disabled = false;
  };
  const list = el('div', 'tlist');
  const market = createMarket();
  const tabs = el('div', 'mtabs');
  const tabInstalled = el('button', 'chip on', 'Installed');
  const tabMarket = el('button', 'chip', 'Marketplace');
  tabs.append(tabInstalled, tabMarket, el('span', 'spacer'), reload);
  market.element.hidden = true;
  const hint = el('div', 'shint', 'Colors and agent icons of the page, for every browser');
  panel.append(tabs, hint, list, market.element);
  function show(tab) {
    const inMarket = tab === 'market';
    tabInstalled.classList.toggle('on', !inMarket);
    tabMarket.classList.toggle('on', inMarket);
    list.hidden = inMarket; hint.hidden = inMarket; market.element.hidden = !inMarket;
    if (inMarket) market.refresh();
  }
  tabInstalled.onclick = () => show('installed');
  tabMarket.onclick = () => show('market');

  const cards = new Map();
  let shown = '', chosenName = 'default';
  function rebuild() {                                       // the cards follow the catalog: rebuilt only when it changed
    const themes = listThemes();
    const log = market.installed();
    const key = JSON.stringify([themes, Object.keys(log), market.autoUpdate(), [...market.updatable()]]);
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
      card.append(preview, name, by);
      if (theme.description) card.append(el('div', 'mdesc', theme.description));
      if (theme.keywords?.length) { const kw = el('div', 'mkw'); for (const k of theme.keywords) kw.append(el('span', 'kw', k)); card.append(kw); }
      card.append(swatches);
      card.onclick = () => { update(theme.name); postSettings({ theme: theme.name }); };
      const cell = el('div', 'tcell');
      cell.append(card);
      if (theme.name in log) {                                 // installed from a marketplace: it can be removed, and flagged when auto-update is off
        const row = el('div', 'mtools');
        if (!market.autoUpdate() && market.updatable().has(theme.name)) row.append(el('span', 'kw', 'update available'));
        const remove = el('button', 'chip', 'Remove');
        remove.onclick = async () => { remove.disabled = true; await fetch('/market/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: theme.name }) }); await market.refresh(); shown = ''; rebuild(); remove.disabled = false; };
        row.append(remove);
        cell.append(row);
      }
      list.append(cell);
      cards.set(theme.name, { card, preview, theme });
    }
  }

  function update(name) {
    rebuild();
    chosenName = cards.has(name) ? name : 'default';
    for (const [n, c] of cards) { c.card.classList.toggle('on', n === chosenName); c.card.setAttribute('aria-pressed', String(n === chosenName)); }
  }

  const open = () => { rebuild(); update(chosenName); for (const c of cards.values()) drawPreview(c.preview, c.theme); };
  const onOpen = () => { show('installed'); open(); market.refresh().then(() => { shown = ''; open(); }); };
  onIconsLoaded(() => { if (panel.isConnected) for (const c of cards.values()) drawPreview(c.preview, c.theme); });

  update(undefined);
  return { button, panel, onOpen, update };
}
