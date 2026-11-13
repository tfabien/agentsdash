# agentsdash hub

Local Node.js hub for the agent dashboard. It receives what the adapters send (Claude Code today) (`POST /event` v2,
`POST /usage`, the same wire format as the gadget), keeps the state of every session and sub-agent, and shows it in a
browser page. It works with no hardware, and can relay the same events to the ESP32 gadget.
The wire contract is in [docs/protocol.md](../docs/protocol.md) and [docs/device-protocol.md](../docs/device-protocol.md).

Requires Node.js >= 18. No npm install is needed (the optional `serialport` package is only for USB mode).

## Run

An adapter starts the hub by itself: the first hook finds nothing on `127.0.0.1:8765`, starts `hub.mjs` detached
and sends its event again. To run it by hand:

```bash
node hub/hub.mjs
```

Then open <http://127.0.0.1:8765/>: the page shows the gadget screen with the same layout, colors and wording: title bar with the
session dots, lead panel with its plan and context, team rows, session list, questions and the quota bar.
It is drawn as vectors at the resolution of your display (any size, any pixel ratio), with robots redrawn in vector
form. It reads the same state as the gadget, so the two always agree. Taps work like the touchscreen: the title bar
opens the session list, a team row shows that agent for 10 s, the speaker button cycles the beeps (all, ask only, off).
Under the screen a line shows whether the relay reaches the gadget.

## Sessions page

<http://127.0.0.1:8765/> (also `/hub`) shows every session as a tile in a grid. It is the only page.

- Files: `web/hub.html`, `hub.css`, `hub_page.js` (DOM), `hub_view.js` (pure logic: grid shape, pages, what a tile says, quota bars), `alerts.js` (beep rule).
- One `EventSource('/events')` feeds all tiles.
- Tiles per page (setting `max_tiles`, 0 = Auto, 1 to 12; `?max=N` overrides it for one tab): Auto counts the tiles that fit the window at 0.8 times the gadget screen. 1 shows one session at a time; a session with sub-agents then shows its lead and team side by side, half a width each.
- Sessions keep their first-seen order, idle ones (waiting for you 5 minutes) last. They are cut into pages in that order; a session (lead and team tiles) is never split across pages.
- Pages turn with the side arrows, the dots (orange for `needs_you`, red for `error` on that page), a horizontal swipe or the left and right keys.
- `needs_you` tiles are orange, `error` tiles red. The beeps follow the shared beeps setting (the bell chip cycles it).
- Quotas and clock: once, in the bottom bar, with the pace colors of the screen. Tiles show the context fill, not the quotas.
- Small tiles drop details through container queries: plan text first, then the command.
- The hub keeps 12 sessions. `max_sessions` in the config file (or env `AGENTSDASH_MAX_SESSIONS`, 1 to 32) raises it; the relayed device keeps its own limit.

The hub binds to `127.0.0.1` only and has no authentication.

## Terminal view

```bash
node hub/tui.mjs [--host 127.0.0.1:8765]
```

The same information in the terminal, with colors: one block per session (most urgent first), its plan, context, question
and sub-agents, then the quotas. It follows `GET /events` and reconnects when the hub restarts. Ctrl+C quits.

## Configuration

`~/.agentsdash/config.json` (all keys optional) and environment variables. The old `~/.claude/agent-gadget.json` and `CLAUDE_GADGET_*` names still work as a fallback for one major version. Other variables: `AGENTSDASH_CONFIG` (another file), `AGENTSDASH_HOME` (the `~/.agentsdash` folder), `AGENTSDASH_STATE_DIR` (settings, markers, quota history; default `<temp>/agentsdash`), `AGENTSDASH_THEME` (first theme to download).

| Key | Default | Meaning |
|---|---|---|
| `host` | `127.0.0.1:8765` | Where the adapters send events and where the hub listens (env `AGENTSDASH_HOST`). |
| `relay` | `{"mode":"none"}` | `{"mode":"http","host":"<gadget ip>"}` forwards events to a gadget over Wi-Fi; `{"mode":"serial","port":"COM3"}` over USB. |
| `lan` | `{"enabled":false,"bind":"0.0.0.0"}` | `{"enabled":true}` (or env `AGENTSDASH_LAN=1`) lets a phone on the same Wi-Fi read the page, see below. |
| `quotas` | `true` | Read by the Claude adapter, not by the hub: poll the 5-hour and weekly plan quotas (env `AGENTSDASH_QUOTAS=0` turns it off). |
| `context_window` | `1000000` | Context window used for the context estimate (tokens). |
| `max_sessions` | `12` | Sessions the hub keeps (1 to 32, env `AGENTSDASH_MAX_SESSIONS`). More than 5 only helps the `/hub` page. |

## Relay to a gadget (Wi-Fi)

With `"relay": {"mode": "http", "host": "192.168.1.100"}` every event and usage report the hub accepts is forwarded
unchanged to the gadget (`POST /event`, `POST /usage`). `GET /relay` shows the state (`ok`, `lastError`, `queued`).
If the gadget is down, the hub keeps working and retries after 3 seconds (only the latest event per agent is kept).
The gadget aborts a screen upload (`/tft`) on any other request: create the file `agent-gadget-tft.lock` (old name, kept for the firmware tools) in the temp
folder before uploading and delete it afterwards, and the relay sends nothing meanwhile.

## Choosing the device from the page

