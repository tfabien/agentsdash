# agentsdash step 2: core extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `plugin/hub/` runs on its own (no import from `plugin/scripts/`, no Claude code, no file outside its folder), reads the new config and variable names with the old ones as fallback, and a release workflow packs it.

**Architecture:** A new `plugin/hub/paths.mjs` owns names, folders and the old-name fallback for the core. The Claude quota poller leaves the hub and becomes a detached script of the plugin that POSTs `/usage`. The plugin scripts keep their own copy of the name helpers (adapters never import code from a core). Behaviour of the hub and the page does not change.

**Tech Stack:** Node >= 18, stdlib only, `node --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-multi-repo-split-and-rename-design.md` (section "Order of work", step 2, and "Calls made by the author").

## Global Constraints

- Node >= 18, stdlib only, no new dependency (`serialport` stays optional).
- Event protocol stays `v: 2`; `/health` keeps `version`, `core`, `protocol`.
- `notify.mjs` never blocks, never prints, exits 0, gives up after 1.5 s.
- New names: config `~/.agentsdash/config.json`; variables `AGENTSDASH_HOST`, `AGENTSDASH_MASK`, `AGENTSDASH_DUMP`, `AGENTSDASH_DRY_RUN`, `AGENTSDASH_QUOTAS`, plus `AGENTSDASH_CONFIG`, `AGENTSDASH_STATE_DIR`, `AGENTSDASH_MAX_SESSIONS`, `AGENTSDASH_THEME`, `AGENTSDASH_PROMPTS`, `AGENTSDASH_HOME`, `AGENTSDASH_CORE_DIR`. Old `~/.claude/agent-gadget.json` and every `CLAUDE_GADGET_*` stay honored as fallback; the new name wins when both are set.
- User themes and packs move to `~/.agentsdash/`; `~/.claude/standup-bot/` is read as a fallback by copying it once on first start.
- State folder default `<tmp>/agentsdash` (was `<tmp>/agent-gadget-plugin`), same default in hub and plugin.
- Tests: `node --test plugin/hub/test/*.test.mjs plugin/test/*.test.mjs` (424 tests green at the start).

## Review Focus

- A user with only `~/.claude/agent-gadget.json` and `CLAUDE_GADGET_HOST` set keeps working: Task 2 and Task 4 tests.
- Old and new variable both set: the new one wins (Task 1 test).
- First start with `~/.claude/standup-bot/` themes: copied once, old folder untouched, no overwrite of files already in `~/.agentsdash/` (Task 1 test).
- Hooks never block: an unwritable state folder or a missing `node` for the poller changes nothing for `notify.mjs` (Task 3 test).
- `CLAUDE_GADGET_QUOTAS=0` still stops polling (Task 3 test).
- The hub boots from a copy of its own folder alone (Task 5 test).

---

### Task 1: Core names and folders (`paths.mjs`)

**Files:**
- Create: `plugin/hub/paths.mjs`, `plugin/hub/test/paths.test.mjs`

**Interfaces:**
- Produces (all take `env = process.env`; none throws):
  - `envVar(name: string, env?): string | undefined` first non-empty of `AGENTSDASH_<name>`, `CLAUDE_GADGET_<name>`.
  - `homeDir(env?): string` `AGENTSDASH_HOME`, else `~/.agentsdash`.
  - `configPath(env?): string` `envVar('CONFIG')`, else `<home>/config.json` when it exists, else `~/.claude/agent-gadget.json` when it exists, else `<home>/config.json`.
  - `stateDir(env?): string` `envVar('STATE_DIR')`, else `<tmp>/agentsdash`.
  - `userDir(env?): string` same as `homeDir`.
  - `migrateUserDir(env?): boolean` when `~/.claude/standup-bot` exists and `<home>/.migrated` does not: copy its files without overwriting existing ones, write `.migrated`, return true; else false.

- [ ] **Step 1: Write the failing tests** in `paths.test.mjs` (temp dirs, `AGENTSDASH_HOME` and a `homeOverride`-free design: pass `env` with `HOME`/`USERPROFILE` set to a temp dir so `os.homedir()` follows it):
  - `new_name_wins`: `envVar('HOST', { AGENTSDASH_HOST: 'a', CLAUDE_GADGET_HOST: 'b' }) === 'a'`; only old set gives `'b'`; empty string counts as unset.
  - `config_path_order`: explicit `AGENTSDASH_CONFIG` wins; with only the legacy file present the legacy path is returned; with both, the new one; with neither, the new one.
  - `state_dir_default_and_override`: default ends with `agentsdash`; `CLAUDE_GADGET_STATE_DIR` still overrides.
  - `migrate_copies_once`: legacy dir with `themes/a.json`; first call returns true and `<home>/themes/a.json` exists, legacy file still there; edit the copy, call again: returns false, copy untouched; a file already in `<home>` is not overwritten by the first call.
