# agentsdash step 3a: core bootstrap, version rule, contract fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plugin finds, downloads and starts a core release by itself, restarts a running hub only by the version rule, and a recorded-event contract test ties adapter and core together. Everything works inside this repo; step 3b (own plan, publishes things) then cuts the repos.

**Architecture:** Plugin scripts gain `core_install.mjs` (download from a GitHub release, sha256 check, tar.gz extraction with the standard library) and a core locator in `hub_client.mjs`. A plugin that finds no core starts the installer detached and drops the event, like the spec says. The running-hub check has two modes: "local hub" (checkout sibling or `AGENTSDASH_CORE_DIR`, the old script and mtime check) and "installed core" (the version rule).

**Tech Stack:** Node >= 18, stdlib only (`fetch`, `zlib`, `crypto`), `node --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-multi-repo-split-and-rename-design.md` (Design: Contract and versions, Adapters; Calls made by the author). Step 2 plan: `2026-11-13-agentsdash-step2-core-extraction.md` (done).

## Global Constraints

- Node >= 18, stdlib only, no npm, no new dependency.
- `notify.mjs` never blocks, never prints, exits 0, gives up after 1.5 s; the installer never runs inside a hook, only detached.
- Core installs live in `~/.agentsdash/core/<version>/` (`AGENTSDASH_HOME` moves the base); one shared core per machine; the highest installed core whose protocol matches runs and is never downgraded.
- The plugin speaks protocol `2` and needs core `>= 0.4.1` (constants in one place).
- Release assets: `agentsdash-core-<version>-p<protocol>.tar.gz` and the same name plus `.sha256` (one line `<hex>  <name>`), top folder `agentsdash-core-<version>/` holding the hub folder.
- Core repo for downloads: `tfabien/agentsdash` (config key `core_repo` overrides, for forks and tests).
- Never overwrite a file outside the install folder; a tar entry with `..`, an absolute path, a link or a device is refused.
- Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` (439 green at the start).

## Review Focus

- Interrupted or corrupt download: the hash mismatch leaves no folder behind and the next try starts clean (Task 2 test).
- Two sessions start the installer at once: the install folder appears whole or not at all (Task 2 test, rename of a temp folder).
- A tar bomb or traversal entry (`../x`, `/etc/x`, symlink) is refused (Task 2 test).
- Offline or GitHub rate limit: no output, no hook delay, retry only after 10 minutes (Task 3 test).
- A hub already running with a higher core than the plugin minimum is left alone; with `protocol` different or `core` missing it is replaced (Task 4 tests).
- A user with `AGENTSDASH_CORE_DIR` or the checkout sibling keeps today's behaviour (Task 3 and 4 tests).

---

### Task 1: Protocol in the core metadata, release asset name

**Files:**
- Modify: `plugin/hub/package.json`, `.github/workflows/release.yml`, `plugin/hub/test/hub.test.mjs`

**Interfaces:**
- Produces: `plugin/hub/package.json` has `"protocol": 2`; the release job names the asset `agentsdash-core-<version>-p<protocol>.tar.gz` and its `.sha256`.

- [ ] **Step 1: Write the failing test** `core_package_protocol_matches_model` in `hub.test.mjs`: the `protocol` of `package.json` equals `PROTOCOL_VERSION` from `model.mjs` and `/health`'s `protocol`.
- [ ] **Step 2:** `node --test plugin/hub/test/hub.test.mjs`. Expected: FAIL (`undefined`).
- [ ] **Step 3:** Add the field. In `release.yml` read it with `node -p "require('./plugin/hub/package.json').protocol"` into `P` and use `FILE="agentsdash-core-$V-p$P.tar.gz"`; keep the `--prefix="agentsdash-core-$V/"`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Run the archive line by hand (as in step 2, Task 5) and list the top folder.
- [ ] **Step 5:** Commit `Core: protocol in package.json, protocol in the release asset name`.

### Task 2: Installer module (`core_install.mjs`)

**Files:**
- Create: `plugin/scripts/core_install.mjs`, `plugin/test/core_install.test.mjs`

**Interfaces:**
- Produces (all exported, none read the real home or the network unless given):
  - `parseSha256(text: string, name: string): string | null` hex digest from a `.sha256` file for that asset name.
  - `extractTarGz(buffer: Buffer, destDir: string): string[]` gunzips and extracts a ustar archive of regular files and directories into `destDir`, returns the relative file paths; throws `Error('unsafe tar entry: <name>')` for `..`, absolute paths, links, devices; strips nothing (the caller strips the top folder).
  - `pickAsset(releases: object[], protocol: number): { version: string, tarball: string, sha256: string } | null` first release (newest first, drafts and prereleases skipped) with an asset `agentsdash-core-<semver>-p<protocol>.tar.gz` and its `.sha256` sibling; values are download URLs.
  - `installCore({ repo, protocol, coresDir, fetchImpl, log? }): Promise<{ version: string } | null>` lists `https://api.github.com/repos/<repo>/releases?per_page=10`, picks, downloads both files, checks the digest, extracts to `<coresDir>/<version>.partial-<pid>/`, strips the top folder, checks `hub.mjs` exists and `package.json` has the expected `version` and `protocol`, renames to `<coresDir>/<version>` (a folder already there means another process won: remove ours, return its version). Any failure: remove the partial folder, return `null`, never throw.
  - Script entry (`node core_install.mjs`): `installCore` with the plugin's config (`core_repo`), exit code 0, 60 s failsafe.

