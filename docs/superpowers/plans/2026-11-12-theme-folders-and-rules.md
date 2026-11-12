# Theme folders, SVG icon packs and per-project rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load themes (JSON) and icon packs (SVG) from files, migrate the built-ins to that format, and let per-project rules override the icon pack and badge color.

**Architecture:** A hub module scans built-in and user folders, validates, publishes a `catalog` in `state` and serves SVG with a sandbox header. The page reads the catalog, draws SVG via `Image` (robot canvas drawing stays as fallback). `notify.mjs` adds `cwd`; a rule matcher picks pack and badge color per session.

**Tech Stack:** Node >= 18 stdlib, browser ES modules, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-theme-folders-and-rules-design.md`

## Global Constraints

- Node >= 18, stdlib only; hub binds 127.0.0.1, no CORS.
- Third-party SVG never runs scripts: `Content-Type: image/svg+xml` + `Content-Security-Policy: sandbox`, loaded with `Image`.
- Icons drawn in a `0 0 36 42` viewBox; roles `lead general explore plan review test code generic` = 0..7.
- Missing color key keeps the built-in value; missing icon falls back to the `robot` pack.
- Code comments, docs and on-screen text in English.
- Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`.

## Review Focus

- A theme file with invalid JSON or a bad name is skipped, the other themes still load.
- A pack folder with a subset of the 8 icons: the missing roles draw the robot.
- An SVG containing `<script>` or `onload` is served sandboxed and never executed.
- A rule with an unknown `iconPack` or a bad `badgeColor` is rejected by `/settings`; a session without `cwd` matches no rule.
- Windows paths (`C:\Work\Prod-api`) match a rule written with forward slashes, case-insensitive.

---

### Task 1: Rule matcher

**Files:**
- Create: `plugin/hub/rules.mjs`
- Test: `plugin/hub/test/rules.test.mjs`

**Interfaces:**
- Produces: `matchRule(rules: Rule[], cwd: string): Rule | null` and `validRules(v: unknown): boolean`, `type Rule = { match: string, iconPack?: string, badgeColor?: string }`. `match` is a path prefix or a glob (`*`, `?`, `**`); slashes normalized, case-insensitive; first match wins; empty or missing `cwd` returns null.

- [ ] **Step 1: Write tests** `matches_path_prefix`, `matches_glob_star`, `first_rule_wins`, `windows_path_matches_forward_slash_rule`, `no_cwd_matches_nothing`, `validRules_rejects_bad_color_and_non_array` (badgeColor must match `/^#[0-9a-f]{6}$/i`).
- [ ] **Step 2: Run** `node --test plugin/hub/test/rules.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** both functions; glob to anchored RegExp, a plain path also matches its sub-folders.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: project rule matcher (#16)"`.

### Task 2: cwd in events, rules in settings

**Files:**
- Modify: `plugin/scripts/notify.mjs:115` (add `cwd` field, path only, honor `CLAUDE_GADGET_MASK`), `plugin/hub/model.mjs` (keep `cwd` per session, expose in `toState`), `plugin/hub/hub.mjs:27-28,159` (`SETTING_RULES.rules = validRules`, default `[]`, update the 400 message)
- Test: `plugin/test/notify.test.mjs`, `plugin/hub/test/hub.test.mjs`, `plugin/hub/test/model.test.mjs` (existing files, add cases)

**Interfaces:**
- Consumes: `validRules` (Task 1).
- Produces: session state field `cwd: string`; `settings.rules: Rule[]`.

- [ ] **Step 1: Write tests** `event_carries_cwd`, `settings_accept_valid_rules_and_reject_invalid` (POST `/settings` `{rules:[{match:'/w/prod-*',badgeColor:'#ff0000'}]}` is 200; `badgeColor:'red'` is 400), `state_session_has_cwd`.
- [ ] **Step 2: Run** the three files. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the three edits. `cwd` stays out of what `forDevice` sends to relays.
- [ ] **Step 4: Run** the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `"Plugin and hub: cwd in events, rules setting (#16)"`.

### Task 3: Theme and icon loader

**Files:**
- Create: `plugin/hub/themes_loader.mjs`, `plugin/hub/theme_schema.mjs` (the validation moved from `web/themes.js`, shared by hub and page: `validateTheme`, `ROLE_FILES`)
- Modify: `plugin/hub/web/themes.js` (import `validateTheme` from `./theme_schema.js` copy served statically: keep the file under `web/` and import it from the hub with a relative path)
- Test: `plugin/hub/test/themes_loader.test.mjs`

**Interfaces:**
- Produces: `loadCatalog({ builtinDir, userDir }): { themes: Theme[], packs: { name: string, roles: Record<string,string> }[], errors: string[] }` where `roles` maps role file name to a `/icons/<pack>/<file>.svg` URL; user entries override built-ins of the same name; invalid files are listed in `errors` and skipped.