- [ ] **Step 2:** Run `node --test plugin/hub/test/paths.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `paths.mjs` as specified. Use `os.homedir()` for the home (tests point it with `env.HOME` and `env.USERPROFILE`; if the helper must accept it explicitly, add `env.AGENTSDASH_HOME` and use that in tests instead).
- [ ] **Step 4:** Run the same command. Expected: PASS (4 tests).
- [ ] **Step 5:** Commit `Hub: paths.mjs owns names, folders and old-name fallback`.

### Task 2: The hub uses `paths.mjs`, cuts its imports, reads its own version

**Files:**
- Modify: `plugin/hub/config.mjs`, `plugin/hub/hub.mjs` (lines 17-22, 54, 101, 449), `plugin/hub/package.json` (version `0.4.1`), `plugin/hub/test/hub.test.mjs` (config tests near line 234), `plugin/hub/test/market_bootstrap.test.mjs` (lines 32-40)
- Create: test `core_version_matches_plugin` in `plugin/hub/test/hub.test.mjs`

**Interfaces:**
- Consumes: Task 1 `envVar`, `configPath`, `stateDir`, `userDir`, `migrateUserDir`.
- Produces: `loadConfig(file = configPath(), env)` unchanged shape, reading `HOST`, `MAX_SESSIONS`, `THEME` through `envVar`; the `quotas` key is no longer read by the hub (the plugin reads it).

- [ ] **Step 1: Write the failing tests:**
  - in `hub.test.mjs` `config_new_names`: `loadConfig(file, { AGENTSDASH_MAX_SESSIONS: '7' }).max_sessions === 7`; `AGENTSDASH_HOST: 'h:2'` with `CLAUDE_GADGET_HOST: 'h:1'` gives `'h:2'`; `AGENTSDASH_THEME: 'cat'` gives first theme `cat`. The existing old-name assertions stay (they are the fallback tests).
  - `core_version_matches_plugin`: `GET /health` `core` equals `version` equals the `version` of `plugin/.claude-plugin/plugin.json` (a comment says this test goes away at step 3, when the repos split).
  - update the `dflt` deep-equal at line 235: no `quotas` key.
- [ ] **Step 2:** Run `node --test plugin/hub/test/hub.test.mjs plugin/hub/test/market_bootstrap.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** In `config.mjs`: `defaultConfigPath = configPath`; use `envVar`; drop `quotas` from the returned object. In `hub.mjs`: remove `import { stateDir } from '../scripts/common.mjs'` and import it from `./paths.mjs`; default `userDir` becomes `userDir()`; `pluginVersion` is read from `path.join(HUB_DIR, 'package.json')`; in the `isMain` block call `migrateUserDir()` before `startHub` and make `settingsFile` read the legacy `<tmp>/agent-gadget-plugin/hub-settings.json` when the new one is missing (one `fs.copyFileSync` guarded by existence, no overwrite). Leave `quotas.mjs` for Task 3.
- [ ] **Step 4:** Run the two files again. Expected: PASS, then the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `Hub: reads config, variables, themes folder and version through paths.mjs`.

### Task 3: The quota poller leaves the hub and becomes a plugin script

**Files:**
- Move: `plugin/hub/quotas.mjs` to `plugin/scripts/quota_poller.mjs`; `plugin/hub/test/quotas.test.mjs` to `plugin/test/quota_poller.test.mjs` (fix imports)
- Modify: `plugin/hub/hub.mjs` (remove the poller block at lines 405-415, the `quotas` and `quotasEnabled` imports and `hub.quotas`), `plugin/hub/test/hub.test.mjs` (test `quota_poll_result_reaches_state_and_taps`), `plugin/scripts/notify.mjs` (`main`, after the dry-run return)
- Test: `plugin/test/quota_poller.test.mjs`, `plugin/test/notify.test.mjs`

**Interfaces:**
- Produces in `quota_poller.mjs` (moved unchanged): `defaultCredentials`, `quotasEnabled(env, cfg)`, `readKeychain`, `readToken`, `parseUsageJson`, `parseHeaders`, `dropImplausibleH5`, `bodyFromLimits`, `fetchLimits`.
- Produces (new): `quotasEnabled` reads `AGENTSDASH_QUOTAS` then `CLAUDE_GADGET_QUOTAS` (via the plugin `envVar`, Task 4 order: write `envVar` into `scripts/common.mjs` first, see Task 4 Step 3, or inline a two-name read here and refactor in Task 4).
  - `pollOnce({ env, cfg, folder, now, fetchImpl, post }): Promise<'sent' | 'off' | 'no-token' | 'empty'>` builds the body like the old poller (statusline-fresh check, history, `bodyFromLimits`) and calls `post('/usage', body)`.
  - `maybeSpawnPoller({ dir, env, cfg, now, spawnFn?, script? }): boolean` false when quotas are off; false when `<dir>/quota_poll.stamp` is younger than 60 s; else writes the stamp, spawns `node quota_poller.mjs` detached (`stdio: 'ignore'`, `windowsHide: true`, `unref`), returns true. Never throws.
  - Run as a script: `pollOnce` with `post = (route, body) => postToHub(route, body, { host: hubHost(env), spawnHub: false })`, exit code 0 always, failsafe exit after 20 s.

