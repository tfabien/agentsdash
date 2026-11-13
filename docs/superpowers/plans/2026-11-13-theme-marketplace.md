# Theme marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The theme dialog gets Installed and Marketplace tabs; the hub lists, installs, updates (automatically every 6 hours, or forced) and removes themes from GitHub repositories.

**Architecture:** Three hub modules with an injected `fetch` (`market_source.mjs` lists a repository, `market_install.mjs` installs and removes, `market_update.mjs` decides and schedules updates), wired into `hub.mjs` routes and two new settings. The page talks only to the hub (`web/market.js` inside `theme_dialog.js`). The loader and the local layout do not change.

**Tech Stack:** Node >= 18 stdlib (`fetch`, `fs`, `node:test`), vanilla ES modules in the page.

**Spec:** `docs/superpowers/specs/2026-11-13-theme-marketplace-design.md`

## Global Constraints

- Node >= 18, stdlib only, no new dependency. Code comments, docs and on-screen text in English.
- The hub talks only to `api.github.com` and `raw.githubusercontent.com`. Source format `owner/repo` matches `^[\w.-]+/[\w.-]+$`.
- Install limits: file types `json svg png webp gif jpg jpeg`, 256 KB per svg and per json, 1 MB per raster, at most 100 files, 20 MB total.
- Theme name `^[a-z0-9-]{1,32}$` and equal to its folder name. Icon file names follow `ICON_NAME` of `themes_loader.mjs`. `iconPack` of an installed theme is its name.
- `description` 200 characters max. `keywords` at most 8 strings of 24 characters max. `version` is dotted numbers.
- Local layout unchanged: `~/.claude/standup-bot/themes/<name>.json`, `icons/<name>/`. Install log: `<userDir>/market.json` `{ "<name>": { "source", "version", "installedAt" } }`.
- Settings: `marketSources` (array of at most 10 sources, default `["tfabien/standup-bot-themes"]`), `themeAutoUpdate` (boolean, default true). Listing cache 10 minutes. Auto-update check at start and every 6 hours.
- Existing Host and Origin checks cover every new route. Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`.

## Review Focus

- Offline, GitHub rate limit (HTTP 403 or 429), unknown repository (404): the list shows an error line for that source, other sources still load, no crash.
- Tree paths with `..`, absolute paths or backslashes: skipped, never written outside the temporary folder.
- GitHub tree with `truncated: true`: the source reports an error, no partial list.
- Theme folder name differs from `theme.name`: theme skipped with a reason in `errors`.
- A market theme named like a built-in theme (`default`): install refused.
- Two installs or an auto-update at the same time: run one after the other.
- Update fails halfway (a file 404s): the installed version stays intact.

---

### Task 1: Theme metadata in the schema

**Files:**
- Modify: `plugin/hub/web/theme_schema.js`
- Test: `plugin/hub/test/themes.test.mjs`

**Interfaces:**
- Produces: `validateTheme(raw)` returns `theme` with two more fields, `description: string` (trimmed, cut to 200, `''` when absent) and `keywords: string[]` (strings only, each cut to 24, first 8). Exports `compareVersions(a: string, b: string): number` (dotted numbers compared part by part, missing parts are 0; returns -1, 0 or 1; when either side has a non-numeric part, equal text gives 0 and different text gives 1 so `isNewer` holds).

- [ ] **Step 1: Write failing tests** in `themes.test.mjs`: `validateTheme` keeps `description` and `keywords` and cuts them (201 characters gives 200, 9 keywords gives 8, a number inside `keywords` is dropped, absent fields give `''` and `[]`); `compareVersions('1.10.0','1.2.0') === 1`, `('1.0','1.0.0') === 0`, `('1','2') === -1`, `('beta','beta') === 0`, `('beta','rc') === 1`, `('', '1') === -1`.
- [ ] **Step 2: Run** `node --test plugin/hub/test/themes.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the two fields in `validateTheme` and `compareVersions` in `theme_schema.js` (plain ES module, no imports).
- [ ] **Step 4: Run** the same command and `node --test plugin/hub/test/*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Themes: description, keywords and version compare"`.

### Task 2: List a source (`market_source.mjs`)

**Files:**
- Create: `plugin/hub/market_source.mjs`
- Test: `plugin/hub/test/market_source.test.mjs`

**Interfaces:**
- Consumes: `validateTheme`, `ROLE_FILES` from `web/theme_schema.js`.
- Produces: `SOURCE_RE`, `parseSource(text: string): string | null` (accepts `owner/repo` and `https://github.com/owner/repo(.git)`, returns `owner/repo`), and `listSource(source: string, fetchFn = fetch): Promise<{ themes: MarketTheme[], errors: string[] }>` where `MarketTheme = { source, name, label, description, keywords, author, version, preview: string | null, files: string[] , branch }`. `files` are tree paths inside `<name>/` (relative to the theme folder, `theme.json` excluded); `preview` is `https://raw.githubusercontent.com/<source>/<branch>/<name>/<preview file>`.