- [ ] **Step 1: Write the failing tests** (build archives in the test with a small ustar writer helper, 512-byte headers, `zlib.gzipSync`):
  - `parse_sha256`: `parseSha256('abc123  agentsdash-core-1.0.0-p2.tar.gz\n', 'agentsdash-core-1.0.0-p2.tar.gz') === 'abc123'`; other name gives null.
  - `extract_regular_files_and_dirs`: archive with `top/hub.mjs` and `top/web/a.js` extracts both with their bytes.
  - `extract_refuses_unsafe_entries`: entries named `../x`, `/etc/x`, `top/../../x` and a symlink (typeflag `2`) each throw `unsafe tar entry`; nothing is written outside `destDir`.
  - `pick_asset_skips_other_protocols_and_prereleases`: releases `[{tag 1.2.0 prerelease}, {1.1.0 asset -p3}, {1.0.0 asset -p2}]` for protocol 2 gives 1.0.0.
  - `install_happy_path`: fake `fetchImpl` serving the release list, the tarball and its sha256; result `{ version: '1.0.0' }`, `<coresDir>/1.0.0/hub.mjs` exists, no `.partial-*` folder left.
  - `install_hash_mismatch_leaves_nothing`: wrong digest gives `null`, `coresDir` empty.
  - `install_wrong_protocol_inside_archive`: package.json says protocol 3 while the asset says p2 gives `null`, nothing left.
  - `install_concurrent_second_wins_silently`: pre-create `<coresDir>/1.0.0`, call again: returns `{ version: '1.0.0' }`, the existing folder untouched, no partial left.
  - `install_offline`: `fetchImpl` throws gives `null`.
