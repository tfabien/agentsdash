# Theme folders, SVG icon packs and per-project rules (issue #16)

## Intent

Users create and share themes and icon packs for the page without editing JS. A project can override the icon pack and the badge color so a session is recognized at a glance.

## Goals

- Themes are `theme.json` files, icon packs are folders of SVG files, both loaded from drop-in folders without a restart.
- The 5 built-in themes and 5 built-in icon packs ship in the same format, as files in the repo (migration of the current code tables).
- A rule `{ match, iconPack?, badgeColor? }` changes the pack and the badge color of the matching sessions.
- Docs page and tests.

## Non-goals

- Physical screen and firmware (wait for #3).
- Matching on git branch or environment variable.
- Animated SVG. Blink is an optional second file.

## Constraints

- Third-party SVG must not run scripts: the hub serves it as `image/svg+xml` with `Content-Security-Policy: sandbox`, the page loads it with `Image`.
- Node >= 18, stdlib only. Hub binds 127.0.0.1, no CORS.
- The built-in `robot` pack is the fallback for any missing icon. A missing color key keeps the built-in value.

## Approaches

1. SVG files rendered through `Image` (chosen): safe by construction, familiar format for authors. No fine blink animation.
2. JSON drawing DSL: safe too, but a format to invent and document. Dropped.

## Design

- Folders: built-in `plugin/hub/themes/<name>.json` and `plugin/hub/icons/<pack>/<role>.svg` (+ optional `<role>-blink.svg`); user folders `~/.claude/standup-bot/themes/` and `.../icons/`, user entries override built-in ones of the same name.
- Role file names: `lead general explore plan review test code generic` (roles 0 to 7), each drawn in the 36x42 box (`viewBox="0 0 36 42"`).
- Hub: `themes_loader.mjs` scans both folders (startup and `POST /reload`), validates themes (same rules as today's `validateTheme`, moved to the hub and reused by the page), publishes `catalog` (themes + pack names) in `state`, serves `GET /icons/<pack>/<file>.svg` with the sandbox header. Invalid theme: skipped and listed in `catalog.errors`.
- Page: `themes.js` and `icon_packs.js` read the catalog; the pack draws `Image`s (cached by pack and role), robot canvas drawing stays as the fallback. The theme dialog lists the catalog.
- Rules: `settings.rules` (array, validated: `match` string, `iconPack` known name, `badgeColor` `#rrggbb`), first match wins, `match` is a path prefix or a glob (`*`, `?`, `**`) against the session cwd (slashes normalized, case-insensitive on Windows). `notify.mjs` adds `cwd` to the event, `model.mjs` keeps it per session and exposes it in `state`. The page picks pack and badge color per session. Badge text stays the project name.
- Migration: a script `plugin/hub/tools/export_builtin.mjs` renders the current canvas packs to SVG files (a recording 2D context that emits SVG elements) and writes the 5 theme JSON files. The old `THEMES` and `ICON_PACKS` tables become the fallback only (robot) after the files render the same.
- Docs: `docs/themes.md` rewritten (format, folders, rules, security). Tests: loading, key and icon fallback, invalid theme rejected, rule matching (path, glob, first wins, no match), settings validation, SVG served with sandbox header.

## Left to the builder

Exact glob implementation, SVG blink swap timing, catalog payload shape, how the page re-reads the catalog on `state`.