- [ ] **Step 1: Write failing tests** with a fake `fetchFn` that answers `GET https://api.github.com/repos/o/r` (`{default_branch:'main'}`), `.../git/trees/main?recursive=1` (`{tree:[{path,type,size}], truncated}`) and `https://raw.githubusercontent.com/o/r/main/<name>/theme.json`. Cases: two themes listed with metadata and preview URL; a folder without `theme.json` ignored; folder name differing from `theme.name` gives an error and no entry; `truncated: true` gives `errors` and `themes: []`; HTTP 404, 403 and a thrown network error each give one error line and `themes: []`; a tree path containing `..` or `\` is dropped from `files`; `parseSource` cases (`https://github.com/a/b.git` gives `a/b`, `a/b/c` gives `null`, `a b/c` gives `null`).
- [ ] **Step 2: Run** `node --test plugin/hub/test/market_source.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `parseSource` and `listSource`. Fetch each `theme.json` with a 256 KB cap and validate with `validateTheme`; a failure is an `errors` entry naming the folder. Send a `User-Agent: standup-bot` header and `Accept: application/vnd.github+json` to the API.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: list the themes of a GitHub repository"`.

### Task 3: Install and remove (`market_install.mjs`)

**Files:**
- Create: `plugin/hub/market_install.mjs`
- Test: `plugin/hub/test/market_install.test.mjs`

**Interfaces:**
- Consumes: `listSource` entries (`MarketTheme`), `ICON_TYPES` and the icon name rule from `themes_loader.mjs` (export `ICON_NAME_RE` and the size caps from there if not yet exported).
- Produces: `installTheme({ theme: MarketTheme, userDir, builtinNames: Set<string>, fetchFn }): Promise<{ version: string }>` (throws `Error` with a readable message), `removeTheme({ name, userDir }): boolean`, `readInstalled(userDir): Record<string, {source, version, installedAt}>`.
- Behavior: download `theme.json` and each file of `theme.files` that passes the file rules into a temporary folder under `userDir`; reject on any limit breach or HTTP error; write `themes/<name>.json` with `iconPack: <name>`; replace `icons/<name>/` by renaming the temporary folder (old folder moved aside first, restored on failure); update `market.json`. `removeTheme` deletes the theme file and its icon folder only when `market.json` lists the name, and drops the entry.

- [ ] **Step 1: Write failing tests** in a temporary `userDir` with a fake `fetchFn`: install writes the theme JSON with `iconPack` equal to the name and the icon files, and records `market.json`; a name in `builtinNames` is refused; a 404 on one icon leaves an already installed older version byte for byte intact and leaves no temporary folder; a file over its cap fails; more than 100 files fails; `removeTheme` removes an installed theme and returns `false` for a theme not in `market.json`; `readInstalled` returns `{}` for a missing or corrupt file.
- [ ] **Step 2: Run** `node --test plugin/hub/test/market_install.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the three functions. A module-level promise chain serializes `installTheme` and `removeTheme` calls.
- [ ] **Step 4: Run** the test file and `node --test plugin/hub/test/themes_loader.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: install and remove market themes"`.

### Task 4: Updates (`market_update.mjs`)

**Files:**
- Create: `plugin/hub/market_update.mjs`
- Test: `plugin/hub/test/market_update.test.mjs`

**Interfaces:**
- Consumes: `listSource`, `installTheme`, `readInstalled`, `compareVersions`.
- Produces: `annotate(themes: MarketTheme[], installed): (MarketTheme & { installed: boolean, installedVersion: string, updatable: boolean })[]` (`updatable` when installed from the same source and `compareVersions(theme.version, installedVersion) > 0`; a non-numeric difference also counts), and `createUpdater({ getSources, getInstalled, install, list, intervalMs = 6 * 3600e3, isActive, onDone, setTimer = setInterval }): { check(name?: string): Promise<{ updated: string[], errors: string[] }>, lastCheck(): number, start(): void, stop(): void }`.
- Behavior: `check()` updates every updatable installed theme; `check(name)` updates one; the timer calls `check()` only when `isActive()` and the setting `themeAutoUpdate` allow it (the caller folds that into `isActive`). A listing is cached 10 minutes inside the updater (`listCached(source)`), cleared by `check`.

- [ ] **Step 1: Write failing tests** with fake `list` and `install`: `annotate` marks `updatable` for `1.1.0` over `1.0.0`, not for equal versions, not for a theme installed from another source; `check()` installs only updatable themes and reports them; `check('x')` touches only `x`; a failing install lands in `errors` and the others continue; the timer function is called with `intervalMs`, runs `check` only when `isActive()` is true; the cache serves a second `list` within 10 minutes (injected clock).
- [ ] **Step 2: Run** `node --test plugin/hub/test/market_update.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions; `start()` also runs one check right away when `isActive()`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: update market themes by version"`.

