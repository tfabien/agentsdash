# Devices

The browser page is the main way to use agentsdash. A **device** is an optional physical screen that shows the same thing, next to
the keyboard. Each device lives in a repository of its own (`agentsdash-device-<name>`) with its firmware, tools, tests and README. What a device receives and how the hub reduces text for it: [docs/device-protocol.md](../docs/device-protocol.md); the events themselves: [docs/protocol.md](../docs/protocol.md).

| Repository | Hardware | State |
|---|---|---|
| [`agentsdash-device-phone`](https://github.com/tfabien/agentsdash-device-phone) | A phone (iPhone or Android) as a PWA | first version, home Wi-Fi, read-only |
| [`agentsdash-device-artillery-x3`](https://github.com/tfabien/agentsdash-device-artillery-x3) | ESP32 DevKit + the 4.3" touchscreen (TJC, 480x272) of an Artillery X3 3D printer | works over Wi-Fi, USB relay written (not tried on the hardware) |

## What a device receives

The hub (`hub/`) forwards what it receives from the adapters. Two links exist today, chosen with `relay` in
`~/.agentsdash/config.json`:

| `relay` | Link | Device side |
|---|---|---|
| `{"mode": "http", "host": "<ip>"}` | the hub calls `POST /event` and `POST /usage` of the device over Wi-Fi | the device runs an HTTP server with that API |
| `{"mode": "serial", "port": "COM3"}` | the hub writes one JSON line per event on a USB serial port (needs `npm install serialport` in `hub/`) | the device reads lines `{"type":"event"\|"usage","body":{...}}` |

The body of an event is the same everywhere (wire format v2, ASCII, one full agent state per event, so the next event repairs a device
that rebooted). It is described in [device-protocol.md](../docs/device-protocol.md). A device that
prefers to follow the whole state instead of single events can read `GET /state` of the hub, or its server-sent events on `GET /events`:
the JSON is the same as the page gets.

A device does not have to be an ESP32: a Raspberry Pi with a small display, a stream deck, a Home Assistant panel or a USB-C monitor
driven by a small program can all read `GET /events` of the hub, with no firmware at all.

## Adding a device

1. Create a repository `agentsdash-device-<name>` with a `README.md`: the hardware, how to connect it, how to flash or run it, how to point the hub at it.
2. Keep everything of the device inside it (firmware, tools, tests, assets); the hub does not depend on any device.
3. Pick a link: relay over HTTP or serial (the device implements the small API above), or read `GET /events` of the hub.
4. Open a pull request here adding a row to the table above and to the [Devices section of the main README](../README.md#devices-optional).

The screen layout of the page (`hub/web/screen.js`) is a port of the firmware of the first device (`display_hmi.cpp`, `layout.cpp`, `ui_state.cpp` of the device repository; keep them in step): a new device with a
different size can reuse its rules (which view is shown, which rows, which colors) and draw them its own way.
