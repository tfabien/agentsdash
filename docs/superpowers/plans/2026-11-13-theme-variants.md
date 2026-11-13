# Theme variants, color editor and icon accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Themes get named color variants, an in-page color editor that can save a user theme, and an accent color that tints icons.

**Architecture:** `theme_schema.js` (shared, no imports) validates `accent` and `variants` and resolves a palette. The hub stores the choice (`themeVariant`, `themeOverrides`) in shared settings and exposes `POST /themes` to save a variant as a user theme. The page applies theme, then variant, then override, and the icon renderer tints SVG (`currentColor`) or raster (`ctx.filter` hue rotation) icons according to the pack's `pack.json`.

**Tech Stack:** Node >= 18 stdlib, ES modules, canvas 2D in the browser, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-13-theme-variants-design.md` (builds on `2026-11-13-theme-view-v2-design.md`).

## Global Constraints

- Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` (a directory argument fails on Node 24).
- `theme_schema.js` has no imports and runs in Node and in the browser.
- Colors are `#rrggbb` (regex `^#[0-9a-fA-F]{6}$`), stored lower case. Names match `^[a-z0-9-]{1,32}$`.
- Max 12 variants per theme. Theme file under 256 KB.
- Settings are shared by all pages (`hub-settings.json`), validated by `SETTING_RULES` in `hub.mjs`.
- Existing themes and packs without `accent`, `variants` or `pack.json` behave exactly as before.
- Code comments, docs and UI text in English. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A variant lists a key outside `COLOR_KEYS` or a bad hex: the key is dropped and named in `ignored`, the theme still loads (Task 1).
- `themeOverrides` holds a key for a theme or variant that no longer exists: it is ignored, nothing throws (Task 4).
- The accent is set but the pack mode is `none` or the pack has no `pack.json`: icons draw exactly as before (Task 4).
- A raster icon is an animated GIF/WebP: the hue filter applies to each frame and the animation keeps running (Task 4).
- `POST /themes` with a built-in name, a marketplace-installed name, or an existing user name without `overwrite`: refused, no file written (Task 3).

---

### Task 1: Schema (accent, variants, palette resolution)

**Files:**
- Modify: `plugin/hub/web/theme_schema.js`
- Create: `plugin/hub/test/theme_variants.test.mjs`

**Interfaces:**
- Produces (all exported from `theme_schema.js`):
  - `validatePalettePart(raw: unknown): { colors: Record<string,string>, accent: string|undefined, ignored: string[] }`, valid keys and hex only, `accent` only when valid hex.
  - `validateTheme` result `theme` now also carries `accent: string` (empty string when absent) and `variants: Record<string, {label: string, colors: object, accent: string}>` (empty object when absent; invalid variant names and entries beyond 12 are dropped and added to `ignored` as `variants.<name>`).
  - `resolvePalette(theme: object, variantKey: string, override?: {colors?: object, accent?: string}): { colors: Record<string,string>, accent: string }`: order is theme `colors`, variant `colors`, override `colors`; accent is override, then variant, then theme, else `''`. An unknown `variantKey` is treated as the base.
  - `hueOf(hex: string): number`, degrees 0 to 359 (0 for greys).
  - `contrastRatio(hexA: string, hexB: string): number`, WCAG relative luminance ratio, 1 to 21.

