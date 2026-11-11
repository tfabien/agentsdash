# Node.js hub and plugin - design

Status: implemented and merged into `main` (2026-11-11). See the Status section of the plan for deviations.

## Intent

Today the agent standup needs the ESP32 gadget, and the Claude Code plugin needs Python. Two changes:

1. A **Node.js hub** that runs on the PC, receives the plugin's events, keeps the agent state and shows it
   in a browser page, with or without the ESP32. It is also the **USB bridge** to the ESP32 for places without Wi-Fi.
2. A **plugin written in Node.js**, so nothing depends on Python at run time.

Why: people without the hardware can use the standup; the user wants Python out of the plugin; USB mode needs one process that owns the COM port.

## Goals

- Hub works alone: `node agent-hub/hub.mjs`, open `http://127.0.0.1:8765/`, see sessions, sub-agents, plan, questions, context, quotas.
- Same wire format as the gadget (`POST /event` v2, `POST /usage`, `GET /state`, `POST /select`, `POST /reset`), so the hub and the gadget are interchangeable targets.
- Same state rules as `model.cpp` (max 5 sessions, 12 sub-agents each, "needs you" first, derived `waiting_subs`, 30 s manual hold, TTLs).
- Hub relays to a gadget over Wi-Fi (HTTP) or USB (serial), chosen in `~/.claude/agent-gadget.json`.
- Plugin hooks, quotas, plan tracker, transcript usage and status line ported to Node; the Python versions are deleted once the ported tests pass.
- No npm dependency for the hub and the plugin, except `serialport` (native, prebuilt), installed only for USB mode.

## Non-goals

- No change to the screen UI or the HMI project.
- No Python removal from hardware tooling (`agent-gadget/*.py`, `tools/make_*.py`, `hmi_*.py`, API tests on a real gadget). They stay Python in this project.
- No authentication on the hub: it binds to `127.0.0.1` only, answers only requests whose `Host` is the hub, and rejects any `Origin` that is not the hub (no CORS).
- No accents on the wire: events stay ASCII, as the screen requires.

## Anti-goals

- A hub that must be started by hand before every session. The first hook starts it.
- A hook that slows Claude Code. The 1.5 s give-up and "never print, never fail" rules stay.
- A hub model that drifts from the firmware. Both must pass the same event-sequence fixtures.

## Constraints

- Node >= 18 (global `fetch`, `node:test`), ES modules, no build step. Developed on Node 24.18.
- Claude Code may not have `node` on `PATH` in every setup: `hooks.json` calls `node`, and the README states the requirement.
- The hooks stay stateless processes (marker files and transcript caches in the temp folder, as today).
- Opening a COM port resets the ESP32 (wait ~2.5 s). One owner of the port at a time.

## Approaches considered

- **A. Hub unique (chosen by the user).** Hooks always POST to `127.0.0.1:8765`. The hub holds state and fans out to the browser (SSE), a gadget over HTTP, a gadget over serial. Trade-off: one background process, started by the first hook.
- B. Hooks post directly to the gadget or an optional server. No process to manage, but no owner for the COM port. Rejected.
- C. Node server only, Python plugin kept. Rejected: the user wants Python gone.

## Design

```
Claude Code hooks --node notify.mjs--> POST 127.0.0.1:8765/event
status line / quotas ----------------> POST /usage
                                          |
                                    HUB (agent-hub/)
                                    model.mjs  (port of model.cpp)
                                    |-- GET /          browser page (SSE /events)
                                    |-- relay http --> ESP32 http://<ip>/event
                                    |-- relay serial -> ESP32 over USB (JSON lines)
                                    |-- quotas.mjs     OAuth quotas, polled while sessions are active
                                    `-- tui.mjs        terminal view (last phase)
