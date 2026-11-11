# Devices

The browser page is the main way to use standup-bot. A **device** is an optional physical screen that shows the same thing, next to
the keyboard. Each device lives in its own folder here, with its firmware, its tools, its tests and its own README.

| Folder | Hardware | State |
|---|---|---|
| [`artillery-x3-esp32/`](artillery-x3-esp32/README.md) | ESP32 DevKit + the 4.3" touchscreen (TJC, 480x272) of an Artillery X3 3D printer | works over Wi-Fi, USB relay written (not tried on the hardware) |

## What a device receives

The hub (`plugin/hub/`) forwards what it receives from the plugin. Two links exist today, chosen with `relay` in
`~/.claude/agent-gadget.json`:

| `relay` | Link | Device side |
|---|---|---|
| `{"mode": "http", "host": "<ip>"}` | the hub calls `POST /event` and `POST /usage` of the device over Wi-Fi | the device runs an HTTP server with that API |
| `{"mode": "serial", "port": "COM3"}` | the hub writes one JSON line per event on a USB serial port (needs `npm install serialport` in `plugin/hub/`) | the device reads lines `{"type":"event"\|"usage","body":{...}}` |

The body of an event is the same everywhere (wire format v2, ASCII, one full agent state per event, so the next event repairs a device
that rebooted). It is described in [`artillery-x3-esp32/ARCHITECTURE.md`](artillery-x3-esp32/ARCHITECTURE.md#wire-format). A device that
prefers to follow the whole state instead of single events can read `GET /state` of the hub, or its server-sent events on `GET /events`:
the JSON is the same as the page gets.

A device does not have to be an ESP32: a Raspberry Pi with a small display, a stream deck, a Home Assistant panel or a USB-C monitor
driven by a small program can all read `GET /events` of the hub, with no firmware at all.

## Adding a device

1. Create `devices/<name>/` with a `README.md`: the hardware, how to connect it, how to flash or run it, how to point the hub at it.
2. Keep everything of the device inside that folder (firmware, tools, tests, assets). Nothing outside `devices/` may depend on it.
3. Pick a link: relay over HTTP or serial (the device implements the small API above), or read `GET /events` of the hub.
4. Add a row to the table above and to the [Devices section of the main README](../README.md#devices-optional).

The screen layout of the page (`plugin/hub/web/screen.js`) is a port of the firmware of the first device: a new device with a
different size can reuse its rules (which view is shown, which rows, which colors) and draw them its own way.
