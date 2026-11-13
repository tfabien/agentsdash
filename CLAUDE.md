# agentsdash (core)

Goal: an agent dashboard. **The browser page is the main product**: adapters (one repository each, `agentsdash-claude` for Claude Code) send events to this local Node.js hub,
which draws the screen in a web page. External devices (an ESP32 with the screen of an Artillery X3 printer, others later) are an optional bonus fed by the same hub.
(Formerly called standup-bot; split into several repositories, see `docs/superpowers/specs/2026-11-13-multi-repo-split-and-rename-design.md`.)

Language: chat with the user in French. **Code comments, documentation and on-screen text are in English by default.**

## Layout

- `hub/` the hub, released as a tarball: `hub.mjs` (HTTP + SSE), `model.mjs` (port of `firmware/model.cpp` of the device repository `agentsdash-device-artillery-x3`), `config.mjs`, `paths.mjs` (names, folders, old-name fallback),
  `web/` (the page: `screen.js` decides, `vector_screen.js` draws, `hub_page.js` wires the one page, `scenes.js`), `relay_http.mjs`, `relay_serial.mjs`, `tui.mjs`, `rules.mjs`,
  themes and packs as files (`themes/*.json`, `icons/<pack>/*.svg`, `themes_loader.mjs`, `tools/export_builtin.mjs`), the theme marketplace client (`market_*.mjs`, routes `/market*`, tab `web/market.js`),
  `tools/` (screenshots, GIF), `test/`. Node >= 18, standard library only; `serialport` is optional.
- `devices/README.md` how to add a device. Each device is its own repository (`agentsdash-device-artillery-x3`: firmware, screen project, tests, hardware notes).
- `docs/` `protocol.md` and `device-protocol.md` (the contract, checked by tests), `hub-themes.md`, `superpowers/` specs and plans, `images/` (README screenshots).
- `.github/workflows/` `test.yml` (Ubuntu and Windows, Node 20 and 24), `release.yml` (tag `vX.Y.Z` packs `hub/` as `agentsdash-core-X.Y.Z-p<protocol>.tar.gz` + `.sha256`).

Tests (no hardware): `node --test hub/test/*.test.mjs` (a directory argument fails on Node 24).

## Hub rules

- The hub imports nothing from an adapter and runs from a copy of its own folder (test `core_standalone`). It binds `127.0.0.1`, answers only requests whose Host is the hub and rejects foreign Origins (no CORS).
- Wire protocol 2 (`POST /event`, `/usage`, `/dismiss`, `/settings`...): `docs/protocol.md`; a test fails when a route or event field is missing there. `GET /health` reports `core` (from `hub/package.json`) and `protocol` (`PROTOCOL_VERSION` in `model.mjs`, equal to `package.json` `protocol`).
  Raise `version` in `hub/package.json` before tagging a release; the release workflow checks the tag against it.
- Adapters pick a core by protocol and minimum version (`docs/protocol.md`, "How an adapter picks a core"). The hub never polls quotas: adapters post `/usage`.
- `hub/test/fixtures/events.jsonl` is a copy of the events recorded from the Claude adapter's hooks; `contract.test.mjs` replays it. Refresh it when the adapter's file changes.
- The plugin and the hub keep text whole (full Unicode, no length limit). Text sent to a device goes through `forDevice` in `hub/ascii.mjs`: accents stripped, typographic quotes mapped, other characters become `?`, each field cut to the firmware buffer (`DEVICE_LIMITS`).
- Names: variables `AGENTSDASH_*` (old `CLAUDE_GADGET_*` as fallback), config `~/.agentsdash/config.json` (old `~/.claude/agent-gadget.json` as fallback), user folder `~/.agentsdash/` (the old `~/.claude/standup-bot/` is copied once), state folder `<temp>/agentsdash`.
- Themes and packs are read from `hub/` and `~/.agentsdash/` (the user folder wins), published as `catalog` in the state; `POST /reload` rescans; `POST /themes` saves a look as a user theme. Format: `docs/format.md` of the agentsdash-themes repository; hub side: `docs/hub-themes.md`.
- The page redraws the device screen as vectors: `web/screen.js` is a port of the firmware's `display_hmi.cpp`, `layout.cpp`, `ui_state.cpp` (same 480x272 units); keep them in step when the firmware UI changes.

## Pitfalls

- Windows: `process.exit` right after spawning a detached child crashes Node (libuv assertion): use `process.exitCode`.
- A shell here-document or `sed` turns `\n` in a replacement into a real newline: edit code with an editor tool or a Python script file.
- `sleep` of more than a few seconds is blocked in the shell tool: wait with a loop on a condition.
- README screenshots are the real page: `hub/tools/page_screenshots.mjs` (demo hub from `demo_seed.mjs`, marketplace theme `office` (needs network; `DEMO_THEMES=<name>` picks another), 4 tiles per page, needs Edge or Chrome). `page_gif.mjs` records the tour GIF (needs Python with Pillow). `screenshots.mjs` draws the device screen scenes only.
- Work PC (Windows 10 Enterprise, Fortinet VPN, Dell dock); prefer a personal PC to install new tools.
