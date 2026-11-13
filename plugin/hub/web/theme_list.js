// The pure part of the theme view: one list of cards made from the installed themes (the hub catalog) and the marketplace listing
// (GET /market), with search, tag and status filters. No DOM and no imports, so it loads in Node.

/**
 * @param {{catalog: object[], market: object | null, active: string}} p `catalog`: the installed themes; `market`: the GET /market answer (or null)
 * @returns {object[]} cards: { name, label, description, keywords, author, version, source, preview, installed, active, updatable, availableVersion, deletable }
 *   Available cards also carry `colors` and `roles` (icon URLs) for a preview without installing.
 *   Installed cards first (the active one on top), then the ones only the marketplace has; each group by label.
 */
export function mergeCards({ catalog, market, active }) {
  const listed = new Map((market?.themes ?? []).map((t) => [t.name, t]));
  const user = new Set(market?.userThemes ?? []);
  const installed = catalog.map((t) => {
    const m = listed.get(t.name);
    const fromMarket = m?.installed ? m : null;
    return {
      name: t.name, label: t.label || t.name, description: t.description || fromMarket?.description || '', keywords: t.keywords?.length ? t.keywords : fromMarket?.keywords ?? [],
      author: t.author || '', version: t.version || '', source: fromMarket?.source ?? '', preview: fromMarket?.preview ?? null,
      variants: Object.entries(t.variants ?? {}).map(([key, v]) => ({ key, label: v.label || key })),
      installed: true, active: t.name === active, updatable: Boolean(fromMarket?.updatable), availableVersion: fromMarket?.updatable ? fromMarket.version : '', deletable: user.has(t.name),
    };
  });
  const have = new Set(catalog.map((t) => t.name));
  const available = (market?.themes ?? []).filter((t) => !t.installed && !have.has(t.name)).map((t) => ({
    name: t.name, label: t.label || t.name, description: t.description || '', keywords: t.keywords ?? [], author: t.author || '', version: t.version || '', source: t.source,
    preview: t.preview ?? null, colors: t.colors ?? {}, roles: t.roles ?? {}, variants: [], installed: false, active: false, updatable: false, availableVersion: '', deletable: false,
  }));
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  installed.sort((a, b) => (b.active - a.active) || byLabel(a, b));
  available.sort(byLabel);
  return [...installed, ...available];
}

export const STATUSES = ['all', 'installed', 'available', 'updates'];

/** Cards matching every word of `query` (label, name, description, keywords), carrying every tag of `tags`, and the `status` filter. */
export function filterCards(cards, { query = '', tags = [], status = 'all' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    if (status === 'installed' && !c.installed) return false;
    if (status === 'available' && c.installed) return false;
    if (status === 'updates' && !c.updatable) return false;
    if (!tags.every((t) => c.keywords.includes(t))) return false;
    const hay = [c.label, c.name, c.description, ...c.keywords].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Keywords of the cards with how many cards carry each, most frequent first (then alphabetical). */
export function tagCounts(cards) {
  const n = new Map();
  for (const c of cards) for (const k of new Set(c.keywords)) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
}