- [ ] **Step 1: Write the failing tests:**
  - `plugin/test/quota_poller.test.mjs`: every old `quotas.test.mjs` case, unchanged assertions, new import path; plus `poll_once_posts_usage` (fake `fetchImpl` returning a usage JSON, fake `post` capturing route `/usage` and a body with `h5_pct`) and `poll_once_off_when_quotas_disabled` (`cfg.quotas: false` and `CLAUDE_GADGET_QUOTAS: '0'` each give `'off'`, `post` not called).
  - `maybe_spawn_is_throttled`: first call true (stamp written, fake `spawnFn` called once), second call within 60 s false, call at `now + 61` true; unwritable `dir` returns false without throwing; quotas off returns false.
  - in `notify.test.mjs`: `notify_ignores_poller_failure`: run `notify.mjs` with `CLAUDE_GADGET_STATE_DIR` pointing at a file (not a folder) and no dry-run: exit code 0, empty stdout and stderr.
  - in `hub.test.mjs`: replace `quota_poll_result_reaches_state_and_taps` by `usage_without_session_reaches_state_and_taps` that `POST /usage` `{ v: 1, session: '', h5_pct: 40, h5_reset_s: 3600 }` and checks `state.usage.h5.pct` (use the field names the old test asserts) and that an `onUsage` tap saw it. Delete the `quota` option from the helper calls.
- [ ] **Step 2:** Run `node --test plugin/test/quota_poller.test.mjs plugin/test/notify.test.mjs plugin/hub/test/hub.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Move the file with `git mv`; delete `createQuotaPoller` and the timer code; change the import to `./statusline.mjs`; add `pollOnce`, `maybeSpawnPoller` and the script entry (same `isMain` pattern as `notify.mjs`). In `notify.mjs` call `maybeSpawnPoller({ dir, env, cfg: pluginConfig(env), now: Date.now() / 1000 })` after the dry-run return and before `postEvent`, inside a `try`. Remove the poller from `hub.mjs` and the `quotas` key from the object `startHub` resolves.
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5:** Commit `Quotas: the poller moves to the plugin and posts /usage; the hub no longer polls`.

### Task 4: Plugin scripts use the new names; `AGENTSDASH_CORE_DIR`

**Files:**
- Modify: `plugin/scripts/common.mjs`, `plugin/scripts/notify.mjs`, `plugin/scripts/session_prompts.mjs`, `plugin/scripts/statusline.mjs`, `plugin/scripts/hub_client.mjs`
- Test: `plugin/test/notify.test.mjs`, `plugin/test/session_prompts.test.mjs`, `plugin/test/statusline.test.mjs`, new `plugin/test/names.test.mjs`

**Interfaces:**
- Produces in `scripts/common.mjs` (a copy of the core helpers, same behaviour as `paths.mjs`): `envVar(name, env?)`, `pluginConfig(env?)` reading `configPath` (new file, then legacy file), `hubHost(env?, cfg?)`, `stateDir(env?)` default `<tmp>/agentsdash`, `configWindow(cfg)` unchanged.
- Produces in `hub_client.mjs`: `resolveHubScript(env?, hubScript?): string` order: explicit argument, `AGENTSDASH_CORE_DIR` (`<dir>/hub.mjs`), `envVar('HUB_SCRIPT')` (old `CLAUDE_GADGET_HUB_SCRIPT` still works), default `../hub/hub.mjs`. `newestHubFile` scans only the hub folder (the hub no longer imports `scripts/common.mjs`).

- [ ] **Step 1: Write the failing tests** in `names.test.mjs`:
  - `old_variables_still_work`: `notify.mjs` run with `CLAUDE_GADGET_DRY_RUN=1` prints the event (this is the existing behaviour; assert once more in the new file) and with `AGENTSDASH_DRY_RUN=1` also prints; `AGENTSDASH_MASK=1` drops `cwd`; `CLAUDE_GADGET_MASK=1` still does.
  - `new_wins_over_old`: `AGENTSDASH_HOST` beats `CLAUDE_GADGET_HOST` through `hubHost`.
  - `legacy_config_file_is_read`: `pluginConfig` with `HOME` pointing at a temp dir holding only `.claude/agent-gadget.json {"host":"h:9"}` returns that host; with `.agentsdash/config.json` also present the new file wins.
  - `core_dir_selects_the_hub`: `resolveHubScript({ AGENTSDASH_CORE_DIR: '/x' })` ends with `/x/hub.mjs` (compare with `path.join`); `CLAUDE_GADGET_HUB_SCRIPT` alone still returns that path; both set gives the core dir one.
  - `prompts_variable`: `promptsEnabled({ AGENTSDASH_PROMPTS: '0' }, {}) === false`.
- [ ] **Step 2:** Run `node --test plugin/test/names.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement. In each script replace `env.CLAUDE_GADGET_X` by `envVar('X', env)` and update header comments and `statusline.mjs` doc lines. Existing tests keep their old variable names (they are the fallback proof).
- [ ] **Step 4:** Run the full suite. Expected: PASS. Run `claude plugin validate plugin`. Expected: pass.
- [ ] **Step 5:** Commit `Plugin: new variable and config names with the old ones as fallback; AGENTSDASH_CORE_DIR`.