```

### Layout

- `agent-hub/`: `hub.mjs` (HTTP server, config, relays), `model.mjs` (state rules), `web/` (page, JS, CSS), `relay_http.mjs`, `relay_serial.mjs`, `quotas.mjs`, `tui.mjs`, `test/`.
- `claude-plugin/agent-gadget/` v0.3.0: `scripts/notify.mjs`, `plan_tracker.mjs`, `transcript_usage.mjs`, `statusline.mjs`, `hooks/hooks.json` calling `node`.

### Hub

- Endpoints as the gadget (see `agent-gadget/ARCHITECTURE.md`, section Wire format), plus `GET /events` (SSE of `/state` changes) and `GET /` (page).
- `model.mjs` is a line-by-line port of the rules in `model.cpp`, with the same revision counters. Parity test: JSON fixtures (event sequences and the expected `/state`) run against `model.mjs` and, optionally, a real gadget (`GADGET_HOST`).
- Page (as built): the gadget screen drawn on a canvas as vectors at the display resolution, same 480x272 layout, colors and wording as the firmware (title bar with session dots, lead panel with plan and context, team rows, session list, question, standby clock, quota bar), robots redrawn as vectors, robot blink and plan pulse as on the gadget. Taps work like the touchscreen (session list, agent detail for 10 s, speaker button cycles `all` / `ask` / `off`); a session picked in the list is sent as `POST /select`. The relay state shows under the screen.
- Config in `~/.claude/agent-gadget.json`: `host` (hub address, default `127.0.0.1:8765`), `relay`: `{"mode":"none"|"http"|"serial","host":"<ip>","port":"COM3"}`, `quotas`, `context_window`, as today.
- Autostart: on connection refused, `notify.mjs` spawns `node hub.mjs` detached (hidden window on Windows), waits up to 400 ms, retries once. If the hub still does not answer, the event is dropped.

### Plugin

- Straight port of `notify.py` (`build_event`, markers, `ascii_clean`, ask parts, mask, dry run, dump), `plan_tracker.py`, `transcript_usage.py`, `statusline.py`.
- `quotas.py` logic moves into the hub (`quotas.mjs`): the token in `~/.claude/.credentials.json` is read by one process, polled at most once a minute while a session is active, 15 min backoff on 429, never printed. Opt-out as today (`CLAUDE_GADGET_QUOTAS=0`).
- Environment options kept: `CLAUDE_GADGET_HOST`, `CLAUDE_GADGET_MASK`, `CLAUDE_GADGET_DRY_RUN`, `CLAUDE_GADGET_DUMP`, `CLAUDE_GADGET_QUOTAS`.
- The existing unit tests (`claude-plugin/agent-gadget/tests`) are ported to `node:test` first, then the Python scripts are deleted.

### Serial relay

- The hub opens the COM port (115200), waits 2.5 s, then writes one JSON line per event or usage update.
- **Firmware change needed:** the `DISPLAY_SERIAL` backend only prints. The firmware must read JSON lines from USB serial and feed the same code path as `POST /event` and `POST /usage`. Small addition in `net.cpp` or a new `serial_in.cpp`, shared by all environments.
- The hub exposes `POST /serial/release` and `POST /serial/open` so `pio upload` or `hmi_bridge` can take the port. If the port is missing, the hub retries every 5 s and the page shows "USB not connected".

### Terminal view

`node agent-hub/tui.mjs` connects to `/events` and prints the same views with ANSI colors. Last phase.

## Phases

1. Hub core: `model.mjs`, endpoints, web page, parity fixtures; `notify.mjs` with autostart. Works with no hardware.
2. Rest of the plugin in Node (plan, transcript usage, status line), quotas in the hub, Python plugin scripts deleted, version 0.3.0.
3. HTTP relay to a Wi-Fi gadget.
4. Serial relay and firmware serial input.
5. Terminal view.

## Calls made by me (to check)

- Name `agent-hub`, port 8765, default bind `127.0.0.1`.
- Transcript and plan parsing stay in the hooks (straight port, no redesign). Quotas move to the hub.
- Protocol v1 (`CLAUDE_GADGET_PROTOCOL=1`) is dropped: it only served gadgets flashed before the v2 firmware.
- Web page first, terminal view last.
- Hardware tooling stays Python (non-goal above).

## Left to the builder

Exact page styling, SSE message shape, Windows detached-spawn details, serial reconnect timings, fixture content, README text.
