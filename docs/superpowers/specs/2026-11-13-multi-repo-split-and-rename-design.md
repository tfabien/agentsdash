# Split into core, adapters, themes and devices; rename to agentsdash

Date: 2026-11-13. Status: draft for approval.

## Intent and why

The repo started as "standup-bot": a Claude Code plugin that feeds a local hub, which draws a team call on a web page and optionally on an ESP32 screen.
The product is now a dashboard that follows what coding agents are doing (who works, who waits, who needs the user), so the name and the repo layout are wrong.

Reasons for the split, as given by the owner:

1. Add Codex and other agents without touching the core.
2. Let a user install only what they need (a user without the printer does not download the firmware).
3. Let third parties publish adapters, devices and themes without touching the core.

Not given as reasons: independent release rhythm (it comes as a side effect).

## Goals

- Five kinds of repository, each with its own version and README:
  - **core** `agentsdash`: hub (HTTP + SSE), model, web page, generic relays (http, serial), tui, theme marketplace client, the written protocol.
  - **themes** `agentsdash-themes`: already separate as `standup-bot-themes`, renamed.
  - **adapters**: `agentsdash-claude` (Claude Code plugin: hooks, statusline, skills), `agentsdash-codex` (new).
  - **devices**: `agentsdash-device-artillery-x3` (firmware, screen project, tests, assets), one repo per future device.
- A written contract in the core (`docs/protocol.md`, `docs/device-protocol.md`): the `POST /event` v2 body, `/usage`, `/dismiss`, `/settings`, the SSE state, the relay payloads. An adapter or a device is correct when it follows the contract.
- An adapter installs the core by itself on first use, with no npm and no manual step.
- The project gets one name everywhere: `agentsdash`.

## Non-goals

- No rewrite of the hub or the page. Code moves, imports are cut, behaviour stays.
- No change of the event protocol version (stays `v: 2`).
- No npm publication, no bundler, no new runtime dependency (Node >= 18, stdlib only; `serialport` stays optional).
- No Codex adapter before the core extraction is done.

## Anti-goals

- A split that makes the Claude install harder than today (one command, no manual copy).
- Two hubs on one machine because two adapters each ship their own core.
- A broken hook: `notify.mjs` runs in every Claude session and must never block, print, or exit non-zero.

## Constraints found in the code

- `plugin/hub/hub.mjs` imports `../scripts/common.mjs`; `plugin/hub/quotas.mjs` imports `../scripts/statusline.mjs`. Both files belong to the Claude plugin.
- `plugin/scripts/hub_client.mjs` starts the hub from a relative path (`../hub/hub.mjs`). A marketplace install copies only `plugin/`, so a separate adapter cannot reach the hub that way.
- `quotas.mjs` reads the OAuth token of `~/.claude/.credentials.json` and calls Anthropic endpoints: it is Claude specific.
- The theme marketplace already downloads GitHub repositories at run time (`market_install.mjs`, `market_bootstrap.mjs`): the mechanism to reuse.
- Names to migrate: `standup-bot` (repo, marketplace, plugin, `~/.claude/standup-bot/`), `agent-gadget.json`, `CLAUDE_GADGET_*`, the `standup-bot-hub` package, the hub default theme source.
- `web/screen.js` is a port of the ESP32 firmware UI (`display_hmi.cpp`, `layout.cpp`, `ui_state.cpp`).
- The work PC blocks installing new tools (Fortinet): npm must not be required.
- A "claude plugin" install of `standup-bot@standup-bot` exists on the owner's machine and reads the local checkout live.

## Approaches considered

1. **Core downloaded from GitHub at first run** (picked by the owner). An adapter carries a small bootstrap that downloads a core release into `~/.agentsdash/core/<version>/`, then starts the hub from there. It reuses the theme download mechanism, needs no npm, and keeps one core per machine.
2. Core on npm, adapters run `npx agentsdash`. Standard, but needs npm and registry access; rejected for the work PC.
3. Monorepo with separate packages, split into repos later. Cheapest migration, but it postpones the one-repo-per-device goal and keeps third parties inside the core repo; rejected.

## Design

### Contract and versions

- `docs/protocol.md` in the core is the source of truth. The core exposes `GET /health` returning `{ core: "<semver>", protocol: 2 }`.
- Each adapter declares the protocol version it speaks and a minimum core version. On start, the bootstrap picks the newest core release whose protocol matches, or keeps the installed one if it still matches.
- Core releases are GitHub releases with a tarball and a `sha256` file; the bootstrap checks the hash before unpacking.

### Core layout