- [ ] **Step 1: Write failing tests** in `theme_variants.test.mjs`: `validateTheme_keeps_accent_and_variants`, `validateTheme_drops_bad_variant_keys_and_lists_them_in_ignored`, `validateTheme_caps_variants_at_12`, `resolvePalette_orders_theme_variant_override`, `resolvePalette_unknown_variant_is_the_base`, `resolvePalette_accent_falls_back_override_variant_theme`, `hueOf_pure_colors` (`#ff0000` 0, `#00ff00` 120, `#0000ff` 240, `#808080` 0), `contrastRatio_black_on_white_is_21`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/theme_variants.test.mjs`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the four exports and extend `validateTheme` in `theme_schema.js`. Reuse the existing `HEX` and `NAME` constants and the `COLOR_KEYS` loop.
- [ ] **Step 4: Run** the same command plus `node --test plugin/hub/test/themes.test.mjs plugin/hub/test/themes_loader.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add plugin/hub/web/theme_schema.js plugin/hub/test/theme_variants.test.mjs && git commit -m "Themes: accent, variants and palette resolution in the schema"`.

### Task 2: Pack tint mode (`pack.json`) in the loader and the marketplace install

**Files:**
- Modify: `plugin/hub/themes_loader.mjs` (`scanPacks`), `plugin/hub/market_install.mjs` (`iconFiles`, the download loop)
- Test: `plugin/hub/test/themes_loader.test.mjs`, `plugin/hub/test/market_install.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: catalog pack entries become `{ name, roles, tint: 'svg'|'hue'|'none', hue: number }`. `tint` defaults to `'none'`, `hue` to `0`. `pack.json` is `{ "tint"?: string, "hue"?: number }`; an unknown `tint` value gives `'none'`, `hue` is clamped to 0..359, a file over 4 KB or invalid JSON is skipped with an entry in `errors`.

- [ ] **Step 1: Write failing tests**: `loader_reads_pack_json_tint_and_hue`, `loader_defaults_to_tint_none_without_pack_json`, `loader_ignores_unknown_tint_value`, `loader_reports_invalid_pack_json_and_keeps_the_pack`; in `market_install.test.mjs`: `install_copies_pack_json_of_a_theme` (the fake GitHub fixture lists `icons/pack.json`; assert the file exists under `<userDir>/icons/<pack>/pack.json`).
- [ ] **Step 2: Run** `node --test plugin/hub/test/themes_loader.test.mjs plugin/hub/test/market_install.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the `pack.json` read in `scanPacks`, and let `iconFiles` accept the exact name `icons/pack.json` (download cap 4 KB, not counted as an icon).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Packs: pack.json tint mode in the loader and the marketplace install"`.

### Task 3: Hub settings and `POST /themes`

**Files:**
- Modify: `plugin/hub/hub.mjs` (`SETTING_RULES`, `SETTING_DEFAULTS`, route switch near `POST /market/remove`, the removal handler), `plugin/hub/market_install.mjs` (new `saveUserTheme`)
- Test: `plugin/hub/test/hub.test.mjs`, `plugin/hub/test/market_install.test.mjs`

**Interfaces:**
- Consumes: `validatePalettePart`, `resolvePalette` from Task 1; `readInstalled(userDir)` from `market_install.mjs`.
- Produces:
  - Settings `themeVariant: string` (empty or `NAME`, default `''`) and `themeOverrides: Record<string, {colors?, accent?}>`. Keys match `^[a-z0-9-]{1,32}(/[a-z0-9-]{1,32})?$`, at most 64 keys, each value passed through `validatePalettePart` (stored value is the cleaned one).
  - `saveUserTheme({ name, label, theme, variant, override, userDir, builtinNames, overwrite }): { path: string }` in `market_install.mjs`. Writes `<userDir>/themes/<name>.json` with `name`, `label`, `author: 'user'`, `version: '1'`, `iconPack` of `theme`, the resolved `colors` and `accent`, and no `variants`. Throws `Error` with these messages: `"<name> is a built-in theme and cannot be replaced"`, `"<name> comes from the marketplace, pick another name"` (name present in `readInstalled`), `"<name> exists"` (existing user file, `overwrite` not true).
  - Route `POST /themes` body `{ name, label?, theme, variant?, override?, overwrite? }`. `theme` is looked up in the catalog (400 `unknown theme`). Errors from `saveUserTheme` answer 400, except `"<name> exists"` which answers 409. On success: `reloadCatalog()`, `saveSettings({ theme: name, themeVariant: '' })`, `publish()`, answer `ok`.
  - `POST /market/remove` success also deletes keys `<name>` and `<name>/*` from `themeOverrides` and resets `themeVariant` to `''` when the removed theme is the active one.

