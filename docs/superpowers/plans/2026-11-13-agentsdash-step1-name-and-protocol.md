# agentsdash step 1: name and protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project to `agentsdash` in code, docs and on-screen text, write the protocol documents, and make `/health` report the core and protocol versions. No code moves between repos.

**Architecture:** Three independent changes on the current single repo: a `/health` extension, two protocol documents guarded by a test that compares them with the code, and an identifier rename guarded by a test that scans for the old name. Config names (`agent-gadget.json`, `CLAUDE_GADGET_*`) and the user folder `~/.claude/standup-bot/` stay until step 2.

**Tech Stack:** Node >= 18 stdlib, `node --test`, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-13-multi-repo-split-and-rename-design.md` (step 1 of "Order of work").

## Global Constraints

- Node >= 18, stdlib only, no new dependency.
- Project name: `agentsdash` for identifiers, "Agents Dash" for display text.
- Event protocol version stays `v: 2`.
- Code comments, documentation and on-screen text are in English.
- No em dashes or en dashes in the documents written.
- `notify.mjs` and the hooks keep their rules (never block, never print, exit 0).
- Tests run with `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` (no directory argument).
- Not renamed in this step: `agent-gadget.json`, `CLAUDE_GADGET_*`, `~/.claude/standup-bot/` (step 2).
- Files under `docs/superpowers/specs` and `docs/superpowers/plans` keep their old wording (history).

## Review Focus

- A hub started by an older plugin answers `/health` without `core` or `protocol`: `hub_client.mjs` must keep working with `version` only (test in Task 1).
- A user whose saved settings still list `tfabien/standup-bot-themes`: the saved value wins over the new default and keeps working through GitHub's redirect (test in Task 3).
- A doc that lists a route or field the code no longer has: the doc test fails on removed items too, not only on missing ones (Task 2).
- The page opened in a browser that has the old `standup.sessions` cache key: it starts empty without an error (Task 3).
- Installed plugin key changes from `standup-bot@standup-bot` to `agentsdash@agentsdash`: hooks of the old install stop after the owner's reinstall, never run twice (Task 5).

---

### Task 1: `/health` reports `core` and `protocol`

**Files:**
- Modify: `plugin/hub/model.mjs` (add the export near the other top-level constants)
- Modify: `plugin/hub/hub.mjs:196` (the `GET /health` case)
- Test: `plugin/hub/test/hub.test.mjs` (next to `health_answers_ok`, line 62)

**Interfaces:**
- Produces: `export const PROTOCOL_VERSION = 2` in `plugin/hub/model.mjs`; `GET /health` returns `{ ok: true, version: string, core: string, protocol: 2, script: string, startedAt: number }`. `core` equals `version` (the plugin version) until step 2 gives the core its own version.

- [ ] **Step 1: Write the failing test** in `hub.test.mjs`, `health_reports_core_and_protocol`: start a hub with `withHub`, GET `/health`, assert `body.protocol === 2`, `typeof body.core === 'string'`, `body.core === body.version`, `body.ok === true`.
- [ ] **Step 2: Run** `node --test --test-name-pattern=health_reports plugin/hub/test/hub.test.mjs`. Expected: FAIL on `protocol`.
- [ ] **Step 3: Implement** `PROTOCOL_VERSION` in `model.mjs` and import it in `hub.mjs`; add `core: pluginVersion, protocol: PROTOCOL_VERSION` to the `/health` object. Keep `version`, `script`, `startedAt` unchanged (`hub_client.mjs` reads them).
- [ ] **Step 4: Run** the same command, then `node --test plugin/test/*.test.mjs` (hub client tests). Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Hub: /health reports core and protocol"`.

### Task 2: Protocol documents and the test that keeps them true

**Files:**
- Create: `docs/protocol.md`, `docs/device-protocol.md`
- Create: `plugin/hub/test/protocol_doc.test.mjs`
- Modify: `plugin/hub/ascii.mjs:35` (export `DEVICE_LIMITS`)

**Interfaces:**
- Consumes: `PROTOCOL_VERSION` (Task 1); `DEVICE_LIMITS` (exported here as `export const DEVICE_LIMITS`).
- Produces: documents that every adapter and device repo links to. `protocol.md` structure: one section per route (`### POST /event`, `### POST /usage`, `### POST /dismiss`, `### POST /settings`, `### POST /select`, `### POST /reset`, `### GET /state`, `### GET /events`, `### GET /health`, `### POST /shutdown`, `### POST /reload`), the v2 event field table, the `/usage` field table, the state JSON (`toState` in `model.mjs:435`), the host rules (Host and Origin checks of `hub.mjs:187`), and the compatibility rule (`protocol` in `/health`). The market and relay routes (`/market*`, `/relay*`, `/serial/*`, `/themes`) go in a short "Hub management routes" section as a table with method, path, one line each.
- `device-protocol.md`: the http relay (`POST http://<device>/event|/usage|/dismiss|/settings`, same bodies after `forDevice`), the serial relay (one JSON line `{"type": <route>, "body": {...}}` at 115200 baud, 2.5 s settle after open), the `forDevice` rules and the `DEVICE_LIMITS` table, the queue and retry behaviour (`maxQueue` 50, keyed replacement).

- [ ] **Step 1: Write the failing test** `protocol_doc.test.mjs` with three tests:
  - `every_hub_route_is_documented`: read `hub.mjs`, collect every `case 'METHOD /path'` string, assert each appears in `docs/protocol.md`; and every `METHOD /path` token found in the headings of `protocol.md` still exists in `hub.mjs` (removed items fail too).
  - `every_event_field_is_documented`: read `model.mjs`, take the text between `if (ev.v === 2) {` and `const name = clean(ev.agent)`, collect each `ev.<field>`, assert `` `<field>` `` appears in `protocol.md`.
  - `device_limits_are_documented`: for each key of `DEVICE_LIMITS`, assert `device-protocol.md` contains `` `<key>` `` and its number.
- [ ] **Step 2: Run** `node --test plugin/hub/test/protocol_doc.test.mjs`. Expected: FAIL (files missing).
- [ ] **Step 3: Write the two documents** from the code read in `hub.mjs`, `model.mjs`, `ascii.mjs`, `relay_http.mjs`, `relay_serial.mjs`, `statusline.mjs` (`usageBody`). State values: `needs_you`, `error`, `your_turn`, `working`, `done` on the wire (`PARSE` in `model.mjs:18`); session and agent ids cut to 4 characters; response codes (400 invalid, 403 host, 404 unknown session, 413 above 64 KiB). Also export `DEVICE_LIMITS` in `ascii.mjs`.
- [ ] **Step 4: Run** the test. Expected: PASS. Then break one heading on purpose, confirm FAIL, restore.
- [ ] **Step 5: Commit** `git commit -m "Docs: protocol and device protocol, checked against the code"`.

### Task 3: Rename identifiers and on-screen text

**Files:**
- Create: `plugin/hub/test/naming.test.mjs`
- Modify: `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json` (name `agentsdash`, author, descriptions), `plugin/hub/package.json` (name `agentsdash-hub`), `plugin/hub/hub.mjs` (default `marketSources` at line 50, stderr lines 450 and 452), `plugin/hub/market_source.mjs:10` (User-Agent), `plugin/hub/tui.mjs:65`, `plugin/hub/web/hub.html:6`, `plugin/hub/web/scene.html:5`, `plugin/hub/web/session_cache.js:8`, `plugin/hub/web/themes.js` (author fields), `plugin/hub/themes/line.json`, `plugin/hub/tools/demo_seed.mjs:75,78`, `plugin/scripts/session_prompts.mjs:21,43,57`, `plugin/skills/install-theme/SKILL.md`, `devices/artillery-x3-esp32/scripts/hmi_standup_demo.py` (text only), `devices/artillery-x3-esp32/firmware/display_hmi.cpp` and `ui_theme.h` (comments only)
- Modify tests that assert the old strings: `plugin/hub/test/web.test.mjs:35`, `plugin/hub/test/tui.test.mjs:68`, `plugin/hub/test/hub.test.mjs:333` and its two temp-folder comments
- Modify: `plugin/hub/tools/export_builtin.mjs` if it writes the `author` field (keep it in step with `themes.js`)

**Interfaces:**
- Produces: display name "Agents Dash" (page `<title>`, TUI first line, scene page title `Agents Dash scene`); plugin and marketplace name `agentsdash`; default market source `tfabien/agentsdash-themes`; session cache key `agentsdash.sessions`; hook prompt prefix `agentsdash:`.

- [ ] **Step 1: Write the failing test** `naming.test.mjs`: `old_name_is_gone` walks `plugin/` (skip `node_modules`, `__pycache__`, `test/`), plus `.claude-plugin/` and `devices/**/scripts`, and fails on any match of `/standup-bot|Agent standup|standup\.sessions/` except lines that contain `'.claude', 'standup-bot'` or `~/.claude/standup-bot` (the user folder, removed in step 2; the exception is a named constant in the test). Second test `saved_old_source_still_wins`: start a hub with a settings file that holds `marketSources: ['tfabien/standup-bot-themes']`, assert `/state` `settings.marketSources` equals that saved value.
- [ ] **Step 2: Run** `node --test plugin/hub/test/naming.test.mjs`. Expected: `old_name_is_gone` FAILS listing the files; the second test PASSES already (it pins existing behaviour).
- [ ] **Step 3: Rename** every listed file. `hub.mjs` default `marketSources: ['tfabien/agentsdash-themes']`. Update the tests that assert old strings to the new strings. Do not touch `agent-gadget`, `CLAUDE_GADGET_*`, the `~/.claude/standup-bot` path in code.
- [ ] **Step 4: Run** the full suite `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs`, then `claude plugin validate plugin` and `claude plugin validate .`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "Rename standup-bot to agentsdash in code and on-screen text"`.