### Task 5: The hub boots alone; release workflow

**Files:**
- Create: `plugin/hub/test/core_standalone.test.mjs`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Tasks 1 to 3 (the hub folder holds everything it imports).
- Produces: a release asset `agentsdash-core-<version>.tar.gz` (one top folder `agentsdash-core-<version>/` holding the hub folder without `test/` and `tools/`) and `agentsdash-core-<version>.tar.gz.sha256`.

- [ ] **Step 1: Write the failing test** `core_boots_from_a_copy_of_its_folder`: copy `plugin/hub/` (skip `test`, `tools`, `node_modules`) to a temp dir that has no sibling `scripts/` or `.claude-plugin/`; start `node <copy>/hub.mjs` with `AGENTSDASH_HOST=127.0.0.1:<free port>`, `AGENTSDASH_HOME` and `AGENTSDASH_STATE_DIR` in temp dirs; poll `/health` for up to 5 s; assert `core` equals the `version` in `plugin/hub/package.json`, `protocol === 2`; kill the child in `finally`.
- [ ] **Step 2:** Run `node --test plugin/hub/test/core_standalone.test.mjs`. Expected: PASS if Tasks 2 and 3 are complete. If it fails, a leftover import points outside the folder: fix it in the hub and rerun.
- [ ] **Step 3:** Write `release.yml`: trigger `push` tags `v*`; one Ubuntu job: checkout, Node 20, run the test command, check that the tag (without `v`) equals `plugin/hub/package.json` version, `git archive --format=tar.gz --prefix=agentsdash-core-$V/ -o agentsdash-core-$V.tar.gz HEAD:plugin/hub ':(exclude)test' ':(exclude)tools'`, `sha256sum` into the `.sha256` file, `gh release create "$TAG" <both files> --generate-notes` with `GH_TOKEN: ${{ github.token }}` and `permissions: contents: write`.
- [ ] **Step 4:** Check the archive command by hand: run the `git archive` line locally with `V=0.4.1`, list it with `tar tzf`, expected: `agentsdash-core-0.4.1/hub.mjs` present, no `test/` or `tools/` entries; delete the file afterwards.
- [ ] **Step 5:** Commit `Core: standalone boot test and release workflow (tarball + sha256)`.

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `INSTALL.md`, `plugin/README.md`, `plugin/hub/README.md`, `docs/hub-themes.md`
- Test: `plugin/hub/test/naming.test.mjs` (`docs_use_the_new_name`, extended)

- [ ] **Step 1: Extend the failing test:** `docs_new_config_names`: `plugin/hub/README.md` and `README.md` mention `~/.agentsdash/config.json` and `AGENTSDASH_HOST`; no line of the docs lists `CLAUDE_GADGET_` without the word `fallback` or `old`.
- [ ] **Step 2:** Run `node --test plugin/hub/test/naming.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Update the config tables and prose to the new names, mark the old names as fallback for one major version, document `AGENTSDASH_CORE_DIR`, the quota poller script, the release tarball and the `~/.agentsdash/` user folder. In `CLAUDE.md` replace the step 2 note ("config names ... keep the old names until step 2") with the new state and the "Plugin and hub" section lines about quotas.
- [ ] **Step 4:** Run the full suite and both `claude plugin validate` commands. Expected: all pass.
- [ ] **Step 5:** Commit `Docs: agentsdash config and variable names, poller, release`.

## Out of scope (steps 3 to 5)

Bootstrap download, `restartStaleHub` replacement, the contract test with recorded events, repo splits, Codex.
