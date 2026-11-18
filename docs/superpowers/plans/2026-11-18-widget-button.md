# Widget Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen earlier: native, verification level standard). Steps use checkbox syntax.

**Goal:** A button in the bottom bar of the hub page opens the floating widget; the widget ships inside `hub/`.

**Architecture:** `widget/` moves to `hub/widget/`. `run.mjs` exposes `widgetStatus` and `launch`; `hub.mjs` serves `GET /widget` and `POST /widget` (loopback only) on top of them; `web/footer.js` shows an icon button driven by the status.

**Tech Stack:** Node >= 18 standard library, vanilla JS page, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-widget-button-design.md` (builds on `2026-11-18-floating-widget-design.md`).

## Global Constraints

- The hub imports only from `hub/` (`hub/widget/run.mjs` is inside it). No new dependency.
- A route not in `REMOTE_ROUTES` (`hub/lan.mjs`) is refused to a LAN client: `/widget` stays out of that set.
- Every route of `hub.mjs` must be documented in `docs/protocol.md` (test `every_hub_route_is_documented`).
- Test command: `node --test hub/test/*.test.mjs`. Code comments and on-screen text in English.
- `POST /widget` answers 200 `{ok: true}`, 409 `{error: "not built"}`, 501 `{error: "unsupported"}`.

## Review Focus

- A phone on the LAN calls `POST /widget`: 403, nothing spawned (Task 2 test).
- Host not built: button disabled with the build hint, never an error on click (Task 3 test of `widgetButtonState`).
- Linux or other OS: button hidden (Task 3 test).
- Two clicks in a row: the second launch brings the first window forward (host rule, no hub state) (Task 2 test: hub spawns twice without error).

---

### Task 1: Move widget into hub and split run.mjs

**Files:**
- Move: `widget/` to `hub/widget/` (`git mv`); modify `hub/widget/run.mjs`, `hub/widget/build.mjs`, `.gitignore`, `.github/workflows/test.yml`
- Test: `hub/test/widget_run.test.mjs`, `hub/test/widget_build.test.mjs`

**Interfaces:**
- Produces (`hub/widget/run.mjs`): `widgetStatus(platform: string, root?: string): {supported: boolean, built: boolean}`; `launch(url: string, env?: object, platform?: string, root?: string, spawnFn?: typeof spawn): number` returns 0, 2 (unsupported) or 4 (not built). `main` keeps its codes and calls `launch` with the URL from the config. `hostPath(platform, root)` and `ROOT` (now `hub/`) keep their meaning.

- [ ] **Step 1: Update the two test files** to import `../widget/run.mjs` and `../widget/build.mjs`; add tests `widget_status_unsupported_on_linux` (`{supported: false, built: false}`), `widget_status_built_when_host_file_exists` (temp root with the host file for win32 gives `{supported: true, built: true}`, without it `built: false`), `launch_spawns_detached_with_url_and_settings` (fake `spawnFn` records `(file, args, options)`; args equal `buildArgs(url, <homeDir>/widget.json)`, options `detached: true`, returns 0), `launch_returns_4_when_not_built`.
- [ ] **Step 2: Run** `node --test hub/test/widget_run.test.mjs hub/test/widget_build.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: `git mv widget hub/widget`**, change imports to `../config.mjs`, `../paths.mjs`, `../json_file.mjs`, `../run_as_main.mjs`; keep `ROOT = path.resolve(dirname, '..')` (now `hub/`); implement `widgetStatus` and `launch` by extracting them from `main`; usage text and messages say `node hub/widget/build.mjs`.
- [ ] **Step 4: `.gitignore`** `widget/**/bin/` becomes `hub/widget/**/bin/`; CI step runs `node hub/widget/build.mjs`; compile paths in `build.mjs` use `path.join(root, 'widget', ...)` already relative to `hub/`.
- [ ] **Step 5: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 6: Run** `node hub/widget/build.mjs`. Expected: exit 0, `hub/widget/windows/bin/AgentsdashWidget.exe` exists.
- [ ] **Step 7: Commit** `refactor: move the widget into hub/ and split launch from main`.

### Task 2: Hub routes

**Files:**
- Modify: `hub/hub.mjs`, `docs/protocol.md`
- Test: `hub/test/hub_widget.test.mjs`

**Interfaces:**
- Consumes: `widgetStatus`, `launch` from Task 1.
- Produces: `startHub({..., widget: {status, launch}})` optional option (defaults `{status: () => widgetStatus(process.platform), launch: (url) => launch(url)}`); routes `GET /widget` answers `{supported, built}`; `POST /widget` calls `widget.launch('http://127.0.0.1:<port>/')` and maps 0 to 200 `{ok: true}`, 4 to 409 `{error: "not built"}`, 2 to 501 `{error: "unsupported"}`.

- [ ] **Step 1: Write failing tests** in `hub/test/hub_widget.test.mjs` (helper `startHub({port: 0, widget: fake, ...})` like `hub_lan.test.mjs`): `get_widget_returns_status`, `post_widget_launches_with_the_hub_url` (fake records the URL equal to `http://127.0.0.1:${hub.port}/`), `post_widget_not_built_is_409`, `post_widget_unsupported_is_501`, `post_widget_twice_launches_twice`, `remote_client_cannot_post_widget` (`lan: {enabled: true, treatAllAsRemote: true, hosts: [...]}` with the pairing cookie: 403 and the fake never called).
- [ ] **Step 2: Run** `node --test hub/test/hub_widget.test.mjs`. Expected: FAIL (404).
- [ ] **Step 3: Implement** the two `case` lines in `hub.mjs` next to `POST /reload`; import from `./widget/run.mjs`.
- [ ] **Step 4: Document** both routes under "Hub management routes" in `docs/protocol.md`.
- [ ] **Step 5: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS, including the protocol tests.
- [ ] **Step 6: Commit** `feat: GET and POST /widget`.

