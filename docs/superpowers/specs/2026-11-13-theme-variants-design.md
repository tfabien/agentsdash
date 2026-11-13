# Theme variants, color editor and icon accent (design)

Date: 2026-11-13. Status: awaiting approval.

## Intent

A theme is one fixed palette today. Users want to (1) pick a color variation of a theme and its icon pack, (2) edit the colors to make their own variant, (3) set an accent color that tints the drawn icons, mainly for minimal and line-style packs.

## Goals

- A theme can declare named variants. The theme dialog shows one swatch per variant and a click applies it.
- A color editor in the theme dialog changes any of the 17 `COLOR_KEYS` plus the icon accent, with a live preview. The result can be saved as a user theme.
- An accent color tints icons through two mechanisms, chosen per pack: SVG zones (`currentColor`) and hue rotation for PNG/raster packs.
- Existing themes and packs keep working unchanged.

## Non-goals

- No automatic variant generation (hue shift or luminosity inversion of a whole theme).
- No per-agent or per-role accent. One accent per applied variant.
- No change to the physical device screen (themes are page-only today).
- No recoloring editor for pack artwork itself.

## Anti-goals

- A variant that makes text unreadable should not be silently applied: the editor shows a contrast warning for TEXT on PANEL and SCREEN, it does not block.
- Marketplace themes must not need a new install flow: variants live inside the theme file.

## Constraints

- `theme_schema.js` is shared by hub and page and has no imports. `validateTheme` must stay tolerant: invalid variants are ignored and listed in `ignored`.
- Hub settings are shared by all pages (`hub-settings.json`). Choice and overrides must be stored there.
- File limits stay: theme file under 256 KB.
- Raster packs are 2x/3x PNG, animated GIF/WebP via `ImageDecoder`. Hue rotation must work on those (canvas `filter` or per-pixel pass, builder's choice) and must not break animation.
- Code comments and UI text in English, docs in English.

## Approaches considered

- **A. Variants inside the theme file (chosen).** `variants` and `accent` in the JSON. User edits stored as hub setting overrides, exportable as a user theme file. Authors control quality, marketplace stays one repo per theme.
- B. A variant is a separate theme file linked by `base`. No schema change, but the catalog and marketplace fill with near-duplicates.
- C. Variants computed by the hub (hue shift, inversion). No author work, but results are uncontrolled and often ugly.

Chosen by the user: A. Icon accent: both SVG zones and hue rotation for PNG (user answer), chosen per pack.

## Design

### Theme file

```json
{ "name": "cat", "iconPack": "cat", "accent": "#e8903a",
  "colors": { "...": "..." },
  "variants": {
    "dark":  { "label": "Dark",  "colors": { "SCREEN": "#000000" }, "accent": "#6e7bf2" },
    "light": { "label": "Light", "colors": { "SCREEN": "#f6f8fa" } }
  } }
```

- `accent`: optional `#rrggbb`, the icon tint. Missing: no tint.
- `variants`: optional object keyed by `a-z0-9-` (1 to 32). Each has optional `label`, `colors` (partial, merged over the base colors) and `accent` (falls back to the theme accent). Max 12 variants.
- The effective palette of a variant is: built-in defaults, then theme `colors`, then variant `colors`.

### Pack tint mode

An optional `icons/<pack>/pack.json`: `{ "tint": "svg" | "hue" | "none" }`. Default `none`, so existing packs are unchanged.

- `svg`: the page fetches the SVG text, replaces `currentColor` with the accent, then draws it. Pack authors mark tintable zones with `currentColor`.
- `hue`: the raster is drawn with a hue rotation from a reference hue to the accent hue. `pack.json` may give `"hue": <degrees>` as the artwork's base hue (default 0, so the rotation equals the accent's hue).
- `none`: accent ignored.
- The canvas fallback drawing of `robot` ignores the accent.

### State and storage

- Hub settings gain `themeVariant` (string, variant key, empty for the base) and `themeOverrides` (object keyed by `<theme>` for the base or `<theme>/<variant>`, then `{ colors, accent }`, validated like a variant). The page applies: theme, then variant, then the override of that exact key. An edit on "dark" never touches "light". (Builder-check call.)
- "Reset" removes the override of the current theme and variant key only.
- "Save as theme" writes a user theme file `~/.claude/standup-bot/themes/<name>.json` through a new hub route (`POST /themes`), with the base, the chosen variant and the overrides flattened into `colors` and `accent`. The name is user typed and validated by the existing `NAME` rule. (Builder-check call.) Name rules: a built-in name is refused (same as `market_install.mjs`), a name installed from the marketplace is refused (the 6 hour auto-update would revert it), the name of an existing user theme is overwritten after an explicit confirm.
- `market_install.mjs` `iconFiles()` also copies `pack.json` so marketplace packs can declare a tint mode. (Builder-check call: one filter line, not a new flow.)
- A per-project rule that swaps the icon pack keeps the theme accent: it tints the rule's pack according to that pack's own `tint` mode. (Builder-check call.)
- `robot` is now a file pack in the working tree (PNG), so it follows the same `pack.json` rule as any pack. The old canvas drawing stays only as the fallback. Default mode `none`. (Builder-check call: verify with the catalog at build time.)

### UI

- Built on the theme view v2 (`theme_list.js`, spec `2026-11-13-theme-view-v2-design.md`): one searchable list of cards with status, Apply, Preview, Delete. The variants UI adds to those cards and does not change them.
- Installed card: a row of variant swatches under the title (base first). Applying a variant sets `theme` and `themeVariant` together. Preview of a card previews the variant whose swatch is selected on it.
- An "Edit colors" button on the active card opens the editor in the same view, with a Back button like the settings panel: a list of the 17 keys with a color input each, an accent input, a live preview (the existing `drawPreview`), buttons Reset and Save as theme.
- A theme saved by "Save as theme" lives in the user folder, so the existing Delete button covers it. Delete also drops its `themeOverrides` and `themeVariant` entries.
- A contrast warning (WCAG ratio under 4.5) for TEXT on PANEL and on SCREEN.
- Existing "Reload" and marketplace tabs are untouched.

### Validation

`validateTheme` returns `variants` and `accent` after validation. Invalid hex or keys are dropped and named in `ignored`. A new shared helper `resolvePalette(theme, variantKey, overrides)` lives in `theme_schema.js` so hub and page agree.

### Docs

`docs/themes.md` documents `accent`, `variants`, `pack.json` and the editor. The `install-theme` skill and the marketplace install guide mention variants.

## Left to the builder

- Hue rotation technique for raster and animated images.
- Exact layout and styling of swatches and the editor.
- Test layout (unit tests for `validateTheme`, `resolvePalette`, and the settings route).
- Whether `POST /themes` reuses the existing market install path.
- Which built-in or bundled packs get a `pack.json` and `currentColor` SVGs first (a minimal or line pack is the natural first target).
