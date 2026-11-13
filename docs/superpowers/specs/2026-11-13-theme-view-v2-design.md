# Theme view v2

## Intent

The theme view (opened by the palette button, in place of the agents) mixes installed and marketplace themes in one searchable list, takes over theme actions (install and activate, preview, delete) and holds the marketplace settings. Follows `2026-11-13-theme-marketplace-design.md`.

## Goals

1. One list, no tabs. Each theme is a card with a status: Active, Installed, Update available, Available (marketplace, not installed).
2. Search box over label, name, description and keywords, for every card.
3. Keywords are clickable chips. The view lists the keywords of all cards as a tag bar; selecting tags keeps the cards that carry all of them. A second click on a tag clears it.
4. Status filter: All, Installed, Available, Updates. Cards are grouped under "Installed" and "Marketplace" headings; a theme present in both is shown once, in Installed, with its marketplace version when newer.
5. A Settings button in the view header opens the marketplace settings in the same view: sources (list, add, remove), Auto-update switch, Check for updates, last refresh time, per-source error. These controls leave the main list.
6. Installing a theme applies it right away (`theme` setting set to its name once the install succeeded).
7. Delete button on every installed card that lives in the user folder (`~/.claude/standup-bot/themes/<name>.json`), marketplace or hand-made, after a confirmation. Built-in themes (`default` and the others in `plugin/hub/themes/`) have no Delete button. The icon folder is deleted too, unless another remaining theme names that pack. Deleting the active theme switches the setting to `default`.
8. Preview button on installed cards: the real agent tiles take the theme's colors and icons, nothing is saved. The view closes, a strip at the top of the tiles shows "Previewing <label>" with Apply and Exit. Exit, Escape or a change of the saved theme ends the preview. Not offered on theme cards that are not installed.
9. The listing of a source is cached on disk (`<userDir>/market-cache.json`: source, time, themes) and used while it is younger than 24 hours, also after a hub restart. When a page asks for it older than 24 hours, the hub fetches it again before answering. A Refresh button (and Check for updates) forces a fetch. The 6 hour update check keeps using fresh listings and refreshes the cache.

## Non-goals

- No preview of a theme that is not installed (the card shows its `preview.png`).
- No grouping options beyond the status filter and tags.
- No change to the source layout, the install pipeline or the theme files.

## Decisions taken

- Delete extends beyond `market.json`: `removeTheme` accepts any theme file in the user folder (the user chose this). The route stays `POST /market/remove` and answers 404 for names with no user-folder file, 403-like 400 for built-in names.
- A card's single primary button depends on status: Install (Available), Update (Update available), Apply (Installed, not active), none (Active).
- Tag bar shows the 12 most frequent keywords and a "more" toggle for the rest.
- Settings view is a second panel in the host (`views.js`), reached by a Settings button of the theme view, with a Back button to the list.

## Approaches considered

1. One merged list with a status filter (chosen). One search and one tag filter apply to everything.
2. Keep two tabs and share only the search box. Two lists to keep in step, tags cannot span both.
3. Two sections on one scrolling page without a status filter. Long page with 23+ cards, no way to reach Updates fast.

## Left to the builder

Card layout inside the grid, the look of the status badge, the preview strip, the confirmation (a native `confirm()` is acceptable), keyboard focus.