### Task 3: Bottom bar button

**Files:**
- Modify: `hub/web/hub_view.js`, `hub/web/footer.js`, `hub/web/icons.js`, `hub/web/hub.css`
- Test: `hub/test/hub_view.test.mjs`

**Interfaces:**
- Produces: `widgetButtonState(status: {supported: boolean, built: boolean} | null): {hidden: boolean, disabled: boolean, title: string}` in `hub_view.js`: `null` or unsupported gives hidden; unsupported-free and not built gives disabled with title `Build it once: node hub/widget/build.mjs`; built gives enabled with title `Open the floating widget`.

- [ ] **Step 1: Write failing tests** in `hub_view.test.mjs`: `widget_button_hidden_when_unsupported_or_unknown`, `widget_button_disabled_with_build_hint_when_not_built`, `widget_button_enabled_when_built`.
- [ ] **Step 2: Run** `node --test hub/test/hub_view.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `widgetButtonState`; add a `widget` icon (a small window with a title bar) to `icons.js`; in `footer.js` add a `chip widgetbtn` button left of the QR button, read `GET /widget` at mount and after each click, apply the state; a click sends `POST /widget` and shows a failed answer's `error` as the button title for 5 seconds.
- [ ] **Step 4: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Manual check** (hub from this branch on a spare port, then `GET /widget`, screenshot of the bar, click the button): record the result in `docs/widget.md`.
- [ ] **Step 6: Commit** `feat: widget button in the bottom bar`.

### Task 4: Docs

**Files:**
- Modify: `docs/widget.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1:** Replace `widget/` paths and commands with `hub/widget/`; document the bottom bar button and the `/widget` routes in `docs/widget.md` and the README section; update the `CLAUDE.md` layout line (widget now under `hub/`, shipped in the release, binary built per machine).
- [ ] **Step 2: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 3: Commit** `docs: the widget lives in hub/ and opens from the page`.

## Self-review notes

- Spec coverage: move (T1), routes and loopback rule (T2), button states (T3), docs (T4). Build-from-page, close-from-page and autostart stay out as the spec says.
- Added in the plan: `launch` takes an injectable `spawnFn`; hub option `widget` for tests.
