// The Marketplace tab of the theme dialog: themes of GitHub sources, with install, update and remove. Everything goes through the hub
// (GET /market, POST /market/*): the page never reaches GitHub. No imports, so the pure helpers load in Node.

/** Themes matching every word of `query` in label, name, description or keywords (case-insensitive). An empty query keeps all. */
export function filterThemes(themes, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return themes;
  return themes.filter((t) => {
    const hay = [t.label, t.name, t.description, ...(t.keywords ?? [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** @returns {{element: HTMLElement, refresh: () => Promise<void>, installed: () => Record<string, object>, autoUpdate: () => boolean}} */
export function createMarket() {
  const element = el('div', 'market');
  const search = el('input', 'dinput msearch');
  search.type = 'search'; search.placeholder = 'Search themes (name, description, keywords)';
  const sourcesRow = el('div', 'msources');
  const add = el('input', 'dinput'); add.placeholder = 'Add a source: owner/repo';
  const addBtn = el('button', 'chip', 'Add');
  const check = el('button', 'chip', '↻ Check for updates');
  check.title = 'Install every newer version of the installed marketplace themes now';
  const auto = el('button', 'switch'); auto.setAttribute('role', 'switch'); auto.title = 'Install newer versions automatically (every 6 hours)';
  const autoLabel = el('span', 'shint', 'Auto-update');
  const tools = el('div', 'mtools'); tools.append(check, auto, autoLabel);
  const status = el('div', 'mstatus shint');
  const list = el('div', 'tlist');
  const addRow = el('div', 'mtools'); addRow.append(add, addBtn);
  element.append(search, sourcesRow, addRow, tools, status, list);

  let data = { sources: [], installed: {}, themes: [], errors: [], lastCheck: 0, autoUpdate: true };
  let message = '';

  const say = (text) => { message = text; render(); };
  async function act(button, fn) {                             // one request at a time per button; the hub answers 'ok' or a reason
    button.disabled = true;
    try { await fn(); } catch (err) { say(String(err.message ?? err)); }
    button.disabled = false;
  }
  async function call(path, body) {
    const res = await post(path, body);
    if (!res.ok) throw new Error(await res.text());
    return res;
  }

  function card(t) {
    const c = el('div', 'tcard mcard');
    if (t.preview) { const img = el('img', 'mprev'); img.src = t.preview; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; c.append(img); }
    const body = el('div', 'mbody');
    body.append(el('div', 'tname', t.label || t.name));
    const version = t.installed ? `v${t.version} · installed v${t.installedVersion}` : `v${t.version || '?'}`;
    body.append(el('div', 'shint', `${version}${t.author ? ` · ${t.author}` : ''} · ${t.source}`));
    if (t.description) body.append(el('div', 'mdesc', t.description));
    if (t.keywords?.length) { const kw = el('div', 'mkw'); for (const k of t.keywords) kw.append(el('span', 'kw', k)); body.append(kw); }
    const actions = el('div', 'mtools');
    if (!t.installed) {
      const b = el('button', 'chip', 'Install');
      b.onclick = () => act(b, async () => { await call('/market/install', { source: t.source, name: t.name }); await refresh(); });
      actions.append(b);
    } else {
      if (t.updatable) {
        const b = el('button', 'chip', 'Update');
        b.onclick = () => act(b, async () => { await call('/market/update', { name: t.name }); await refresh(); });
        actions.append(b);
      }
      const r = el('button', 'chip', 'Remove');
      r.onclick = () => act(r, async () => { await call('/market/remove', { name: t.name }); await refresh(); });
      actions.append(r);
    }
    body.append(actions);
    c.append(body);
    return c;
  }

  function render() {
    sourcesRow.replaceChildren(...data.sources.map((s) => {
      const chip = el('span', 'kw', s);
      const x = el('button', 'chip', '✕'); x.title = `Remove ${s}`; x.setAttribute('aria-label', `Remove ${s}`);
      x.onclick = () => act(x, async () => { await call('/market/sources', { remove: s }); await refresh(); });
      chip.append(' ', x);
      return chip;
    }));
    auto.classList.toggle('on', data.autoUpdate);
    auto.setAttribute('aria-checked', String(data.autoUpdate));
    const lines = [...data.errors, ...(message ? [message] : [])];
    const checked = data.lastCheck ? `Last check ${new Date(data.lastCheck).toLocaleTimeString()}` : 'Not checked since the hub started';
    status.textContent = [checked, ...lines].join(' · ');
    const shown = filterThemes(data.themes, search.value);
    list.replaceChildren(...(shown.length ? shown.map(card) : [el('div', 'shint', data.themes.length ? 'No theme matches.' : 'No theme found in the sources.')]));
  }

  async function refresh() {
    try { data = await (await fetch('/market')).json(); message = ''; } catch { message = 'The hub is unreachable.'; }
    render();
  }

  search.oninput = render;
  addBtn.onclick = () => act(addBtn, async () => { await call('/market/sources', { add: add.value }); add.value = ''; await refresh(); });
  add.onkeydown = (e) => { if (e.key === 'Enter') addBtn.click(); };
  check.onclick = () => act(check, async () => {
    const r = await (await call('/market/update', {})).json();
    await refresh();
    say(r.updated.length ? `Updated: ${r.updated.join(', ')}` : r.errors.length ? r.errors.join(' · ') : 'Everything is up to date.');
  });
  auto.onclick = () => act(auto, async () => { await call('/settings', { themeAutoUpdate: !data.autoUpdate }); await refresh(); });

  return { element, refresh, installed: () => data.installed, autoUpdate: () => data.autoUpdate, updatable: () => new Set(data.themes.filter((t) => t.updatable).map((t) => t.name)) };
}