- [ ] **Step 1: Write failing tests**: in `hub.test.mjs`: `settings_accept_theme_variant_and_overrides`, `settings_drop_invalid_override_entries`, `post_themes_writes_a_user_theme_and_applies_it`, `post_themes_refuses_a_builtin_name`, `post_themes_refuses_a_marketplace_name`, `post_themes_existing_name_needs_overwrite` (409 then 200 with `overwrite: true`), `market_remove_clears_overrides_of_that_theme`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/hub.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the settings rules and defaults, `saveUserTheme` (write through a temp file then rename), the route and the removal cleanup. Follow the `jsonBody`/`text` helpers already used by the market routes.
- [ ] **Step 4: Run** `node --test plugin/hub/test/hub.test.mjs plugin/hub/test/market_install.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: theme variant and overrides settings, POST /themes"`.

### Task 4: Page rendering (palette resolution and icon tint)

**Files:**
- Modify: `plugin/hub/web/themes.js` (`applyTheme`, `setCatalog`), `plugin/hub/web/icon_packs.js` (`svgPack`, `setCatalogPacks`, `imageFor`), `plugin/hub/web/hub_page.js` (the two `applyTheme(...)` calls near lines 190 and 303, and the settings read near line 301)
- Test: `plugin/hub/test/themes.test.mjs`

**Interfaces:**
- Consumes: `resolvePalette`, `hueOf` (Task 1); pack entries with `tint`, `hue` (Task 2); settings `themeVariant`, `themeOverrides` (Task 3).
- Produces:
  - `applyTheme(theme: object|string, variantKey?: string, overrides?: object): object` in `themes.js`. Colors come from `resolvePalette` with `overrides[key]` where `key` is `theme.name` or `<theme.name>/<variantKey>`. Also calls `setAccent(accent)` (new export of `icon_packs.js`, `setAccent(hex: string): void`, clears the tinted-image cache).
  - `activeAccent(): string` in `themes.js`.
  - Tint in `svgPack.draw`: mode `svg` loads the SVG text with `fetch`, replaces every `currentColor` with the accent, and draws it from a `blob:` URL cached per `url + accent`; mode `hue` sets `ctx.filter = 'hue-rotate(<accent hue - pack hue>deg)'` inside `ctx.save()/restore()` around each `drawImage` (images and animated frames); mode `none`, a missing accent, or a missing `pack` entry draws as before. A blob not loaded yet draws the untinted image, never nothing.

- [ ] **Step 1: Write failing tests** in `themes.test.mjs`: `applyTheme_applies_variant_colors`, `applyTheme_applies_override_of_the_exact_variant_key_only` (override on `cat/dark` does not change `cat/light`), `applyTheme_ignores_overrides_of_unknown_theme_or_variant`, `activeAccent_follows_variant_then_theme`, `svgPack_hue_mode_sets_ctx_filter_with_the_hue_difference` (fake canvas from the test file records `filter`), `svgPack_none_mode_never_sets_a_filter`, `svgPack_hue_mode_filters_animated_frames_too`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/themes.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `themes.js`, `icon_packs.js` and wire `hub_page.js` so every `applyTheme` call passes `settings.themeVariant` and `settings.themeOverrides`, and a catalog or settings change redraws.
- [ ] **Step 4: Run** `node --test plugin/hub/test/themes.test.mjs plugin/hub/test/web.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Page: apply variants and overrides, tint icons with the accent"`.

### Task 5: Theme view (variant swatches, color editor, save as theme)

**Files:**
- Create: `plugin/hub/web/theme_editor.js`
- Modify: `plugin/hub/web/theme_list.js` (cards), `plugin/hub/web/theme_dialog.js` (view host and Back handling, same pattern as the marketplace Settings panel), `plugin/hub/web/hub.css` or `settings.css` (swatches, editor), `plugin/hub/web/hub_page.js` (preview of a variant, see the preview object near line 184)
- Test: `plugin/hub/test/theme_list.test.mjs`, new cases in `theme_variants.test.mjs`

