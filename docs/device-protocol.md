# agentsdash device protocol

How the hub feeds an external screen (a device). A device repository implements this document; the hub side is generic and lives in the core (`relay_http.mjs`, `relay_serial.mjs`, `ascii.mjs`).
The device receives the same bodies as the hub (see `protocol.md`), after the reduction described here.

## What a device receives

Four routes, in this order of importance:

- `/event`: a v2 event of one agent. It carries the full state of that agent.
- `/usage`: quotas and context.
- `/dismiss`: a hidden session (`{ "session": "<id>" }`).
- `/settings`: settings the device cares about (`{ "sound": "all|ask|off" }`).

## Transports

The relay mode is set with `POST /relay` or the `relay` entry of the config file, and read back with `GET /relay`.

### http (over Wi-Fi)

`POST http://<device>/event`, `/usage`, `/dismiss` and `/settings`, JSON body, `Content-Type: application/json`. Timeout 2 s per request. Any non-2xx answer or network error is a failure.

- Items wait in a queue, sent one at a time.
- After a failure the relay pauses 3 s and keeps only the latest queued item of each key.
- While the lock file `agent-gadget-tft.lock` exists in the temp folder (a screen firmware upload is running) nothing is sent.
- The queue holds at most 50 items. Above that, the latest item of each key is kept, then the 50 newest.
- A key is `usage`, `settings`, `dismiss:<session>`, or `<session>:<agent>` for an event: a newer item replaces an older one with the same key.

### serial (USB)

One JSON line per item at 115200 baud: `{"type":"event|usage|dismiss|settings","body":{...}}` followed by a newline. Needs `npm install serialport` in the hub folder.

- After the port opens the device resets: the relay waits 2.5 s before it writes.
- When the port is missing or lost the relay retries every 5 s.
- `POST /serial/release` closes the port (so a tool can flash the device); `POST /serial/open` opens it again.
- Same queue and key rules as http.

## Text reduction (`forDevice`)

Device fonts hold ASCII glyphs only. Before sending, every string of the body (keys included) goes through `toAscii`: accents are stripped, typographic quotes, dashes, ellipsis and a few symbols are mapped to ASCII, any other character becomes `?`, zero-width characters are dropped.
For `/event` the field `cwd` is removed (the path stays on the hub), and every text field is cut to the firmware buffer of the device (buffer length minus the NUL):

| Field | Limit |
|---|---|
| `session` | 4 |
| `agent` | 4 |
| `project` | 14 |
| `role` | 23 |
| `evt` | 23 |
| `cmd` | 63 |
| `detail` | 60 |
| `title` | 30 |
| `model` | 40 |
| `plan_cur` | 47 |
| `plan_next` | 47 |
| `plan_state` | 16 |
| `question` | 120 |
| `options` | 100 |

Another device that needs other limits sets its own in the core (`DEVICE_LIMITS` of `ascii.mjs`); a per-device limit table is a later step of the split.

## Implementing a device

1. Answer the four routes (or read the four line types) and keep one record per `<session>:<agent>`.
2. Treat each `/event` as the full state of its agent.
3. Forget a session on `/dismiss` and on `SessionEnd` (`evt` of an event with `state` `done`).
4. Keep the screen alive when the hub stops sending: the hub sends nothing while it has nothing to say.
