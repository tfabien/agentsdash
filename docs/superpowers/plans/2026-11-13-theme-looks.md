# Theme looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A theme declares `looks` (sprite number and/or accent); the user ticks the active ones and each agent draws with one of them, chosen by a hash of its id.

**Architecture:** `theme_schema.js` validates `looks` and `defaultLooks` and resolves the active list. `applyTheme` hands that list to `icon_packs.js` (`setLooks`), whose `svgPack.draw` picks a look from the existing `agentId` argument with the same hash as `variantKey`. A new hub setting `themeLooks` stores the user's ticks. No signature of `pack.draw` changes.

**Tech Stack:** Node >= 18 stdlib, ES modules, canvas 2D, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-13-theme-looks-design.md` (extends `2026-11-13-theme-variants-design.md`, merged).

## Global Constraints

- Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` (a directory argument fails on Node 24).
- `theme_schema.js` has no imports and runs in Node and in the browser.
- Look keys match `^[a-z0-9-]{1,32}$`, at most 12 looks per theme. `sprite` is an integer 1 to 99. `accent` is `#rrggbb`.
- `themeLooks` follows `themeOverrides` rules: at most 64 keys, whole value refused when any entry is invalid.
- A theme without `looks` behaves exactly as today (hash over all numbered files, theme or variant accent).
- Do not stage unrelated working-tree files: add files by path, never `git add -A`.
- Code comments, docs and UI text in English. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- `looks` entry with a bad `sprite` (0, 100, 1.5, "2") or bad accent: dropped and listed in `ignored`, the theme still loads (Task 1).
- `themeLooks` names looks that the theme no longer has, or an empty list: falls back to the author default, then to all looks (Task 1).
- A role that has no file for the look's sprite number: draws its unnumbered file, never nothing (Task 3).
- An agent without id (`agentId` undefined) with several active looks: uses the first active look, no crash (Task 3).
- A look accent on a pack whose tint mode is `none`: icons keep their colors (Task 3).

---

### Task 1: Schema (looks, default looks, active list)

**Files:**
- Modify: `plugin/hub/web/theme_schema.js`
- Test: `plugin/hub/test/theme_variants.test.mjs`

**Interfaces:**
- Produces (exported from `theme_schema.js`):
  - `validateTheme` result `theme` also carries `looks: Record<string, {label: string, sprite: number|null, accent: string}>` (empty object when absent; `accent` is `''` when absent) and `defaultLooks: string[]` (only keys present in `looks`). Invalid entries and entries beyond 12 go to `ignored` as `looks.<key>` or `looks.<key>.<field>`; an invalid `sprite` or `accent` drops only that field.
  - `activeLooks(theme: object, chosen?: string[]): {key: string, sprite: number|null, accent: string}[]`: looks in declaration order. Uses `chosen` when it names at least one existing look, else `theme.defaultLooks` when non-empty, else every look. Empty array when the theme has no looks.