**Interfaces:**
- Consumes: `resolvePalette`, `contrastRatio` (Task 1); `postSettings` from `settings.js`; `POST /themes` (Task 3); `applyTheme` (Task 4).
- Produces:
  - `createThemeEditor({ getTheme, getVariant, getOverride, onChange, onSave, onReset, onBack }): { element: HTMLElement, open(): void }` in `theme_editor.js`. Lists the 17 `COLOR_KEYS` and the accent with one `<input type="color">` each, shows a live preview with the existing `drawPreview` idea, shows a warning text `"Low contrast"` when `contrastRatio(TEXT, PANEL) < 4.5` or `contrastRatio(TEXT, SCREEN) < 4.5`, buttons Reset and Save as theme (name field validated by the `NAME` regex).
  - Installed cards with `variants` show one swatch button per variant (base first), a click calls `postSettings({ theme, themeVariant })`. The Preview button previews the selected swatch.
  - An Edit colors button on the active card opens the editor with a Back button. Edits call `postSettings({ themeOverrides })` merged with the existing object. Reset deletes the key of the current theme and variant. Save as theme calls `POST /themes`, and on 409 asks `confirm()` then retries with `overwrite: true`.

- [ ] **Step 1: Write failing tests** with the existing fake DOM helpers of `theme_list.test.mjs`: `card_shows_one_swatch_per_variant_base_first`, `clicking_a_swatch_posts_theme_and_variant`, `card_without_variants_shows_no_swatches`, `editor_lists_all_color_keys_and_the_accent`, `editor_warns_on_low_text_contrast`, `editor_reset_removes_only_the_current_key`, `editor_save_retries_with_overwrite_after_409_confirm`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/theme_list.test.mjs plugin/hub/test/theme_variants.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the editor and the card changes. Read `theme_list.js` and the Settings panel wiring in `theme_dialog.js` first and reuse their element helpers and class names.
- [ ] **Step 4: Run** the same command plus `node --test plugin/hub/test/web.test.mjs`. Expected: PASS. Then open the page (`preview_start` or `node plugin/hub/hub.mjs`), switch variants, edit a color, save a theme, delete it, and report what was seen.
- [ ] **Step 5: Commit** `git commit -m "Page: variant swatches, color editor and save as theme"`.

### Task 6: Docs and a tintable example

**Files:**
- Modify: `docs/themes.md`, `plugin/skills/install-theme/SKILL.md` (path: find it with `Glob plugin/**/install-theme/SKILL.md`), `CLAUDE.md` (the themes sentence in "Plugin and hub")
- Create: `plugin/hub/test/fixtures/` entries only if a test needs them (no shipped pack)

- [ ] **Step 1: Document** in `docs/themes.md`: `accent`, `variants` (with the JSON example from the spec), `pack.json` (`tint` values and `hue`), `currentColor` marking for SVG packs, the editor, Save as theme and its name rules, `themeVariant` and `themeOverrides`.
- [ ] **Step 2: Mention** variants and `pack.json` in the `install-theme` skill and the `CLAUDE.md` Plugin and hub paragraph.
- [ ] **Step 3: Run** the full suite `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`, then `claude plugin validate plugin`. Expected: all PASS.
- [ ] **Step 4: Commit** `git commit -m "Docs: theme variants, accent and pack.json"`.

## Self-review

- Spec coverage: variants and accent (Task 1), pack tint modes and marketplace `pack.json` (Task 2), storage keyed by `theme/variant`, name rules, delete cleanup (Task 3), rule-swapped packs keep the theme accent because tint reads the accent globally and the rule's own pack mode (Task 4), swatches, editor, contrast warning, Save as theme, Preview of a variant (Task 5), docs (Task 6). The `robot` pack follows the same `pack.json` rule with no special case.
- Types: `validatePalettePart`, `resolvePalette`, `hueOf`, `contrastRatio` (Task 1) are the names used in Tasks 3 to 5. `tint`/`hue` pack fields (Task 2) are read in Task 4.
- Open for the executor: hue filter needs Chrome or Edge (`ctx.filter`); other browsers draw untinted.