- [ ] **Step 2:** `node --test plugin/test/core_install.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. Tar header: name at 0-99, size octal at 124-135, typeflag at 156, prefix at 345-500 (ustar); stop at two zero blocks; only typeflags `0`, `\0` (file) and `5` (dir) are accepted.
- [ ] **Step 4:** Run the same command. Expected: PASS (9 tests).
- [ ] **Step 5:** Commit `Plugin: core installer (release download, sha256, tar.gz extraction)`.

### Task 3: Core locator and detached installer start

**Files:**
- Modify: `plugin/scripts/hub_client.mjs`, `plugin/scripts/common.mjs`
- Test: `plugin/test/hub_client.test.mjs` (new)

**Interfaces:**
- Consumes: Task 2 `installCore` (through the script entry).
- Produces in `common.mjs`: `compareVersions(a: string, b: string): number` for `X.Y.Z` strings (numeric parts, missing part is 0, non-numeric part makes the string lowest); `coresDir(env?): string` = `<AGENTSDASH_HOME or ~/.agentsdash (AGENTSDASH_USER_HOME aware)>/core`.
- Produces in `hub_client.mjs`:
  - `PROTOCOL = 2`, `MIN_CORE = '0.4.1'` exported.
  - `findCore({ env?, hubScript? }): { script: string, mode: 'local' | 'installed', version?: string } | null` order: explicit `hubScript`; `AGENTSDASH_CORE_DIR`; old `CLAUDE_GADGET_HUB_SCRIPT` (all three mode `local`); the checkout sibling `../hub/hub.mjs` when it exists (`local`); else the highest `<coresDir>/<version>/hub.mjs` whose `package.json` `protocol` equals `PROTOCOL` and `version >= MIN_CORE` (`installed`); else `null`.
  - `maybeStartInstaller({ dir, env?, now, spawnFn? }): boolean` stamp file `core_install.stamp` in `dir`, 600 s throttle, spawns `core_install.mjs` detached like `maybeSpawnPoller`; never throws.
  - `postToHub` uses `findCore`: no core means no spawn of a hub, `maybeStartInstaller` is called and the event is dropped (returns false). `resolveHubScript` from step 2 is replaced by `findCore` (update `names.test.mjs` `core_dir_selects_the_hub` to the new function).

- [ ] **Step 1: Write the failing tests** with temp folders and `AGENTSDASH_USER_HOME`/`AGENTSDASH_HOME`:
  - `compare_versions`: `1.10.0 > 1.9.0`, `1.0 == 1.0.0`, `2.0.0 > 1.99.99`, `x.y < 0.0.1`.
  - `find_core_order`: explicit wins over `AGENTSDASH_CORE_DIR` over `CLAUDE_GADGET_HUB_SCRIPT`; with none of them and the sibling present (the real repo) the sibling is returned with mode `local`.
  - `find_core_picks_highest_matching_installed`: with a fake plugin folder lacking the sibling (pass an option `siblingScript: null`), installed `0.4.1`, `0.5.0` (protocol 2) and `0.6.0` (protocol 3) give `0.5.0`; an install below `MIN_CORE` is ignored; empty folder gives `null`.
  - `installer_start_is_throttled`: first call true, second within 600 s false, after 601 s true; unwritable folder false.
  - `post_without_core_drops_the_event_and_starts_the_installer`: `postToHub` with `siblingScript: null`, an empty `coresDir`, a fake `spawnFn` and a closed port returns false and calls `spawnFn` once.
- [ ] **Step 2:** `node --test plugin/test/hub_client.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement. `findCore` reads `package.json` with try/catch per candidate; never throws.
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `Plugin: find the core (local, installed) or start the installer`.

### Task 4: Version rule replaces the mtime restart for installed cores

**Files:**
- Modify: `plugin/scripts/hub_client.mjs` (`restartStaleHub`), `plugin/scripts/notify.mjs` (call site only if the signature changes)
- Test: `plugin/test/hub_client.test.mjs`

**Interfaces:**
- Consumes: Task 3 `findCore`, `PROTOCOL`, `MIN_CORE`, `compareVersions`.
- Produces: `restartStaleHub({ host, env?, hubScript? }): Promise<boolean>`: loopback hosts only; reads `/health`; in mode `local` the old rule (other script path, or started before the newest `*.mjs` of the hub folder; the plugin version comparison is dropped); in mode `installed`, or with no core found, the version rule: restart when `core` is missing, `protocol !== PROTOCOL`, or `compareVersions(core, MIN_CORE) < 0`; a hub with a higher core is left alone. Restart = `POST /shutdown` then wait up to 700 ms for the port, as today.

- [ ] **Step 1: Write the failing tests** with a fake hub (`http.createServer` answering `/health` with a given body and counting `POST /shutdown`):
  - `rule_keeps_a_newer_core`: installed mode, health `{ core: '9.0.0', protocol: 2 }` gives false, no shutdown.
  - `rule_replaces_old_or_foreign_hubs`: health without `core`, or `core: '0.1.0'`, or `protocol: 3` gives true and one shutdown.
  - `local_mode_replaces_a_hub_from_another_script`: mode `local` (explicit `hubScript`), health `script` pointing elsewhere gives true; same script and fresh `startedAt` gives false.
  - `non_loopback_host_is_never_touched`: host `192.168.1.5:8765` gives false without any request.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement; remove `localVersion` and its `plugin.json` read.