### Task 5: Hub routes and settings

**Files:**
- Modify: `plugin/hub/hub.mjs`
- Test: `plugin/hub/test/hub.test.mjs`

**Interfaces:**
- Consumes: Tasks 2 to 4. New option `opts.fetch` (default `globalThis.fetch`) reaches all three modules.
- Produces routes (all after the Host and Origin checks): `GET /market` returns `{ sources, themes: annotate(...), errors, lastCheck, autoUpdate }`; `POST /market/sources` body `{add}` or `{remove}` (validated with `parseSource`, 10 max) answers `ok` or 400; `POST /market/install` body `{source, name}` (the theme must be in the listing) answers `ok` or 400 with the message; `POST /market/remove` body `{name}`; `POST /market/update` body `{}` or `{name}` answers `{updated, errors}`. Every successful change calls `reloadCatalog()` then `publish()`. Settings `marketSources` and `themeAutoUpdate` join `SETTING_RULES` and `SETTING_DEFAULTS`, and the `POST /settings` error text lists them. `close()` stops the updater. `isActive` is `clients.size > 0 || model has a session`.

- [ ] **Step 1: Write failing tests** starting the hub with `userDir` of a temp folder and a fake `opts.fetch`: `GET /market` lists the default source's themes; adding then removing a source changes `sources` in `GET /state` settings; install makes the theme appear in `catalog.themes` and its `iconPack` in `catalog.packs`; install of an unlisted name gives 400; remove deletes it from the catalog; update installs a newer version; a foreign Origin on `POST /market/install` gives 403; `themeAutoUpdate: false` is accepted by `POST /settings`, and a value of `"yes"` is not.
- [ ] **Step 2: Run** `node --test plugin/hub/test/hub.test.mjs`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the routes and settings in `hub.mjs`; keep each handler a thin call into the modules. The updater starts after `reloadCatalog()` and its `onDone` reloads the catalog and publishes.
- [ ] **Step 4: Run** `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: marketplace routes and settings"`.

### Task 6: Dialog tabs and marketplace view

**Files:**
- Create: `plugin/hub/web/market.js`
- Modify: `plugin/hub/web/theme_dialog.js`, `plugin/hub/web/settings.css`
- Test: `plugin/hub/test/market_view.test.mjs` (pure helpers only)

**Interfaces:**
- Produces in `market.js`: `filterThemes(themes, query: string)` (case-insensitive match on label, name, description, keywords; empty query returns all) and `createMarket({ onChange }): { element: HTMLElement, refresh(): Promise<void> }`. The element holds a search box, the source list with an "Add source" input (`owner/repo` or GitHub URL) and remove buttons, a "Check for updates" button, an "Auto-update" switch bound to `themeAutoUpdate`, and one card per theme: preview image (or a placeholder), label, `v<version>` (and `installed v<x>`), description, keyword chips, author, source, and one button (Install, Update or Remove). Errors of a source show as a line under the list. Buttons disable while their request runs.
- `theme_dialog.js` gets two tab buttons, Installed and Marketplace. Installed cards show description and keywords and, for themes in the market log, a Remove button and an "update available" mark when `themeAutoUpdate` is off. The Reload button stays on both tabs. The Marketplace tab calls `refresh()` when opened.

- [ ] **Step 1: Write failing tests** for `filterThemes` (match on keyword, match on description, case-insensitive, empty query).
- [ ] **Step 2: Run** `node --test plugin/hub/test/market_view.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `filterThemes`, `createMarket`, the tab markup and CSS (reuse `.tcard`, `.chip`, `.switch`, `.dinput`).
- [ ] **Step 4: Run** the unit test, then start the hub with a user folder and open the page in the browser pane: both tabs render, search filters, adding a bad source shows the error, Install makes the theme appear in Installed and applying it works.
- [ ] **Step 5: Commit** `git commit -m "Page: theme dialog tabs and marketplace"`.

### Task 7: Docs and skill

**Files:**
- Modify: `docs/themes.md`, `plugin/skills/install-theme/SKILL.md`, `CLAUDE.md` (layout list: new modules)

- [ ] **Step 1: Document** the marketplace, the source layout (`<name>/theme.json`, `preview`, `icons/`), the metadata fields, versions and updates, the settings and routes in `docs/themes.md`; keep the existing sections.
- [ ] **Step 2: Rewrite** `install-theme/SKILL.md` to say: add or open the marketplace in the page, or call `POST /market/install`; the old clone-and-copy steps move to a fallback when the hub has no marketplace routes.
- [ ] **Step 3: Run** `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` and `claude plugin validate plugin`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "Docs: theme marketplace"`.

### Task 8: Migrate the themes repository (separate repository)

Not part of this repository. The prompt in `docs/superpowers/theme-repo-migration-prompt.md` drives it. Merge that PR after this plan's PR is merged and the hub restarted, so the Marketplace tab finds themes in the new layout.
