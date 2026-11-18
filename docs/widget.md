# Floating widget

A borderless, always-on-top, movable and resizable window that shows the hub page (`http://127.0.0.1:8765/` by default, the `host` of the config otherwise). It is a client of the hub like a browser tab: the hub, its protocol and its page do not change.

Windows 10/11 and macOS only. Each OS has its own native host around the web engine that ships with it (WebView2, WKWebView).

```
node hub/widget/build.mjs   # once: compiles the host of this OS into hub/widget/<os>/bin/
node hub/widget/run.mjs     # starts the widget (exit code 2: unsupported OS, 4: host not built)
```

The widget ships inside `hub/` (sources only, the binary is built per machine). The bottom bar of the page has a button, left of the QR button, that starts it: the page asks the hub (`GET /widget` for `{supported, built}`, `POST /widget` to start, loopback only, see `docs/protocol.md`). The button is hidden on an OS without a host and disabled, with the build command as its tooltip, until the host is compiled.

## Behaviour of a host

- Always on top by default; the window has no title bar and no border.
- Drag: a strip along the top edge moves the window (the grip mark is drawn in its middle).
- Resize: a border on every edge and corner. Minimum size 160 x 100.
- Windows: the strip is 16 px and the border 5 px, both outside the page and drawn in the page background color (a WebView2 control takes every mouse message of its area, so an overlay on the page is impossible). macOS: 24 px and 6 px, invisible, over the page.
- The page is loaded with `?widget=1`: `hub.html` sets `data-mode="widget"` and the bottom bar becomes one thin line with the quotas and no clock; the beeps, theme, QR and settings buttons fade in over its right end while the mouse is over the bar.
- The widget loads the hub without proxy lookup: system proxy detection behind a VPN made the first load take 10 to 20 s.
- Right-click on the strip opens a menu: Always on top (on/off), Opacity 100 / 85 / 70 %, Reload, Close.
- One window at a time: a second launch brings the running window to the front and exits 0.
- When the hub is not reachable the window shows "Hub not running" and retries every 3 s.
- Windows only: when the WebView2 runtime is missing, a message box says so and the host exits with code 3.

## Arguments

`--url <url>` page to show. `--settings <file>` settings file (`~/.agentsdash/widget.json`). The launcher passes both (`buildArgs` in `hub/widget/run.mjs`).

## Settings file

JSON object, read at start, written on every move, resize, opacity or always-on-top change. A missing or corrupt file gives the defaults; an invalid single field gives the default of that field (`readSettings` in `hub/widget/run.mjs` is the reference).

| Key | Meaning | Default |
|---|---|---|
| `x`, `y` | screen coordinates of the top-left corner, `null` = placed by the host | `null` |
| `width`, `height` | window size in pixels, at least 160 and 100 | 420, 300 |
| `opacity` | 100, 85 or 70 (percent) | 100 |
| `alwaysOnTop` | boolean | `true` |

A saved rectangle that touches no connected screen is ignored: the window opens at the top-right of the primary screen.

## Manual checklist

Windows (2026-11-18, Windows 10 Enterprise, scripted checks marked S, others to do by hand):

- [x] S: topmost flag set, no caption, page loads in about 2 s.
- [x] S: hit-test gives top-left, top, left, right, bottom-right resize codes on the border, caption on the strip, client on the page.
- [x] S: hub stopped shows "Hub not running", the page appears when the hub starts (3 s probe of `/health`).
- [x] S: second launch exits 0 and leaves one process.
- [x] S: `widget.json` is written with position, size, opacity and always-on-top.
- [ ] Stays above a maximised window.
- [ ] Drag by the strip and resize from each edge with the mouse.
- [ ] Menu items work (always on top, opacity, reload, close).
- [ ] Restart restores position and size.
- [ ] Unplugged monitor: reopens on the primary screen.
- [ ] The second launch brings the first window to the front.

macOS (not built or run yet: the host was written on Windows, the first compile is the `widget-build` CI job on `macos-latest`):

- [ ] `node hub/widget/build.mjs` compiles without error.
- [ ] The bottom bar button opens the widget (Windows: checked 2026-11-18, the page click started the host on the hub's URL).
- [ ] The Windows list above, item by item, with the 24 px strip and the 6 px invisible border over the page.
- [ ] Visible on every Space and above a full-screen app window.
- [ ] The page loads over `http://127.0.0.1` from the unbundled binary (App Transport Security). If it does not, embed an Info.plist with `NSAllowsLocalNetworking` through `-sectcreate` in `compileCommand`.
- [ ] A second launch brings the first window to the front (`widget.lock` holds the pid).
