# Install agentsdash

> **For Claude Code.** A user asked you to install agentsdash and pointed you to this file. The hub in this repository is downloaded
> by the adapter for the agent in use. Follow https://raw.githubusercontent.com/tfabien/agentsdash-claude/main/INSTALL.md for Claude Code
> (adapter `agentsdash-claude`), then come back here only for the hub itself.

agentsdash shows every agent session, its sub-agents, its plan and its pending questions on one screen in the browser.
The hub (this repository) is a small local Node.js server. An adapter feeds it; the adapter finds or downloads the hub by itself.

## Where the hub lives

Adapters look for a core in this order: `AGENTSDASH_CORE_DIR` (a folder holding `hub.mjs`, for a checkout), then the highest
`~/.agentsdash/core/<version>/` that speaks protocol 2, else they download the newest release of `tfabien/agentsdash`
(`agentsdash-core-<version>-p<protocol>.tar.gz`, sha256 checked) into that folder. The first event is dropped while the download runs; the next one starts the hub.

## Run the hub by hand

```bash
node ~/.agentsdash/core/<version>/hub.mjs          # an installed core
node hub/hub.mjs                                   # a checkout of this repository
```

Open <http://127.0.0.1:8765/>. Check it with `curl http://127.0.0.1:8765/health` (`core` and `protocol` show what runs).

## Troubleshooting

| Need | Command or cause |
|---|---|
| Stop the hub | `curl -X POST http://127.0.0.1:8765/shutdown` (the next hook starts a new one) |
| Port 8765 busy | Another program uses it. Set `{"host": "127.0.0.1:8777"}` in `~/.agentsdash/config.json` (or the environment variable `AGENTSDASH_HOST=127.0.0.1:8777`), then open that address. |
| No page just after the install | The first hook downloads the hub into `~/.agentsdash/core/<version>/`; wait a minute, send another message. Offline: the download is retried every 10 minutes. |
| Use a checkout instead of the download | `AGENTSDASH_CORE_DIR=<checkout>/hub` in the environment of the agent |
| Themes | Optional themes (cat, lemmings, pirates...) are in https://github.com/tfabien/agentsdash-themes ; follow its `install.md`. |
| External screen | ESP32 gadget or USB display: see [devices/README.md](devices/README.md). |

Documentation: [README.md](README.md), [hub/README.md](hub/README.md), [docs/protocol.md](docs/protocol.md).