### Task 4: Rename in the documents

**Files:**
- Modify: `README.md`, `INSTALL.md`, `CLAUDE.md`, `plugin/README.md`, `plugin/hub/README.md`, `docs/hub-themes.md`, `devices/README.md`, `devices/artillery-x3-esp32/README.md`
- Modify: `.github/workflows` only if it names the old repo (it does not today)
- Test: extend `naming.test.mjs` with `docs_use_the_new_name`

**Interfaces:**
- Consumes: new names from Task 3.
- Produces: install commands that use `agentsdash@agentsdash` and the marketplace `tfabien/agentsdash`; a "Protocol" link to `docs/protocol.md` and `docs/device-protocol.md` in `README.md`, `plugin/hub/README.md` and `devices/README.md`; a note in `CLAUDE.md` that config names (`agent-gadget.json`, `CLAUDE_GADGET_*`) and `~/.claude/standup-bot/` are still the old ones and move in step 2 of the split.

- [ ] **Step 1: Write the failing test** `docs_use_the_new_name`: the listed Markdown files contain no `standup-bot` and no `Agent standup`, except in lines that contain `agent-gadget`, `CLAUDE_GADGET`, `.claude/standup-bot`, or the words "formerly" or "renamed".
- [ ] **Step 2: Run** the test. Expected: FAIL listing the files.
- [ ] **Step 3: Edit the documents.** Add one sentence in `README.md` that the project was called standup-bot. Keep the Claude install steps working: `INSTALL.md` is read by Claude Code to install, so each command must be exact and tested on the final names (see Task 5).
- [ ] **Step 4: Run** the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Docs: rename to agentsdash, link the protocol"`.

