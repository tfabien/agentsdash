# Prompt: add variants, accent and tint mode to the existing themes

Paste the text below into Claude Code, in an empty folder (it clones the repository itself). Needs standup-bot with theme variants (PR 50, merged) running, to check the result on the page.

---

Adapt every theme of the repository `tfabien/standup-bot-themes` to the theme variants of standup-bot. Work in a fresh clone on a branch `feat/theme-variants`, open a PR to `main`, do not merge. Read `docs/themes.md` of `tfabien/standup-bot` first (sections Theme file, Icon accent, Color editor): it is the format reference.

## What to add to each theme folder `<name>/`

1. `theme.json`:
   - `variants`: 2 or 3 entries, keys `a-z0-9-`, each with `label`, a partial `colors` object (merged over the theme colors) and an optional `accent`.
     - One light or dark counterpart of the theme: if the theme is dark, a `light` variant (change `SCREEN BAR PANEL ROW FRAME CHIP TEXT LIGHT FAINT`, keep `WORKING NEEDS ERROR YOURTURN WAITING` readable on the new background); if it is light, a `dark` variant.
     - One or two accent variants that keep the palette and change only `accent` (and `ACCENT`, `ACCENT_DIM` when the theme draws with them).
     - Every variant keeps the contrast of `TEXT` on `PANEL` and on `SCREEN` at 4.5 or more (WCAG ratio).
   - `accent`: a `#rrggbb` taken from the theme palette (its `ACCENT` color unless the pack needs another one). Set it only when the pack gets a tint mode (below).
   - `version`: raise the minor number (`1.0.0` becomes `1.1.0`) so installed copies update by themselves.
   - Leave every existing key and color as they are.
2. `icons/pack.json` (4 KB max), chosen by looking at the icons:
   - SVG icons drawn with `currentColor` (or that can be, with a one-line change per file that keeps the look): `{"tint":"svg"}`. Replace the main stroke or fill color by `currentColor` and leave the other colors alone.
   - Single-color PNG, GIF or WebP artwork (one hue plus greys): `{"tint":"hue","hue":<hue of the artwork in degrees>}`. Compute the hue from the dominant non-grey color of the icons.
   - Multi-color artwork (skin, eyes, scenery in several hues): no `pack.json`. The accent would shift every color, so do not set `accent` either.
   - Write the reasoning for each theme in the PR (svg, hue with the value, or none and why).

3. `looks` (optional, only when it fits the theme):
   - When roles have several numbered sprites (`lead.png`, `lead-2.png`, `lead-3.png`), add one look per sprite number: `{ "label": "<short name from the artwork>", "sprite": <n> }`, and a `defaultLooks` list with all of them (the current behavior, now selectable).
   - When the pack gets a tint mode, add 2 or 3 accent looks (`{ "label": "Ember", "accent": "#f2a33a" }`, one per accent of the palette) and `defaultLooks` with all of them. Combine `sprite` and `accent` in one look when both apply.
   - Skip themes with a single sprite per role and no tint mode.

Do not change icon files except the `currentColor` replacement above. Do not rename a theme. When a theme is ambiguous, stop and report it instead of guessing.

## Checks

3. Extend `tools/check.mjs` and run it. It also fails when: `variants` has more than 12 entries, a variant key does not match `^[a-z0-9-]{1,32}$`, a color is not `#rrggbb` or its key is unknown, `accent` is invalid, `pack.json` is over 4 KB, invalid JSON, or has a `tint` other than `svg`, `hue`, `none`, a `hue` outside 0..359, `tint` is `svg` but no SVG uses `currentColor`, a look has an invalid `sprite` (not an integer 1 to 99, or no icon file with that number for any role), an invalid `accent`, or a key of `defaultLooks` that is not in `looks`, or the contrast of `TEXT` on `PANEL` or `SCREEN` is under 4.5 in the theme or in any variant.
4. Check at least 3 themes on the page: install them from the Marketplace list, click each swatch, press Preview, and report with a screenshot description that the icons keep their look (tint `none`) or take the accent (tint `svg` or `hue`).

## Docs and PR

5. Update `README.md`: the table gets a column "Variants" (labels) and "Accent" (yes when a tint mode is set); the layout section for contributors lists `variants`, `accent` and `icons/pack.json`.
6. Update `install.md` ("Create a theme"): the metadata fields, variants, accent and the three tint modes with their rule of choice.
7. Commit in two commits (the `theme.json` (variants, accent, looks) and `pack.json` changes, then `check.mjs`, README and `install.md`). Push and open the PR with: the list of themes with their tint mode, the variants added per theme, and any theme left without accent.