The gear menu has a **Device** section: relay state, the choice (None, Wi-Fi host, USB port from a list), **Apply** and **Test**.
Apply swaps the relay while the hub runs and writes the `relay` key of the config file (the other keys stay).
Test sends `GET /state` to the gadget (Wi-Fi) or reports the state of the open port (USB); it waits while a screen upload holds the lock file.

- `POST /relay {"mode":"none"|"http"|"serial","host","port"}` validates and applies the choice; answers `{"ok":true,"saved":bool}`.
- `POST /relay/test` returns `{"ok":true,"detail"}` or `{"ok":false,"error"}`. `GET /relay/ports` lists serial ports (`error` says `serialport` is missing).
- The hub sends requests to the host it is given, so only local devices are accepted: a private IP (10.x, 172.16-31.x, 192.168.x, 169.254.x, fc00::/7, fe80::/10)
  or a `.local` name whose addresses are all private when it is looked up. Loopback is refused (the hub would relay to itself). The name is resolved again at each request.
- The USB port must look like `COM3` or `/dev/ttyUSB0`. Requests from another web page are refused like every other route.
- One device only, entered by hand (no discovery).

## Relay to a gadget (USB)

For places without Wi-Fi: `"relay": {"mode": "serial", "port": "COM3"}`. The hub opens the port at 115200 baud
(this resets the ESP32, so it waits 2.5 s) and writes one JSON line per event or usage report:
`{"type":"event","body":{...}}` (body = the POST body). The firmware reads these lines on USB (lines that
start with `{`; any other character keeps its old meaning, `r` `t` `w`). Install the driver once, in `hub/`:
`npm install serialport` (prebuilt binaries, no compiler needed).

One program owns the COM port at a time. To flash the firmware or the screen from the PC, give the port back first:

```bash
curl -X POST http://127.0.0.1:8765/serial/release     # close COM3, stop retrying
curl -X POST http://127.0.0.1:8765/serial/open        # take it back
```

While the port is missing the hub retries every 5 seconds; `GET /relay` shows `connected` and `lastError`.

## HTTP API

`POST /event`, `POST /usage`, `GET /state`, `POST /select`, `POST /reset` as on the gadget, `POST /dismiss {"session"}` (hide a session until it works again or needs you; forwarded to the device), `POST /settings {"sound": "all"|"ask"|"off"}` (the beeps, shared by every page, kept in `hub-settings.json` in the temp folder; default `ask`; forwarded to the gadget buzzer at start and on every change)
(see `../docs/device-protocol.md`), plus `GET /events` (server-sent events: the state on connect, then on every
change and every second), `GET /health` and `GET /` (the page).

## Files

- `hub.mjs` HTTP server and wiring, `config.mjs` configuration.
- `model.mjs` state rules, a port of `model.cpp` (5 sessions, 12 sub-agents each, "needs you" first, TTLs, selection).
- `relay_http.mjs`, `relay_serial.mjs` forward events to a gadget (Wi-Fi, USB); `relay_config.mjs` validates a relay chosen from the page.
- `tui.mjs` terminal view.
- `paths.mjs` names and folders: `AGENTSDASH_*` variables with the old names as fallback, config file, state folder, user folder.
- The hub does not poll quotas: the Claude adapter's `quota_poller.mjs` (OAuth token from `~/.claude/.credentials.json`, or the macOS Keychain, never printed) posts them to `/usage`.
- Release: a `v*` tag packs this folder (without `test/` and `tools/`) as `agentsdash-core-<version>-p<protocol>.tar.gz` (the protocol is in `package.json`) with a `.sha256` file; run it with `node hub.mjs` or point the hooks at it with `AGENTSDASH_CORE_DIR`.
- `web/` the page: `screen.js` decides what is drawn (port of `display_hmi.cpp`, `layout.cpp`, `ui_state.cpp`, same 480x272 units; tested with a recorder), `vector_screen.js` draws it on a canvas as vectors (panels, rows, robots, text), `hub_page.js` wires SSE, taps, pages and beeps.

## Tests

```bash
node --test hub/test/*.test.mjs
```

## Phone (PWA)

A phone on the same Wi-Fi can show the page full screen, read-only.

Shortcut: `node pair.mjs` (in the hub folder, `~/.agentsdash/core/<version>/`) does steps 1 and 2: it turns LAN access on, restarts the hub and prints the address and a QR code in the terminal.

1. Turn LAN access on: `"lan": {"enabled": true}` in `~/.agentsdash/config.json`, or start the hub with `AGENTSDASH_LAN=1`, then restart it. The hub then listens on `0.0.0.0` (`lan.bind` picks one address).
2. Open the page on the PC, click the Device button (plug icon): the Phone section shows a QR code. The terminal view prints the same address.
3. Scan it with the phone camera. The phone opens `/phone` and keeps a cookie.
4. A card explains the rest on the first visit: the "Full screen" button hides the browser bars (the Fullscreen API works over plain http), and the steps for a home screen shortcut. Afterwards a corner button re-enters full screen. On an iPhone, "Add to Home Screen" opens the page without bars. Android's install prompt needs HTTPS, which is not built yet.

The token lives in `~/.agentsdash/lan-token`; delete the file and restart the hub to pair again. A client that is not on the PC can only read (`/phone`, `/state`, `/events`, `/health`) and gets 401 without the cookie.
The link is plain `http`: anyone on the same Wi-Fi can read the traffic, so use it on a network you trust. HTTPS (and with it a service worker and offline mode) is not built yet.
The page keeps the screen awake (where the phone allows it) and shows "Hub unreachable, retrying" when the PC sleeps.