### Task 5: Owner actions and local migration (no code)

**Files:** none. Checklist for the owner, each item run only after the owner says go.

- [ ] **Step 1:** Merge the branch of Tasks 1 to 4 into `main` and push.
- [ ] **Step 2:** The owner renames the GitHub repositories `tfabien/standup-bot` to `tfabien/agentsdash` and `tfabien/standup-bot-themes` to `tfabien/agentsdash-themes` (GitHub redirects the old URLs for clones, the API and raw files). Then `git remote set-url origin https://github.com/tfabien/agentsdash.git`.
- [ ] **Step 3:** On the owner's machine: `claude plugin uninstall standup-bot@standup-bot`, `claude plugin marketplace remove standup-bot`, `claude plugin marketplace add <this checkout>`, `claude plugin install agentsdash@agentsdash`. Open a **new** Claude session (hooks load at session start).
- [ ] **Step 4:** Check in the new session: the page title reads "Agents Dash", `curl http://127.0.0.1:8765/health` shows `"protocol":2`, and only one set of hooks fires (events appear once on the page).

---

## Self-review

- Spec coverage: step 1 of the spec (rename in code, docs and text; owner renames repos; `docs/protocol.md`; `docs/device-protocol.md`; `core` and `protocol` in `/health`) maps to Tasks 3, 5, 2, 2, 1. The plugin name and `marketSources` are in Task 3.
- Type consistency: `PROTOCOL_VERSION` (Task 1) is the value the doc test and `/health` share; `DEVICE_LIMITS` is exported in Task 2 and consumed only there.
- Proportion: the plan is shorter than the code it touches; bodies are left to the implementer.
