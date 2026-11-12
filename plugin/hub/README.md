# standup-bot hub

Local Node.js hub for the agent standup. It receives what the Claude Code plugin sends (`POST /event` v2,
`POST /usage`, the same wire format as the gadget), keeps the state of every session and sub-agent, and shows it in a
browser page. It works with no hardware, and can relay the same events to the ESP32 gadget.

Requires Node.js >= 18. No npm install is needed (the optional `serialport` package is only for USB mode).

## Run

The plugin starts the hub by itself: the first hook finds nothing on `127.0.0.1:8765`, starts `hub.mjs` detached
and sends its event again. To run it by hand:

```bash
node plugin/hub/hub.mjs
```

Then open <http://127.0.0.1:8765/>: the page shows the gadget screen with the same layout, colors and wording: title bar with the
session dots, lead panel with its plan and context, team rows, session list, questions and the quota bar.
It is drawn as vectors at the resolution of your display (any size, any pixel ratio), with robots redrawn in vector
form. It reads the same state as the gadget, so the two always agree. Taps work like the touchscreen: the title bar
opens the session list, a team row shows that agent for 10 s, the speaker button cycles the beeps (all, ask only, off).
Under the screen a line shows whether the relay reaches the gadget.

## Sessions hub page

<http://127.0.0.1:8765/hub> shows every session as a tile in a grid; `/` is still the one-session screen, linked from the hub header ("full page") and back ("Sessions hub").

- Files: `web/hub.html`, `hub.css`, `hub_page.js` (DOM), `hub_view.js` (pure logic: grid shape, which sessions get a tile, what a tile says, quota bars), `alerts.js` (beep rule shared with the main page).
- One `EventSource('/events')` feeds all tiles. Tiles are links to `/?session=<id>`; the main page then calls `POST /select` for that session.
- Grid: auto-fit by count (1: 1x1, 2: 2x1, 3: 3x1, 4: 2x2, 5 to 9: 3 columns, then about the square root). Query `?max=N` changes the tile limit (default 6).
- Past the limit the most urgent sessions keep a tile (needs you, error, working, waiting, your turn, done), in the hub order; the others fold into one placeholder tile. Click it or the "show all" chip to show them.
- `needs_you` tiles are orange, `error` tiles red. The beeps follow the same rule and the same shared setting as the main page (the "beeps" chip cycles it).
- Quotas and clock: once, in the bottom bar, with the pace colors of the screen. Tiles show the context fill, not the quotas.
- Small tiles drop details through container queries: plan text first, then the command.
- The hub keeps 12 sessions. `max_sessions` in the config file (or env `CLAUDE_GADGET_MAX_SESSIONS`, 1 to 32) raises it; the relayed device keeps its own limit.

The hub binds to `127.0.0.1` only and has no authentication.

## Terminal view

```bash
node plugin/hub/tui.mjs [--host 127.0.0.1:8765]
```

The same information in the terminal, with colors: one block per session (most urgent first), its plan, context, question
and sub-agents, then the quotas. It follows `GET /events` and reconnects when the hub restarts. Ctrl+C quits.

## Configuration

`~/.claude/agent-gadget.json` (all keys optional) and environment variables:

| Key | Default | Meaning |
|---|---|---|
| `host` | `127.0.0.1:8765` | Where the plugin sends events and where the hub listens (env `CLAUDE_GADGET_HOST`). |
| `relay` | `{"mode":"none"}` | `{"mode":"http","host":"<gadget ip>"}` forwards events to a gadget over Wi-Fi; `{"mode":"serial","port":"COM3"}` over USB. |
| `quotas` | `true` | Poll the 5-hour and weekly plan quotas (env `CLAUDE_GADGET_QUOTAS=0` turns it off). |
| `context_window` | `1000000` | Context window used for the context estimate (tokens). |
| `max_sessions` | `12` | Sessions the hub keeps (1 to 32, env `CLAUDE_GADGET_MAX_SESSIONS`). More than 5 only helps the `/hub` page. |

## Relay to a gadget (Wi-Fi)

With `"relay": {"mode": "http", "host": "192.168.1.100"}` every event and usage report the hub accepts is forwarded
unchanged to the gadget (`POST /event`, `POST /usage`). `GET /relay` shows the state (`ok`, `lastError`, `queued`).
If the gadget is down, the hub keeps working and retries after 3 seconds (only the latest event per agent is kept).
The gadget aborts a screen upload (`/tft`) on any other request: create the file `agent-gadget-tft.lock` in the temp
folder before uploading and delete it afterwards, and the relay sends nothing meanwhile.

## Relay to a gadget (USB)

For places without Wi-Fi: `"relay": {"mode": "serial", "port": "COM3"}`. The hub opens the port at 115200 baud
(this resets the ESP32, so it waits 2.5 s) and writes one JSON line per event or usage report:
`{"type":"event","body":{...}}` (body = the POST body). The firmware reads these lines on USB (lines that
start with `{`; any other character keeps its old meaning, `r` `t` `w`). Install the driver once, in `plugin/hub/`:
`npm install serialport` (prebuilt binaries, no compiler needed).

One program owns the COM port at a time. To flash the firmware or the screen from the PC, give the port back first:

```bash
curl -X POST http://127.0.0.1:8765/serial/release     # close COM3, stop retrying
curl -X POST http://127.0.0.1:8765/serial/open        # take it back
```

While the port is missing the hub retries every 5 seconds; `GET /relay` shows `connected` and `lastError`.

## HTTP API

`POST /event`, `POST /usage`, `GET /state`, `POST /select`, `POST /reset` as on the gadget, `POST /dismiss {"session"}` (hide a session until it works again or needs you; forwarded to the device), `POST /settings {"sound": "all"|"ask"|"off"}` (the beeps, shared by every page, kept in `hub-settings.json` in the temp folder; default `ask`; forwarded to the gadget buzzer at start and on every change)
(see `../../devices/artillery-x3-esp32/ARCHITECTURE.md`), plus `GET /events` (server-sent events: the state on connect, then on every
change and every second), `GET /health` and `GET /` (the page).

## Files

- `hub.mjs` HTTP server and wiring, `config.mjs` configuration.
- `model.mjs` state rules, a port of `model.cpp` (5 sessions, 12 sub-agents each, "needs you" first, TTLs, selection).
- `relay_http.mjs`, `relay_serial.mjs` forward events to a gadget (Wi-Fi, USB).
- `tui.mjs` terminal view.
- `quotas.mjs` plan quota poller (OAuth token from `~/.claude/.credentials.json`, or the macOS Keychain, never printed).
- `web/` the page: `screen.js` decides what is drawn (port of `display_hmi.cpp`, `layout.cpp`, `ui_state.cpp`, same 480x272 units; tested with a recorder), `vector_screen.js` draws it on a canvas as vectors (panels, rows, robots, text), `app.js` wires SSE, taps and beeps.

## Tests

```bash
node --test plugin/hub/test/*.test.mjs
```
