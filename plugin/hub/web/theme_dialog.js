// The theme button of the bottom bar and its view (it opens in place of the agents, see views.js): one list of the installed themes and the
// marketplace themes, with search, tags and a status filter; Apply, Install, Update, Preview and Delete on each card; the marketplace
// settings behind a button. The choice is the `theme` setting of the hub, so every page follows (see themes.js).
import { listThemes, themeColor } from './themes.js';
import { iconPackFor, onIconsLoaded, clearIconCache } from './icon_packs.js';
import { postSettings } from './settings.js';
import { icon } from './icons.js';
import { mergeCards, filterCards, tagCounts, STATUSES } from './theme_list.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const ICON_W = 36, ICON_H = 42, GAP = 6;
const TAGS_SHOWN = 12;
const STATUS_LABEL = { all: 'All', installed: 'Installed', available: 'Available', updates: 'Updates' };

/** POST to the hub; a refusal throws the hub's reason. */
async function call(path, body = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

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
 * @param {{onPreview?: (name: string) => void}} [opts] `onPreview`: the page shows the theme on the agents without saving it
 * @returns {{button: HTMLButtonElement, panel: HTMLElement, onOpen: () => void, update: (name: string|undefined) => void}}
 */
export function createThemeMenu({ onPreview } = {}) {
  const button = el('button', 'chip themebtn');
  button.append(icon('palette'));
  button.title = 'Theme';
  button.setAttribute('aria-label', 'Theme');
  const panel = el('div', 'vpanel vwide');
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  // --- state
  let market = null;                                           // the last GET /market answer
  let active = 'default';
  let query = '', status = 'all', showAllTags = false, inSettings = false;
  let notice = null, noticeTimer = null;                       // { ok, text }: the result of the last action, shown on top
  const busy = new Map();                                      // card name -> what is running on it ("Installing…")
  const tags = new Set();
  let previews = [];                                           // [{canvas, theme}] of the cards on screen
  let catalogKey = '';

  // --- the list view
  const main = el('div', 'tmain');
  const search = el('input', 'dinput msearch');
  search.type = 'search'; search.placeholder = 'Search themes (name, description, tags)';
  const statusRow = el('div', 'mtabs');
  const reload = el('button', 'chip', '↻ Reload');
  reload.title = 'Rescan the theme and icon folders';
  const gear = el('button', 'chip', '⚙ Marketplaces');
  gear.title = 'Sources, auto-update and refresh of the marketplace';
  const bar = el('div', 'mtools');
  bar.append(search, reload, gear);
  const tagRow = el('div', 'mkw mtags');
  const status$ = el('div', 'mstatus shint');
  const list = el('div', 'tgroups');
  main.append(bar, statusRow, tagRow, status$, list);

  // --- the settings view
  const settingsBox = el('div', 'tsettings');
  settingsBox.hidden = true;
  const backBtn = el('button', 'chip', '← Themes');
  const sourcesRow = el('div', 'msources');
  const add = el('input', 'dinput'); add.placeholder = 'Add a source: owner/repo or a GitHub URL';
  const addBtn = el('button', 'chip', 'Add');
  const addRow = el('div', 'mtools'); addRow.append(add, addBtn);
  const auto = el('button', 'switch'); auto.setAttribute('role', 'switch');
  const autoRow = el('div', 'mtools'); autoRow.append(auto, el('span', '', 'Install newer versions automatically (every 6 hours)'));
  const refresh = el('button', 'chip', '↻ Refresh marketplaces');
  refresh.title = 'Fetch the listings again (they are kept for 24 hours otherwise)';
  const check = el('button', 'chip', 'Check for updates');
  check.title = 'Install every newer version of the installed marketplace themes now';
  const actionRow = el('div', 'mtools'); actionRow.append(refresh, check);
  const refreshed = el('div', 'shint');
  const settingsStatus = el('div', 'mstatus shint');
  settingsBox.append(backBtn, el('div', 'tname', 'Marketplaces'), el('div', 'shint', 'GitHub repositories with one folder per theme. The listings are kept for 24 hours.'),
    sourcesRow, addRow, autoRow, actionRow, refreshed, settingsStatus);
  panel.append(toast, main, settingsBox);

  // --- actions
  function setNotice(ok, text) {                               // a success fades after 5 seconds, an error stays until the next action
    clearTimeout(noticeTimer);
    notice = text ? { ok, text } : null;
    if (notice?.ok) noticeTimer = setTimeout(() => { notice = null; render(); }, 5000);
    render();
  }
  async function act(btn, fn) {                                // one request at a time per button; a refusal shows as an error
    btn.disabled = true;
    try { await fn(); } catch (err) { setNotice(false, String(err.message ?? err)); }
    btn.disabled = false;
    render();
  }
  /** An action on a card: the card shows `busyLabel` while it runs, then a notice says `done` or why it failed. */
  async function run(name, busyLabel, done, fn) {
    busy.set(name, busyLabel);
    setNotice(true, '');
    try { await fn(); busy.delete(name); setNotice(true, done); } catch (err) { busy.delete(name); setNotice(false, String(err.message ?? err)); }
  }
  async function load() {
    try { market = await (await fetch('/market')).json(); } catch { setNotice(false, 'The hub is unreachable.'); }
    render();
  }

  function badge(c) {
    if (c.active) return el('span', 'kw on', 'Active');
    if (c.updatable) return el('span', 'kw upd', `Update ${c.availableVersion}`);
    return el('span', 'kw', c.installed ? 'Installed' : 'Available');
  }

  function card(c) {
    const theme = c.installed ? listThemes().find((t) => t.name === c.name) : null;
    const root = el('div', `tcard mcard${c.active ? ' on' : ''}`);
    if (theme) {
      const canvas = el('canvas', 'tpreview');
      root.append(canvas);
      previews.push({ canvas, theme });
    } else if (c.preview) {
      const img = el('img', 'mprev'); img.src = c.preview; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      root.append(img);
    }
    const body = el('div', 'mbody');
    const title = el('div', 'tname', c.label);
    title.append(' ', badge(c));
    body.append(title, el('div', 'shint', [c.version && `v${c.version}`, c.author, c.source].filter(Boolean).join(' · ')));
    if (c.description) body.append(el('div', 'mdesc', c.description));
    if (c.keywords.length) {
      const kw = el('div', 'mkw');
      for (const k of c.keywords) { const chip = el('button', `kw tag${tags.has(k) ? ' on' : ''}`, k); chip.onclick = () => { tags.has(k) ? tags.delete(k) : tags.add(k); render(); }; kw.append(chip); }
      body.append(kw);
    }
    const actions = el('div', 'mtools');
    const working = busy.get(c.name);
    if (working) {                                             // a spinner replaces the buttons while the hub works
      root.classList.add('busy');
      actions.append(el('span', 'spin'), el('span', '', working));
    } else {
      const btn = (label, o, fn) => {
        const b = el('button', 'chip', label);
        if (o.title) b.title = o.title;
        b.onclick = () => { if (o.confirm && !confirm(o.confirm)) return; run(c.name, o.busy, o.done, fn); };
        actions.append(b);
      };
      if (!c.installed) btn('Install', { busy: 'Installing…', done: `Installed ${c.label} and applied it`, title: 'Install and apply' }, async () => { await call('/market/install', { source: c.source, name: c.name }); active = c.name; await load(); });
      else {
        if (!c.active) btn('Apply', { busy: 'Applying…', done: `Applied ${c.label}` }, async () => { active = c.name; await postSettings({ theme: c.name }); });
        if (c.updatable) btn(`Update to ${c.availableVersion}`, { busy: 'Updating…', done: `Updated ${c.label} to ${c.availableVersion}` }, async () => { await call('/market/update', { name: c.name }); await load(); });
        if (onPreview) { const p = el('button', 'chip', 'Preview'); p.title = 'Show the theme on the agents without saving it'; p.onclick = () => onPreview(c.name); actions.append(p); }
        if (c.deletable) btn('Delete', { busy: 'Deleting…', done: `Deleted ${c.label}`, confirm: `Delete the theme ${c.label}? Its files are removed.` }, async () => { await call('/market/remove', { name: c.name }); await load(); });
      }
    }
    body.append(actions);
    root.append(body);
    return root;
  }

  function group(title, cards) {
    const g = el('div', 'tgroup');
    if (title) g.append(el('div', 'tgtitle', `${title} (${cards.length})`));
    const grid = el('div', 'tlist');
    grid.append(...cards.map(card));
    g.append(grid);
    return g;
  }

  function render() {
    if (!panel.isConnected) { catalogKey = ''; return; }
    previews = [];
    const cards = mergeCards({ catalog: listThemes(), market, active });
    const counts = { all: cards.length, installed: cards.filter((c) => c.installed).length, available: cards.filter((c) => !c.installed).length, updates: cards.filter((c) => c.updatable).length };
    statusRow.replaceChildren(...STATUSES.map((s) => {
      const b = el('button', `chip${status === s ? ' on' : ''}`, `${STATUS_LABEL[s]} ${counts[s]}`);
      b.onclick = () => { status = s; render(); };
      return b;
    }));
    const all = tagCounts(cards);
    const shown = showAllTags ? all : all.filter(([k], i) => i < TAGS_SHOWN || tags.has(k));
    tagRow.replaceChildren(...shown.map(([k, n]) => {
      const b = el('button', `kw tag${tags.has(k) ? ' on' : ''}`, `${k} ${n}`);
      b.onclick = () => { tags.has(k) ? tags.delete(k) : tags.add(k); render(); };
      return b;
    }));
    if (all.length > TAGS_SHOWN) { const more = el('button', 'kw tag', showAllTags ? 'fewer' : `+${all.length - shown.length} more`); more.onclick = () => { showAllTags = !showAllTags; render(); }; tagRow.append(more); }
    const visible = filterCards(cards, { query, tags: [...tags], status });
    if (!visible.length) list.replaceChildren(el('div', 'shint', cards.length ? 'No theme matches.' : 'No theme found.'));
    else if (status === 'all') {
      const mine = visible.filter((c) => c.installed), other = visible.filter((c) => !c.installed);
      list.replaceChildren(...[mine.length && group('Installed', mine), other.length && group('Marketplace', other)].filter(Boolean));
    } else list.replaceChildren(group('', visible));
    status$.textContent = (market?.errors ?? []).join(' · ');
    toast.hidden = !notice;
    toast.className = `toast ${notice?.ok ? 'ok' : 'err'}`;
    toast.textContent = notice?.text ?? '';
    for (const p of previews) drawPreview(p.canvas, p.theme);

    sourcesRow.replaceChildren(...(market?.sources ?? []).map((s) => {
      const chip = el('span', 'kw', s);
      const x = el('button', 'chip', '✕'); x.title = `Remove ${s}`; x.setAttribute('aria-label', `Remove ${s}`);
      x.onclick = () => act(x, async () => { await call('/market/sources', { remove: s }); await load(); });
      chip.append(' ', x);
      return chip;
    }));
    const on = market?.autoUpdate ?? true;
    auto.classList.toggle('on', on); auto.setAttribute('aria-checked', String(on));
    const stamps = Object.entries(market?.refreshedAt ?? {}).map(([s, t]) => `${s}: ${t ? new Date(t).toLocaleString() : 'not fetched'}`);
    refreshed.textContent = [...stamps, market?.lastCheck ? `Update check ${new Date(market.lastCheck).toLocaleTimeString()}` : 'No update check since the hub started'].join(' · ');
    settingsStatus.textContent = (market?.errors ?? []).join(' · ');
    main.hidden = inSettings; settingsBox.hidden = !inSettings;
  }

  // --- wiring
  search.oninput = () => { query = search.value; render(); };
  reload.onclick = () => act(reload, async () => { await call('/reload'); clearIconCache(); });
  gear.onclick = () => { inSettings = true; render(); };
  backBtn.onclick = () => { inSettings = false; render(); };
  addBtn.onclick = () => act(addBtn, async () => { await call('/market/sources', { add: add.value }); add.value = ''; await load(); setNotice(true, 'Source added'); });
  add.onkeydown = (e) => { if (e.key === 'Enter') addBtn.click(); };
  refresh.onclick = () => act(refresh, async () => { await call('/market/refresh'); await load(); setNotice(true, 'Marketplaces refreshed'); });
  check.onclick = () => act(check, async () => {
    const r = await (await call('/market/update')).json();
    await load();
    if (r.updated.length) setNotice(true, `Updated ${r.updated.join(', ')}`); else if (r.errors.length) setNotice(false, r.errors.join(' · ')); else setNotice(true, 'Everything is up to date.');
  });
  auto.onclick = () => act(auto, async () => { await postSettings({ themeAutoUpdate: !(market?.autoUpdate ?? true) }); await load(); });
  onIconsLoaded(() => { for (const p of previews) drawPreview(p.canvas, p.theme); });

  return {
    button, panel,
    onOpen() { inSettings = false; render(); load(); },        // the hub answers from its 24 hour cache, or fetches when it is older
    update(name) {                                             // the saved theme or the catalog changed
      const key = `${name}|${listThemes().map((t) => `${t.name}${t.version}${t.iconPack}`).join()}`;
      if (key === catalogKey) return;
      catalogKey = key;
      active = name && listThemes().some((t) => t.name === name) ? name : 'default';
      render();
    },
  };
}