- [ ] **Step 1: Write failing tests** in `theme_variants.test.mjs`: `validateTheme_keeps_looks_and_default_looks`, `validateTheme_drops_bad_look_fields_and_lists_them`, `validateTheme_caps_looks_at_12`, `validateTheme_default_looks_keep_only_existing_keys`, `activeLooks_prefers_chosen_then_default_then_all`, `activeLooks_ignores_unknown_chosen_keys`, `activeLooks_is_empty_without_looks`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/theme_variants.test.mjs`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** both in `theme_schema.js`, reusing `NAME`, `HEX` and the variants validation style.
- [ ] **Step 4: Run** `node --test plugin/hub/test/theme_variants.test.mjs plugin/hub/test/themes.test.mjs plugin/hub/test/themes_loader.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add plugin/hub/web/theme_schema.js plugin/hub/test/theme_variants.test.mjs && git commit -m "Themes: looks and default looks in the schema"`.

### Task 2: Hub setting `themeLooks` and saved themes

**Files:**
- Modify: `plugin/hub/hub.mjs` (`SETTING_RULES`, `SETTING_DEFAULTS`, the `POST /market/remove` handler), `plugin/hub/market_install.mjs` (`saveUserTheme`)
- Test: `plugin/hub/test/hub.test.mjs`

**Interfaces:**
- Consumes: `validateTheme`, `activeLooks` (Task 1).
- Produces:
  - Setting `themeLooks: Record<string, string[]>`, default `{}`. Keys match the theme name rule, values are arrays of look keys (`^[a-z0-9-]{1,32}$`, at most 12 each); at most 64 keys; the whole value is refused when invalid.
  - `saveUserTheme` writes `looks` (from the base theme) and `defaultLooks` (the looks active for that theme: `activeLooks(theme, chosen)` keys) when the base theme has looks; new optional parameter `looks: string[]` (chosen keys). The `POST /themes` body accepts `looks` and passes it.
  - `POST /market/remove` also deletes the `themeLooks` entry of the removed theme.

- [ ] **Step 1: Write failing tests**: `settings_accept_theme_looks_and_refuse_invalid_ones`, `post_themes_saves_looks_and_the_active_ones_as_default`, `market_remove_clears_theme_looks_of_that_theme`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/hub.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the rule next to `validOverrides`, the `saveUserTheme` change and the removal cleanup.
- [ ] **Step 4: Run** `node --test plugin/hub/test/hub.test.mjs plugin/hub/test/market_install.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add plugin/hub && git commit -m "Hub: themeLooks setting, looks in saved themes"`.

### Task 3: Per-agent look in the renderer

**Files:**
- Modify: `plugin/hub/web/icon_packs.js` (`variantKey`, `svgPack`, new `setLooks`), `plugin/hub/web/themes.js` (`applyTheme`), `plugin/hub/web/hub_page.js` (saved looks, `applySaved`)
- Test: `plugin/hub/test/themes.test.mjs`

**Interfaces:**
- Consumes: `activeLooks` (Task 1), settings `themeLooks` (Task 2).
- Produces:
  - `setLooks(looks: {key, sprite, accent}[]): void` in `icon_packs.js` (empty array clears). Module state next to `accent`.
  - `lookFor(looks, agentId): {key, sprite, accent} | null` (exported): `null` for an empty list, the first look when `agentId` is falsy, else `looks[hashOf(String(agentId)) % looks.length]`.
  - `variantKey(roles, key, agentId, sprite?)`: when `sprite` is given, returns `key` for 1 and `key-<sprite>` for n when `roles` has that file, else `key`. Without `sprite`, behavior unchanged.
  - `svgPack.draw` uses `lookFor(looks, agentId)`: its `sprite` goes to `variantKey`, its `accent` (when non-empty) replaces the global accent for that draw (tint modes `svg` and `hue` as before; `none` ignores it).
  - `applyTheme(theme, variantKey = '', overrides = {}, chosenLooks)`: calls `setLooks(activeLooks(t, chosenLooks))`. `hub_page.js` keeps `savedLooks` from `settings.themeLooks`, passes `savedLooks[theme]`; preview passes nothing (author default).

- [ ] **Step 1: Write failing tests** in `themes.test.mjs`: `lookFor_is_stable_per_agent_and_uses_every_look`, `lookFor_without_agent_id_uses_the_first_look`, `variantKey_with_sprite_picks_the_numbered_file_or_falls_back`, `svgPack_look_sprite_draws_the_numbered_file`, `svgPack_look_accent_sets_the_hue_filter_for_that_agent`, `svgPack_look_accent_is_ignored_in_tint_none`, `applyTheme_sets_the_active_looks_from_chosen_then_default`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/themes.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** as above. Reuse `hashOf` and the existing `paint` helper.
- [ ] **Step 4: Run** `node --test plugin/hub/test/themes.test.mjs plugin/hub/test/web.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add plugin/hub/web plugin/hub/test && git commit -m "Page: pick a look per agent from the active looks"`.

### Task 4: Theme view (look checkboxes and spread preview)

**Files:**
- Modify: `plugin/hub/web/theme_list.js` (`mergeCards`), `plugin/hub/web/theme_dialog.js` (card, `drawPreview`, `update`), `plugin/hub/web/footer.js` (the `themes.update(...)` call), `plugin/hub/web/settings.css`
- Test: `plugin/hub/test/theme_list.test.mjs`

**Interfaces:**
- Consumes: `activeLooks` (Task 1), `setLooks`, `lookFor` (Task 3), setting `themeLooks` (Task 2).
- Produces:
  - `mergeCards` installed cards carry `looks: {key, label}[]` and `activeLooks: string[]` (keys, from `activeLooks(theme, chosen)`); `mergeCards` takes a new optional `looks` argument (the `themeLooks` setting). Available cards: `looks: []`, `activeLooks: []`.
  - Card: a "Looks" row of toggle chips under the palette swatches, shown when `looks.length > 1`. A click posts `themeLooks` merged with the existing object; at least one look stays active (the last one cannot be unticked).
  - `drawPreview(canvas, theme, accent, looks)` sets the card's active looks for the drawing (`setLooks`, restored after) and passes `p<role>` as agent id so the eight agents spread over the looks.
  - `themes.update(name, variant, edits, looks)`.

- [ ] **Step 1: Write failing tests**: `installed_cards_carry_looks_and_their_active_keys`, `available_cards_have_no_looks`, `mergeCards_active_looks_follow_the_setting_then_the_default`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/theme_list.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the pure part, then the card row and preview. Read the variant swatches code in `theme_dialog.js` first and reuse its helpers and class names.
- [ ] **Step 4: Run** `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`. Expected: PASS. Then run a hub with a temp user folder holding a theme with 3 looks (as in the earlier smoke script), open the theme view, tick and untick looks, and report what was seen.
- [ ] **Step 5: Commit** `git add plugin/hub/web plugin/hub/test && git commit -m "Page: look checkboxes and spread preview"`.

### Task 5: Docs, example theme, skill and migration prompt

**Files:**
- Modify: `docs/themes.md`, `plugin/skills/install-theme/SKILL.md`, `docs/superpowers/theme-variants-migration-prompt.md`, `plugin/hub/themes/line.json`, `CLAUDE.md`

- [ ] **Step 1: Document** in `docs/themes.md`: `looks`, `defaultLooks`, the sprite number rule, the setting `themeLooks`, the per-agent hash, the look checkboxes; mention that `Save as theme` writes the active looks as `defaultLooks`.
- [ ] **Step 2: Add** to `line.json`: `looks` `classic` (no accent), `ember` (`#f2a33a`), `mint` (`#2fb5a5`), and `defaultLooks` `["classic","ember","mint"]`. Check on the page that the eight agents show 3 accents.
- [ ] **Step 3: Update** the skill (creation step) and the migration prompt (offer `looks` for themes with several numbered sprites per role: one look per sprite number, `sprite` field; accent looks for tint packs; set `defaultLooks`), and the `CLAUDE.md` themes sentence.
- [ ] **Step 4: Run** `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` and `claude plugin validate plugin`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add docs plugin/skills plugin/hub/themes/line.json CLAUDE.md && git commit -m "Docs: theme looks, example in the line theme"`.

## Self-review

- Spec coverage: `looks` and `defaultLooks` with validation and fallbacks (Task 1), `themeLooks` and saved themes (Task 2), hash pick per agent, sprite and accent, compatibility without looks (Task 3), checkboxes and preview spread (Task 4), docs and example (Task 5).
- Types: `activeLooks` returns `{key, sprite, accent}` (Tasks 1, 3, 4). `lookFor` and `setLooks` (Task 3) are used by `drawPreview` (Task 4). `themeLooks` is `Record<theme, string[]>` everywhere.
- Open for the executor: unticking the last look is blocked in the UI only, the setting accepts an empty list and falls back to the default.