- [ ] **Step 1: Write tests** `loads_builtin_and_user_themes`, `user_overrides_builtin_of_same_name`, `invalid_json_and_bad_name_are_skipped_with_error`, `pack_with_subset_of_roles_lists_only_present_files`, `missing_directories_give_empty_catalog`, `unknown_icon_pack_in_theme_falls_back_to_robot`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** `loadCatalog` with `fs.readdirSync`; only `*.json` themes and `*.svg` icons, file size cap 256 KB.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Hub: theme and icon pack loader (#16)"`.

### Task 4: Hub serving, catalog in state, reload

**Files:**
- Modify: `plugin/hub/hub.mjs` (`opts.userDir ?? ~/.claude/standup-bot`, catalog loaded at start, `catalog` added to `stateJson`, `POST /reload` reloads and publishes, `GET /icons/<pack>/<file>.svg` served from the resolved folder with the sandbox header, path traversal blocked)
- Test: `plugin/hub/test/hub.test.mjs`

**Interfaces:**
- Consumes: `loadCatalog` (Task 3).
- Produces: `state.catalog`; route `GET /icons/:pack/:file`.

- [ ] **Step 1: Write tests** `state_has_catalog`, `reload_picks_up_a_new_theme_file`, `svg_served_with_sandbox_csp_and_svg_mime`, `icon_path_traversal_is_404`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/hub.test.mjs`. Expected: FAIL on new cases.
- [ ] **Step 3: Implement.** Serve only names the catalog lists, so no filesystem path comes from the URL.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Hub: serve icon packs, catalog in state, POST /reload (#16)"`.

### Task 5: Built-in migration to files

**Files:**
- Create: `plugin/hub/tools/export_builtin.mjs`, `plugin/hub/themes/{default,cat,lemmings,office,pirates}.json`, `plugin/hub/icons/<pack>/<role>.svg` (+ `<role>-blink.svg`) for the 5 packs
- Test: `plugin/hub/test/builtin_themes.test.mjs`

**Interfaces:**
- Consumes: current `THEMES` and `ICON_PACKS` (`web/themes.js`, `web/icon_packs.js`).
- Produces: files read by `loadCatalog`; `svgContext(): { ctx, toSvg(): string }` recording a 2D context (beginPath, moveTo, lineTo, roundRect, arc, ellipse, fill, stroke, fillStyle, strokeStyle, lineWidth, save/restore/translate) that emits `<path>`/`<rect>`/`<circle>` elements.

- [ ] **Step 1: Write tests** `every_builtin_theme_json_validates_and_equals_the_old_table`, `every_pack_has_8_role_svgs_and_8_blink_svgs`, `svgs_have_viewbox_36x42_and_no_script`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the exporter, run `node plugin/hub/tools/export_builtin.mjs`, commit generated files. Eyeball one SVG per pack in the browser against the canvas version.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Themes: export the built-in themes and packs as files (#16)"`.

### Task 6: Page reads the catalog, draws SVG icons

**Files:**
- Modify: `plugin/hub/web/themes.js` (`setCatalog(catalog)`, `THEMES` becomes a fallback for `default` only, `applyTheme` takes a name from the catalog), `plugin/hub/web/icon_packs.js` (`svgPack(name, roles)` returning `{ label, draw(ctx, role, blink) }` using cached `Image`s; `iconPack(name)` resolves catalog pack first, then canvas `robot`), `plugin/hub/web/theme_dialog.js` (list the catalog, rebuild cards on catalog change), `plugin/hub/web/hub_page.js:253` (call `setCatalog(next.catalog)` before `applyTheme`), `plugin/hub/web/hub_page.js` redraw when an image finishes loading
- Test: `plugin/hub/test/themes.test.mjs`

**Interfaces:**
- Consumes: `state.catalog` (Task 4).
- Produces: `setCatalog(catalog)`, `iconPackFor(name): Pack`.

- [ ] **Step 1: Write tests** `setCatalog_adds_a_theme_and_applyTheme_uses_it`, `unknown_pack_gives_robot`, `svg_pack_missing_role_draws_robot` (stub `Image`, assert fallback `draw` called).
- [ ] **Step 2: Run** `node --test plugin/hub/test/themes.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Drawing an image not yet loaded draws the robot for that frame.
- [ ] **Step 4: Run** the full suite and open the page: switch between default, cat, lemmings, office, pirates. Expected: PASS, same looks as before.
- [ ] **Step 5: Commit** `"Page: themes and icon packs from the hub catalog (#16)"`.

### Task 7: Per-session pack and badge color

**Files:**
- Modify: `plugin/hub/web/hub_page.js` and `plugin/hub/web/vector_screen.js:13-17,70` (draw with the pack of the session's rule, default the theme's), `plugin/hub/web/screen.js:19,298-304` (`projectColors(name, override?)`: `badgeColor` replaces the chip bg, fg picked for contrast, text stays the project name), `plugin/hub/web/settings.js` (rules editor: list of rows match / pack select / color input, saved with `postSettings({ rules })`)
- Test: `plugin/hub/test/screen.test.mjs`, `plugin/hub/test/vector_screen.test.mjs`

**Interfaces:**
- Consumes: `matchRule` (Task 1) is also imported by the page (`rules.mjs` copied or shared like `theme_schema`), `iconPackFor` (Task 6).
- Produces: `projectColors(name: string, badgeColor?: string): { bg, fg }`.

- [ ] **Step 1: Write tests** `badge_color_override_replaces_chip_background`, `badge_text_stays_project_name`, `session_with_rule_uses_rule_pack`, `session_without_match_uses_theme_pack`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.** Frame, panel, text and state colors never change per session.
- [ ] **Step 4: Run** the full suite; with a rule `{match:'**/artillery*', iconPack:'cat', badgeColor:'#c0392b'}` check in the browser that only the matching session changes. Expected: PASS.
- [ ] **Step 5: Commit** `"Page: per-project icon pack and badge color (#16)"`.

### Task 8: Docs

**Files:**
- Modify: `docs/themes.md`, `README.md` (one line), `CLAUDE.md` (Layout: `themes/`, `icons/`, `rules.mjs`, `themes_loader.mjs`)

- [ ] **Step 1: Rewrite** `docs/themes.md`: theme JSON format, icon pack folder and file names, drop-in folders, `POST /reload`, rules with an example (`prod-*` red badge), security note, removal of the "Not done yet" paragraph.
- [ ] **Step 2: Run** `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` and `claude plugin validate plugin`. Expected: all pass.
- [ ] **Step 3: Commit** `"Docs: themes, icon packs and rules (#16)"`.