- `hub/` (today `plugin/hub/`), `docs/`, `common.mjs` (config and state directory helpers, moved from the plugin).
- The hub no longer imports anything from an adapter. Quotas become push only: an adapter POSTs `/usage` (today's route); the Claude adapter owns the polling code.
- Config file `~/.agentsdash/config.json`; the old `~/.claude/agent-gadget.json` and the `CLAUDE_GADGET_*` variables are read as a fallback for one major version, then dropped. New variables: `AGENTSDASH_HOST`, `AGENTSDASH_MASK`, `AGENTSDASH_DUMP`, `AGENTSDASH_DRY_RUN`, `AGENTSDASH_QUOTAS`.
- User themes and packs move to `~/.agentsdash/`; the old folder is read as a fallback and copied on first start.

### Adapters

- `agentsdash-claude`: `hooks/`, `scripts/` (`notify.mjs`, `plan_tracker.mjs`, `session_prompts.mjs`, `transcript_usage.mjs`, `statusline.mjs`, the quota poller), `skills/`, `.claude-plugin/`, the marketplace file. The plugin name is `agentsdash`.
- `notify.mjs` keeps its rules (never blocks, never prints, exit 0, gives up after 1.5 s). The bootstrap runs inside the same budget: when the core is missing it starts the download detached and drops the event; the next event finds the core.
- `agentsdash-codex`: written after the extraction, against the protocol only. Its hook surface is to be researched then.
- Tests of the hooks move with the adapter. A contract test in the core replays recorded adapter events (`docs/hook-payloads.md` fixtures) against the model.

### Devices

- `agentsdash-device-artillery-x3`: `firmware`, `screen-hmi`, `assets`, `tests`, `scripts`, `hmi_bridge`, `hmi_probe`, its `CLAUDE.md`.
- The core documents the relay side once (`docs/device-protocol.md`); the hub keeps the generic http and serial relays and `ascii.mjs`.
- `web/screen.js` (the vector redraw of the Artillery screen) stays in the core for now, with a header comment naming the device repo as the other half to keep in step. Moving it is a later decision, when a second device exists.

### Rename and history

- GitHub: `tfabien/standup-bot` becomes `tfabien/agentsdash` (the core, history kept; GitHub redirects the old URL). `standup-bot-themes` becomes `agentsdash-themes`. The adapter and device repos are created with `git filter-repo` so their history follows.
- Name used in code, docs and on-screen text: "Agents Dash" for display, `agentsdash` for identifiers.
- The old plugin `standup-bot@standup-bot` stays installable for one release as a stub whose only job is to tell the user to switch (its hooks are removed so nothing runs twice).

### Order of work (each step is shippable alone, each gets its own plan)

1. Name and protocol: rename in code, docs and on-screen text (plugin name, `marketSources`, display name); the owner renames the two GitHub repos (`standup-bot`, `standup-bot-themes`) so every later URL is final; write `docs/protocol.md` and `docs/device-protocol.md` from the current code; add `core` and `protocol` to `/health`. No code moves.
2. Core extraction: cut the two `../scripts` imports, move `common.mjs` into the core, add the new config and variable names with the old ones as fallback (`CLAUDE_GADGET_CONFIG`, `_STATE_DIR`, `_HUB_SCRIPT`, `_PROMPTS` included), add the release workflow (tarball + sha256, final repo URL).
3. Claude adapter repo: bootstrap, vendored client, detached quota poller, filter-repo of `plugin/` minus `hub/`, migration notes, stub for the old plugin.
4. Artillery X3 device repo: filter-repo of `devices/artillery-x3-esp32/`, own CI.
5. Codex adapter.

## Calls made by the author (not yet checked with the owner)

- Quotas are pushed by the Claude adapter, the hub never polls. The poller is a detached child process started by a hook and throttled to one run per minute by a timestamp file (same spawn pattern as the hub start). The core keeps no Claude code.
- The client (post an event, find the host, start the hub) is vendored in each adapter, not shipped in the core. Hooks never import code from a downloaded core, so a bad core release cannot break hooks. The contract test in the core posts recorded v2 events to a running hub and checks the state; each adapter has a test that its vendored client passes the same fixtures. The `client.mjs` listed under core layout is dropped.
- One shared core in `~/.agentsdash/core/<version>/`. Rule when adapters disagree: the highest installed core that matches the protocol runs and is never downgraded. An adapter restarts a running hub only when the hub is older than the adapter's minimum core. The old mtime-based restart (`restartStaleHub`) is removed.
- Running the core from a checkout: `AGENTSDASH_CORE_DIR=<path>` replaces the download and the version rule (successor of `CLAUDE_GADGET_HUB_SCRIPT`).
- The contract test uses recorded v2 events (captured from the current hooks), not the raw payloads of `docs/hook-payloads.md`.
- `screen.js` stays in the core until a second device.
- The old plugin ships one stub release, then the old repo name is left to GitHub's redirect.
- Old config and variable names are honored for one major version.

## Left to the builder

- Exact format of the release tarball and the update check frequency.
- How the bootstrap behaves offline or behind a proxy (retry window, message).
- CI layout of each repo (the current workflow runs on Ubuntu and Windows, Node 20 and 24).
- Whether the Claude adapter's statusline keeps its manual install step.
