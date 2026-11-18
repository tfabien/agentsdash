# Floating widget window for the hub page

Date: 2026-11-18. Status: awaiting approval.

## Intent and why

The user wants the hub page as a widget that stays visible while they work, without dedicating a screen to it and without the browser chrome (tabs, address bar), for a clean look. Typical use: glance at the agent tiles and answer questions from a corner of the screen.

## Goals

- A borderless window showing `http://127.0.0.1:<port>/`, always on top, movable by dragging, resizable.
- Works on Windows 10/11 and macOS.
- Remembers position and size between launches.
- No change to the hub, its protocol or its page: the widget is a client like the browser tab.

## Non-goals

- Linux support.
- Changing the page layout for the widget (a compact view can come later).
- Replacing the browser page: it stays the main product.
- Auto-starting the hub from the widget.

## Anti-goals

- The widget must not need an install the work PC cannot do (admin rights, large runtimes).
- No new dependency in `hub/` (standard library only rule stays).
- No second path to the hub: the widget does not bypass the Host and Origin checks, it loads the normal URL on loopback.

## Constraints

- WebView2 runtime ships with Windows 10/11, WKWebView ships with macOS.
- The hub only answers requests whose Host is the hub, so the widget must load `127.0.0.1:<port>` exactly.
- Work PC: Fortinet VPN, no assumption that new tools can be installed.

## Approaches considered

1. Tauri, one Rust codebase for both OS. Small binary, but unsigned binaries (Gatekeeper warning on Mac, possible block on the work PC) and a Rust toolchain in CI.
2. Two thin native hosts (chosen by the user): C# with WebView2 on Windows, Swift with WKWebView on Mac. Two codebases, no runtime download.
3. Electron, one JavaScript codebase, about 100 MB per OS.

Chosen: 2, because each host uses the web engine already present on the OS.

## Design

Location: `widget/` at the root of the core repository, outside `hub/` so the release tarball and the standard-library rule are untouched.

- `widget/windows/` : `AgentsdashWidget.cs`, a WinForms borderless `Form` hosting a WebView2 control. Compiled with the `csc.exe` that ships with .NET Framework 4 (no SDK). Needs `Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll` and `WebView2Loader.dll` next to the exe (about 2 MB, fetched by the build script from the official NuGet package).
- `widget/macos/` : `AgentsdashWidget.swift`, one `NSWindow` with style mask borderless plus resizable, hosting a `WKWebView`. Compiled with `swiftc` (Xcode Command Line Tools).
- Behaviour on both:
  - Always on top (`TopMost` on Windows, `NSWindow.Level.floating` on Mac; the Mac window also joins all Spaces).
  - Drag: a 24 px invisible strip along the top edge moves the window. The page itself is not modified.
  - Resize: 6 px invisible border on all edges and corners (hit-testing, `WM_NCHITTEST` on Windows, native on Mac).
  - Right-click on the strip opens a small native menu: Always on top on/off, Opacity 100/85/70 %, Reload, Close.
  - Position, size, opacity and the always-on-top flag are saved on close and on move in `~/.agentsdash/widget.json`. A saved position outside every connected screen is reset to the primary screen.
  - URL from the argument `--url`, default `http://127.0.0.1:8765/`; port also read from `~/.agentsdash/config.json` when present.
  - If the hub is not reachable, the window shows a native "Hub not running" message and retries every 3 s.
- Launch: `node hub/hub.mjs --widget` is not added. A launcher script `widget/run.mjs` (Node, standard library) finds or builds the host for the current OS and starts it detached (`process.exitCode`, per the Windows pitfall in CLAUDE.md).
- Docs: README section "Widget" and `docs/widget.md` with build steps per OS.

## Tests

- Unit test for `run.mjs` (OS detection, host path, argument building) in `hub/test`-style with `node --test`.
- Config file parsing (`widget.json`, off-screen reset) tested in the host language only if cheap; otherwise manual checklist in `docs/widget.md`.
- Manual check per OS: always on top above a maximised window, drag, resize from each edge, restart restores geometry.

## Left to the builder

- Exact visual affordance for the drag strip if 24 px conflicts with the page header (a hover hint is allowed).
- Build script details (NuGet fetch, checksum).
- Whether to ship prebuilt binaries in releases or build on first run.

## Calls made without the user

- Drag strip plus right-click menu in place of a native title bar (needed for a clean look).
- Settings in `~/.agentsdash/widget.json`, next to the existing config.
- Widget folder outside `hub/`, so the hub release is unchanged.
- C# compiled with `csc.exe` (no SDK), because WebView2 from PowerShell needs the same DLLs anyway.
