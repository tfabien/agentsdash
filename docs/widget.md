# Floating widget

A borderless, always-on-top, movable and resizable window that shows the hub page (`http://127.0.0.1:8765/` by default, the `host` of the config otherwise). It is a client of the hub like a browser tab: the hub, its protocol and its page do not change.

Windows 10/11 and macOS only. Each OS has its own native host around the web engine that ships with it (WebView2, WKWebView).

```
node widget/build.mjs   # once: compiles the host of this OS into widget/<os>/bin/
node widget/run.mjs     # starts the widget (exit code 2: unsupported OS, 4: host not built)
```

## Behaviour of a host

- Always on top by default; the window has no title bar and no border.
- Drag: an invisible strip of 24 px along the top edge moves the window.
- Resize: an invisible border of 6 px on every edge and corner. Minimum size 160 x 100.
- Right-click on the strip opens a menu: Always on top (on/off), Opacity 100 / 85 / 70 %, Reload, Close.
- One window at a time: a second launch brings the running window to the front and exits 0.
- When the hub is not reachable the window shows "Hub not running" and retries every 3 s.
- Windows only: when the WebView2 runtime is missing, a message box says so and the host exits with code 3.

## Arguments

`--url <url>` page to show. `--settings <file>` settings file (`~/.agentsdash/widget.json`). The launcher passes both (`buildArgs` in `widget/run.mjs`).

## Settings file

JSON object, read at start, written on every move, resize, opacity or always-on-top change. A missing or corrupt file gives the defaults; an invalid single field gives the default of that field (`readSettings` in `widget/run.mjs` is the reference).

| Key | Meaning | Default |
|---|---|---|
| `x`, `y` | screen coordinates of the top-left corner, `null` = placed by the host | `null` |
| `width`, `height` | window size in pixels, at least 160 and 100 | 420, 300 |
| `opacity` | 100, 85 or 70 (percent) | 100 |
| `alwaysOnTop` | boolean | `true` |

A saved rectangle that touches no connected screen is ignored: the window opens at the top-right of the primary screen.

## Manual checklist

Filled in when each host is built (results per OS):

- [ ] Stays above a maximised window.
- [ ] Drag by the top strip.
- [ ] Resize from each edge and corner.
- [ ] Menu items work (always on top, opacity, reload, close).
- [ ] Restart restores position and size.
- [ ] Hub stopped shows "Hub not running", the page appears when the hub starts.
- [ ] Unplugged monitor: reopens on the primary screen.
- [ ] Second launch focuses the first window.