- [ ] **Step 4:** Run the full suite and `claude plugin validate plugin`. Expected: PASS.
- [ ] **Step 5:** Commit `Plugin: version rule decides hub restarts for installed cores`.

### Task 5: Recorded events and the contract test

**Files:**
- Create: `plugin/test/tools/record_events.mjs`, `plugin/hub/test/fixtures/events.jsonl`, `plugin/test/contract_events.test.mjs`, `plugin/hub/test/contract.test.mjs`

**Interfaces:**
- Produces: `events.jsonl`, one v2 event per line, recorded from `notify.mjs` for a scripted session: `SessionStart`, `UserPromptSubmit`, `PreToolUse` (two tools), `SubagentStart`, a sub-agent `PreToolUse`, `PermissionRequest`, `PostToolUseFailure`, `SubagentStop`, `Stop` with a reply, `SessionEnd`, for two sessions in two projects. `record_events.mjs` rebuilds it (`node plugin/test/tools/record_events.mjs`), `cwd` kept, no secrets.

- [ ] **Step 1: Write the failing tests:**
  - `plugin/test/contract_events.test.mjs` `recorded_events_match_the_hooks`: runs the same scripted payloads through `notify.mjs` (dry run, quotas off) and compares each event to the line of `events.jsonl` (after dropping fields that vary: `title`, `model`, `tok`, `stok`, `ctx_*`).
  - `plugin/hub/test/contract.test.mjs` `core_accepts_the_recorded_events`: start a hub, `POST /event` every line (all answer 200), then `GET /state`: two sessions, the lead of each in the state of its last event, the first session's sub-agent gone after `SubagentStop`, `reply_last` present after the `Stop`; `POST /usage` with the poller body shape returns 200.
- [ ] **Step 2:** Run both. Expected: FAIL (fixture missing).
- [ ] **Step 3:** Write `record_events.mjs` (builds the payload list, runs `notify.mjs` per payload with `AGENTSDASH_DRY_RUN=1`, `AGENTSDASH_QUOTAS=0`, a temp state folder, writes the file) and run it once. The payload list is shared by `record_events.mjs` and the adapter test (export it from the tool).
- [ ] **Step 4:** Run both tests. Expected: PASS. Run the full suite.
- [ ] **Step 5:** Commit `Contract: recorded v2 events, replayed against the hub and the hooks`.

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`, `INSTALL.md`, `plugin/README.md`, `plugin/hub/README.md`, `docs/protocol.md`
- Test: `plugin/hub/test/naming.test.mjs` (`docs_core_install`)

- [ ] **Step 1: Failing test** `docs_core_install`: `plugin/README.md` and `INSTALL.md` mention `~/.agentsdash/core`; `plugin/hub/README.md` mentions `-p<protocol>` (the asset name); `docs/protocol.md` states how an adapter picks a core (protocol match, `core` minimum).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Document: where cores live, first-run behaviour (the first event is dropped while the download runs, the next one finds the core), offline (retry every 10 minutes, nothing printed), `core_repo` config key, `AGENTSDASH_CORE_DIR` for a checkout, the version rule, the troubleshooting row "no page after install: wait a minute, check `~/.agentsdash/core/`". Update `CLAUDE.md` sections Plugin and hub and Pitfalls.
- [ ] **Step 4:** Run the full suite and both `claude plugin validate` commands. Expected: pass.
- [ ] **Step 5:** Commit `Docs: core install, version rule, release asset name`.

## Out of scope: step 3b (own plan, publishes, needs the owner's go)

First core release tag and workflow run; creating `agentsdash-claude` with its history (`git filter-branch`, `git filter-repo` is not installed); moving `plugin/hub` to `hub/` in the core repo; removing the adapter files from the core repo; the old `standup-bot` plugin stub; owner migration (`claude plugin marketplace` commands).
