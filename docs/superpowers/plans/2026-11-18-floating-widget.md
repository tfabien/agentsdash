# Floating Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the hub page in a borderless, always-on-top, movable, resizable window on Windows and macOS.

**Architecture:** A Node launcher (`widget/run.mjs`) picks the native host of the current OS and starts it detached with the hub URL and a settings file path. Each host is a thin window around the OS web engine (C# WinForms + WebView2, Swift AppKit + WKWebView) that implements one shared contract written in `docs/widget.md`. The hub and its page do not change.

**Tech Stack:** Node >= 18 (standard library only), C# compiled by `csc.exe` of .NET Framework 4, WebView2 managed DLLs from NuGet, Swift (`swiftc`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-floating-widget-design.md`

## Global Constraints

- Nothing new in `hub/`: the hub keeps "standard library only" and its release tarball is unchanged.
- Widget code lives in `widget/` at the repository root; the hub never imports from it.
- URL loaded: `http://127.0.0.1:8765/` by default, built from the `host` value of `loadConfig()` (`hub/config.mjs`); the Host header must stay the hub's own.
- Settings file: `~/.agentsdash/widget.json` (`homeDir()` of `hub/paths.mjs`).
- Always on top (`TopMost` / `NSWindow.Level.floating`), 24 px invisible drag strip on the top edge, 6 px invisible resize border, right-click menu on the strip: Always on top, Opacity 100/85/70 %, Reload, Close.
- Windows 10/11 and macOS only. No admin rights, no installer, no runtime download except the WebView2 DLLs (about 2 MB) at build time.
- Windows: spawning a detached child then `process.exit` crashes Node, use `process.exitCode`.
- Code comments, docs and on-screen text in English.

## Review Focus

- Hub not running at launch: the window shows "Hub not running" and retries every 3 s, never a blank or browser error page (Task 3, Task 4 manual checklist).
- Saved position on a monitor that is no longer connected: the window reopens on the primary screen (Task 3, Task 4).
- Missing or corrupt `widget.json`: defaults are used and the file is rewritten, no crash (Task 1 test, Tasks 3 and 4).
- Second launch while a widget runs: the running window is brought to front, no second window (Tasks 3 and 4).
- WebView2 runtime absent (old Windows 10): a message box names the missing runtime and exits with code 3 (Task 3).
- Settings path with spaces or accents (French user names): arguments are passed as an array, never through a shell string (Task 1 test).

---

### Task 1: Launcher, settings contract, docs

**Files:**
- Create: `widget/run.mjs`, `docs/widget.md`
- Test: `hub/test/widget_run.test.mjs`

**Interfaces:**
- Produces (`widget/run.mjs`, all exported):
  - `hostPath(platform: string, root: string): string | null` : `<root>/widget/windows/bin/AgentsdashWidget.exe` for `win32`, `<root>/widget/macos/bin/AgentsdashWidget` for `darwin`, `null` otherwise.
  - `widgetUrl(host: string): string` : `http://<host>/`.
  - `buildArgs(url: string, settingsFile: string): string[]` : `['--url', url, '--settings', settingsFile]`.
  - `readSettings(file: string): {x: number|null, y: number|null, width: number, height: number, opacity: 100|85|70, alwaysOnTop: boolean}` : defaults `{x: null, y: null, width: 420, height: 300, opacity: 100, alwaysOnTop: true}`; invalid or missing file gives defaults, invalid single fields fall back to their default.
  - `main(argv: string[], env: object): number` : exit code; 2 when the OS is unsupported, 4 when the host file is missing (message tells to run `node widget/build.mjs`).
- Settings contract for the hosts (`docs/widget.md`): JSON object with the keys of `readSettings`; hosts read it at start, write it on move, resize, opacity or always-on-top change; `x` and `y` are screen coordinates of the top-left corner.

- [ ] **Step 1: Write failing tests** in `hub/test/widget_run.test.mjs` (names): `host_path_per_platform` (win32 and darwin give the paths above with forward slashes normalized by `path.join`, linux gives `null`), `widget_url_from_host` (`'127.0.0.1:9000'` gives `'http://127.0.0.1:9000/'`), `build_args_keeps_spaces_and_accents` (settings path `C:/Users/Hélène Dupont/.agentsdash/widget.json` stays one element), `read_settings_defaults_on_missing_file`, `read_settings_defaults_on_corrupt_json`, `read_settings_keeps_valid_fields_and_resets_invalid` (`{"width": "wide", "opacity": 70}` gives width 420 and opacity 70, opacity 50 gives 100), `main_reports_unsupported_os_with_code_2`.
- [ ] **Step 2: Run** `node --test hub/test/widget_run.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `widget/run.mjs` with the signatures above. `main` reads the host from `loadConfig(defaultConfigPath(), env)` of `hub/config.mjs`, spawns the host with `child_process.spawn(file, args, { detached: true, stdio: 'ignore' })`, calls `.unref()`, returns 0 without `process.exit`. A `run_as_main.mjs` guard (existing helper in `hub/`) runs `main` when the file is executed directly.
- [ ] **Step 4: Write `docs/widget.md`**: purpose, `node widget/run.mjs`, the settings contract, the behaviour list from the spec (drag strip, resize border, menu, single instance, "Hub not running" retry), and an empty "Manual checklist" section that Tasks 3 and 4 fill.
- [ ] **Step 5: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 6: Commit** `git add widget/run.mjs docs/widget.md hub/test/widget_run.test.mjs && git commit -m "feat: widget launcher and settings contract"`

### Task 2: Build script

**Files:**
- Create: `widget/build.mjs`
- Test: `hub/test/widget_build.test.mjs`

**Interfaces:**
- Consumes: `hostPath` from Task 1.
- Produces: `widget/build.mjs` exports `compileCommand(platform: string, root: string): {cmd: string, args: string[]} | null` and `main(argv, env): Promise<number>`. Windows command: `csc.exe` from `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\` with `/target:winexe`, references to the three WebView2 DLLs, output `widget/windows/bin/AgentsdashWidget.exe`. macOS command: `swiftc widget/macos/AgentsdashWidget.swift -o widget/macos/bin/AgentsdashWidget`.

- [ ] **Step 1: Write failing tests**: `compile_command_windows_uses_framework_csc_and_winexe`, `compile_command_macos_uses_swiftc_with_output_in_bin`, `compile_command_linux_is_null`.
- [ ] **Step 2: Run** `node --test hub/test/widget_build.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `compileCommand` and `main`. On Windows `main` first fetches `https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/<pinned version>` with `fetch`, checks its SHA-256 against a constant in the file, extracts with `tar -xf` (present in Windows 10 1803+), copies `Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll` and `runtimes/win-x64/native/WebView2Loader.dll` into `widget/windows/bin/`. Pin the newest stable version at implementation time and record its hash.
- [ ] **Step 4: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Add CI**: in `.github/workflows/test.yml` add a step on the Windows and a macOS runner that runs `node widget/build.mjs` (compilation only). Expected: both jobs green after Tasks 3 and 4 land.
- [ ] **Step 6: Commit** `git add widget/build.mjs hub/test/widget_build.test.mjs .github/workflows/test.yml && git commit -m "feat: widget build script and CI compile check"`

### Task 3: Windows host

**Files:**
- Create: `widget/windows/AgentsdashWidget.cs`

**Interfaces:**
- Consumes: the argument contract of `buildArgs` and the settings contract of Task 1; `compileCommand` for building.
- Produces: `widget/windows/bin/AgentsdashWidget.exe` with exit codes 0 normal, 3 WebView2 runtime missing.

- [ ] **Step 1: Implement the window**: a `Form` with `FormBorderStyle.None`, `TopMost` from settings, `Opacity` from settings, one `WebView2` control filling it, navigated to `--url`. A `WndProc` override answers `WM_NCHITTEST` with `HTTOP`, `HTLEFT`, ... for the 6 px border and `HTCAPTION` for the top 24 px strip so Windows handles drag and resize.
- [ ] **Step 2: Implement the context menu** for right-click on the strip (a 24 px transparent child `Panel` above the WebView2 control, `Dock = Top`): the items listed in Global Constraints. Each change rewrites `widget.json`.
- [ ] **Step 3: Implement settings** read at start and write on `Move`, `Resize`, menu changes. Before showing the window, if the saved rectangle does not intersect any `Screen.AllScreens` working area, use the primary screen's top-right corner.
- [ ] **Step 4: Implement single instance** with a named `Mutex` (`Global\agentsdash-widget`); a second launch finds the running window by title `agentsdash` and brings it to front with `SetForegroundWindow`, then exits 0.
- [ ] **Step 5: Implement the unreachable-hub state**: on `NavigationCompleted` with `IsSuccess == false`, show the text "Hub not running" via `NavigateToString` and retry `Navigate(url)` every 3 s with a `Timer`. When `WebView2` creation throws `WebView2RuntimeNotFoundException`, show a `MessageBox` "WebView2 runtime not found" and exit with code 3.
- [ ] **Step 6: Build** `node widget/build.mjs`. Expected: `widget/windows/bin/AgentsdashWidget.exe` exists, exit code 0.
- [ ] **Step 7: Manual checklist** (record results in `docs/widget.md`): runs above a maximised window; drag by the top strip; resize from each edge and corner; menu items work; restart restores geometry; hub stopped shows "Hub not running" then the page when the hub starts; unplugged monitor reopens on the primary screen; second launch focuses the first.
- [ ] **Step 8: Commit** `git add widget/windows docs/widget.md && git commit -m "feat: Windows widget host (WebView2)"`

### Task 4: macOS host

**Files:**
- Create: `widget/macos/AgentsdashWidget.swift`

**Interfaces:**
- Consumes: the same argument and settings contracts.
- Produces: `widget/macos/bin/AgentsdashWidget`.

- [ ] **Step 1: Implement the window**: `NSWindow` subclass with `styleMask: [.borderless, .resizable]`, `level = .floating`, `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]`, `isMovableByWindowBackground = false`, `canBecomeKey = true`, `alphaValue` from settings, `hasShadow = true`, content view a `WKWebView` loading `--url`.
- [ ] **Step 2: Implement drag and resize**: a transparent `NSView` 24 px high along the top calls `window.performDrag(with:)` on `mouseDown` and shows the menu on `rightMouseDown`; a 6 px edge view per side and corner tracks `mouseDragged` and resizes the frame with a 160 x 100 minimum.
- [ ] **Step 3: Implement settings** with the same file, same keys; write on `windowDidMove` and `windowDidResize`. Convert between the contract's top-left screen coordinates and AppKit's bottom-left origin. If the saved frame intersects no `NSScreen.screens` frame, place the window at the top-right of `NSScreen.main`.
- [ ] **Step 4: Implement single instance**: a lock file `widget.lock` in the settings folder holding the pid; a second launch whose pid is alive activates the running app through `NSRunningApplication(processIdentifier:)` and exits 0.
- [ ] **Step 5: Implement the unreachable-hub state** with `webView(_:didFailProvisionalNavigation:withError:)`: `loadHTMLString` "Hub not running" and a 3 s `Timer` that reloads the URL.
- [ ] **Step 6: Build** `node widget/build.mjs`. Expected: `widget/macos/bin/AgentsdashWidget` exists, exit code 0.
- [ ] **Step 7: Manual checklist** (record in `docs/widget.md`): same list as Task 3, plus visible on every Space and above a full-screen app window.
- [ ] **Step 8: Commit** `git add widget/macos docs/widget.md && git commit -m "feat: macOS widget host (WKWebView)"`

### Task 5: Docs and wiring

**Files:**
- Modify: `README.md` (new "Widget" section after the browser section), `CLAUDE.md` (layout line for `widget/`), `.gitignore` (`widget/**/bin/`)

- [ ] **Step 1: Write the README section**: what it is, `node widget/build.mjs` once, `node widget/run.mjs` to start, link to `docs/widget.md`.
- [ ] **Step 2: Update `CLAUDE.md` layout** with one line for `widget/` (launcher, build, two hosts, outside `hub/`, tests in `hub/test/widget_*.test.mjs`).
- [ ] **Step 3: Add `widget/**/bin/` to `.gitignore`.**
- [ ] **Step 4: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS, including `core_standalone`.
- [ ] **Step 5: Commit** `git add README.md CLAUDE.md .gitignore && git commit -m "docs: document the widget"`

## Self-review notes

- Spec coverage: window behaviour (Tasks 3, 4), settings (Task 1 contract, Tasks 3, 4), launcher and build (Tasks 1, 2), docs (Tasks 1, 5), tests (Tasks 1, 2 automated, 3 and 4 manual checklists).
- Added beyond the spec, as plan decisions: single-instance rule and the WebView2-missing message (both from Review Focus).
- Open for the builder: the pinned WebView2 NuGet version and hash, prebuilt binaries in releases (not in this plan).
