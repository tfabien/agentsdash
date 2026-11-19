# Dashboard window

The hub page (`http://127.0.0.1:8765/` by default, the `host` of the config otherwise) in a window of its own, without browser tabs or address bar: Edge or Chrome in `--app` mode. It is the same page as in a tab, with the same thin bottom bar. It is opened by the skill `open-dashboard` of the plugin, by the desktop shortcut, or from a terminal (`POST /dashboard`, loopback only, see `docs/protocol.md`); the page has no button for it. It needs an Edge or Chrome at its usual install path.

The window has the native frame of the browser, so Windows snapping (Win+arrows) and PowerToys FancyZones work on it. A native host with its own borderless frame was tried and dropped: Windows snapping needs the sizing frame styles, and the security software of the development PC deleted the compiled host. There is no host to build or download any more.

## How it opens

`launchApp` in `hub/dashboard/run.mjs` starts the first Edge or Chrome found with `--app=<hub url>`, and a profile folder of its own (`~/.agentsdash/dashboard-app`) that remembers position and size when the window is closed. No size is given on the command line, because it would override the remembered one. `--no-proxy-server` keeps the first load fast behind a VPN (system proxy detection took many seconds); sync, background networking and extensions are off. `node hub/dashboard/run.mjs` does the same from a terminal (exit code 4: no browser).

- No always on top: use PowerToys Always on Top (Win+Ctrl+T) on Windows. A window pinned that way stays above every normal window, the new one included, so pin only what must stay above.
- On Windows the browser opens behind the other windows when the hub (a background process) starts it. `launchApp` runs a hidden PowerShell that waits for the window titled exactly `Agents Dash` (the hub tab of the same browser is titled `Agents Dash - <browser>`), presses Alt to lift the foreground lock, and activates it. It then moves the window to the placement the browser saved when the window was last closed (`browser.app_window_placement` in `dashboard-app/Default/Preferences`): the browser itself and PowerToys FancyZones (which put a new window in a zone) ignore it. Its outcome is in `~/.agentsdash/dashboard-focus.log`.
- A second click opens a second window.
- The bottom bar is one thin line (quotas, beeps, theme, QR and settings buttons, clock). The clock hides with the setting `show_clock`.

## Desktop shortcut

The first time the page is opened, a line offers a desktop shortcut that opens the dashboard (`GET /shortcut`): Create it, Later (until the page reloads), Never (the setting `shortcut_prompt`, see `docs/protocol.md`). The skill `create-dashboard-shortcut` of the plugin does the same on request. `POST /shortcut` (`hub/dashboard/shortcut.mjs`) writes `~/.agentsdash/open-dashboard.mjs`, a copy of `hub/dashboard/open.mjs`, and a shortcut to it: `Agentsdash.lnk` on Windows (minimized console, browser icon), `Agentsdash.command` on macOS, `agentsdash.desktop` on Linux. The copy outlives core updates: it finds the highest version in `~/.agentsdash/core/`, starts its `hub.mjs` when the hub does not answer, then calls `POST /dashboard`. The macOS and Linux shortcuts are not tested yet.

## Manual checklist

- [x] The window opens and comes to the front (Windows, checked 2026-11-19).
- [x] Win+Left and Win+Right snap the window, FancyZones takes it with Shift + drag.
- [x] The desktop shortcut `.lnk` is created (OneDrive desktop included).
- [ ] The shortcut starts the hub when it is stopped, then opens the window.
- [ ] macOS and Linux: the window opens with Chrome or Edge, and the shortcut file works.
