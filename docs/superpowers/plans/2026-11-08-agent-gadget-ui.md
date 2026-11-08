# Agent Gadget UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Claude Code sessions and sub-agents on the ESP32 + HMI screen as pixel-art characters: session tabs, a tree of the selected session, and a command strip for the tapped agent.

**Architecture:** The Claude plugin (hooks) pushes richer v2 events to the gadget. The gadget core keeps a session/agent tree, derives states and the default selection, and exposes it on `GET /state`; the screen layer (behind `display.h`) draws only what changed, using sprites baked into the screen project. Tests drive the real gadget through its HTTP API (no host C++ compiler on this PC) and unit-test the plugin with `unittest`.

**Tech Stack:** Python 3.14 stdlib (`unittest`, `urllib`), PlatformIO + Arduino-ESP32 (C++), TJC USART HMI 1.68.2 editor (manual, Chinese UI), screen UART at 9600 baud.

**Spec:** `docs/superpowers/specs/2026-11-08-agent-gadget-ui-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- Screen 480x272 landscape; on-screen text ASCII only; fonts `f24` = id 0, `f16` = id 1; UART 9600 baud.
- At most 5 tabs (+N), one lead slot and 12 sub-agent slots (2 rows of 6); a 13th sub-agent or 6th session shows "+N".
- Done/error agents stay greyed 2 min then disappear; 10 min of silence removes a session.
- Urgency order (tab dots, sorting): needs you > error > your turn > working > waiting on sub-agents > done.
- Default selected session: blocked on the user first, else the one that most recently reached "your turn", else the most recently active. A manual selection holds 30 s, then auto mode resumes.
- "Needs you" indicator on screen within 1 s of the event; tab or agent switch within 3 s.
- Hooks stay fast and silent: never print to stdout, always exit 0, timeout about 1.5 s, drop events if the gadget is unreachable; every event carries the full state of its agent.
- The old `{agent, state, task}` event stays accepted (a one-agent session named after `agent`).
- Keep the core / screen split of `agent-gadget/ARCHITECTURE.md`. Code comments, docs and on-screen text in English.
- Sprites are images baked into the `.tft`; re-flashing takes about 50 s through the editor and `hmi_bridge` (which temporarily replaces the gadget firmware; USB needed to restore it).
- The repo is not under git today: Task 0 asks the user before `git init`. If refused, skip every commit step.

## Review Focus

1. Out-of-order or duplicate hook events (SubagentStop before SubagentStart, PreToolUse from an unknown `agent_id`, double Stop): no crash, no ghost row stuck "working". Pinned in Task 3.
2. Two sessions in same-named folders, or names with spaces, non-ASCII, quotes, backslashes, very long commands: distinct tabs, sanitized, truncated, valid JSON. Pinned in Tasks 2 and 4.
3. Overflow while a session needs the user (13+ sub-agents, 6+ sessions, tables full): the "needs you" agent/session is never evicted or hidden; "+N" shown. Pinned in Task 3.
4. "Needs you" stuck after an approval given inside a sub-agent, or after a session ended while orange. Pinned in Task 3.
5. Gadget off, slow or rebooted during a hook: hook exits 0 within its timeout with no stdout; the next event repairs the agent. Pinned in Task 2.

## Wire formats (defined once, used by all tasks)

`POST /event` v2 body (ASCII JSON): `{"v":2,"session":"<id4>","project":"<=14 chars","agent":"lead"|"<id4>","role":"lead"|"<agent_type, <=12 chars>","evt":"<hook name>","state":"working|needs_you|your_turn|done|error","cmd":"<=43 chars","detail":"<=60 chars"}`. `cmd` = tool + short argument ("Edit net.cpp"); `detail` = file path or command text. A body without `"v"` is the old `{agent,state,task}`. Errors: 400 with a text body, state untouched.

`GET /state` returns `{"sessions":[{"id","project","dot","count","more","agents":[{"id","parent","role","state","cmd","detail","prev","prev_age","age"}]}],"more_sessions":N,"view":{"session","agent","mode":"auto|manual"},"agents":[{"name","state","task","age"}]}` (the flat `agents` array keeps `ux_mockup.html` and old tools working). States: `needs_you`, `error`, `your_turn`, `working`, `waiting_subs` (derived, leads only), `done`. `dot` = most urgent state of the session.

`POST /select {"session","agent","hold_ms"?}` -> 200 and `view.mode="manual"` (404 if unknown). Debug endpoints exist only when built with `-DGADGET_DEBUG` (PlatformIO env `esp32dev_test`): `POST /debug/config {"done_ttl_ms","stale_ttl_ms"}`, `GET /debug/layout?subs=N`, `POST /debug/tap {"x","y"}`, `GET /debug/stats`.

## File Structure

- `claude-plugin/agent-gadget/scripts/notify.py` (modify), `.../tests/test_notify.py` (create).
- `agent-gadget/esp32_agent_gadget/`: `model.h/.cpp` (rewrite: sessions, agents, selection), `net.cpp` (modify: v2 parse, `/state`, `/select`, debug), `layout.h/.cpp` (create: pure slot geometry), `touch.h/.cpp` (create: touch frames -> taps), `hmi_uart.*` (add `hmiPic`, draw queue), `display_hmi.cpp` + `ui_theme.h` (rewrite UI).
- `agent-gadget/tests/gadget_client.py` (create: helper), `test_state.py`, `test_layout.py`, `test_touch.py`, `test_budget.py` (create).
- `agent-gadget/tools/make_sprites.py` (create), `agent-gadget/assets/sprites/` (generated PNGs), `blank.HMI` (modify in the editor).
- `agent-gadget/scenario.py` (create: 5 sessions, 12 sub-agents), docs: `docs/hook-payloads.md`, `docs/touch-findings.md`.

### Task 0: Test harness and baseline

**Files:** Create `agent-gadget/tests/gadget_client.py`; env `esp32dev_test` in `agent-gadget/esp32_agent_gadget/platformio.ini`.

**Interfaces:** Produces `Gadget(host=os.environ.get("GADGET_HOST","192.168.1.100"))` with `reset()`, `event(**fields)`, `state() -> dict`, `select(session, agent, hold_ms=None) -> int`, `debug(path, body=None) -> dict`; `require_gadget()` raising `unittest.SkipTest` when unreachable.

- [ ] **Step 1:** Ask the user whether to `git init` the repo and commit the current state as a baseline; do it only on a yes.
- [ ] **Step 2:** Write `test_harness.py::test_reset_empties_state` (post an old-style event, `reset()`, assert `state()["agents"] == []`). Run `python -m unittest agent-gadget.tests.test_harness -v`: FAIL (module missing).
- [ ] **Step 3:** Implement `gadget_client.py` with `urllib`; add env `esp32dev_test` (`extends = env:esp32dev`, `build_flags = -DGADGET_DEBUG`). Flash it by USB: `pio run -e esp32dev_test -t upload`. Re-run the test: PASS.
- [ ] **Step 4:** Commit (if git): `git add agent-gadget && git commit -m "test: gadget API harness"`.

### Task 1: Hook payload spike (spec section 6, calls 9 and 10)

**Files:** Modify `notify.py` (dump mode); create `docs/hook-payloads.md`.

**Interfaces:** Produces the confirmed payload facts later tasks rely on (lead has no `agent_id`; which `Notification` messages/types mean "needs you" vs idle; whether `SubagentStart/Stop` name a parent).

- [ ] **Step 1:** Add to `notify.py` an env `CLAUDE_GADGET_DUMP=<path>`: append the raw payload as one JSON line, nothing else changes. Test `test_notify.py::test_dump_only_when_env_set` (no file without the env, one line with it).
- [ ] **Step 2:** From a scratch folder run a real session that launches two sub-agents and triggers one permission prompt (`claude -p` with an allowed-tools list that forces a prompt, or an interactive session). Collect the dump.
- [ ] **Step 3:** Write `docs/hook-payloads.md`: one example per hook, field presence for lead vs sub-agent, the exact `Notification` fields and values for permission vs idle. If a call of the spec is wrong, edit spec sections 9 and 10 and tell the user.
- [ ] **Step 4:** Commit (if git).

### Task 2: Plugin v0.2 event builder

**Files:** Modify `notify.py`; create `claude-plugin/agent-gadget/tests/test_notify.py`; bump version to 0.2.0 in `plugin.json` and `.claude-plugin/marketplace.json` (repo root).

**Interfaces:** Consumes Task 1 facts. Produces `build_event(payload: dict, env: Mapping[str, str] = os.environ) -> dict | None` returning the v2 wire format; `CLAUDE_GADGET_MASK=1` empties `detail` and reduces `cmd` to the tool name.

- [ ] **Step 1:** Write tests: `test_session_start_is_your_turn`, `test_prompt_is_working`, `test_pretooluse_lead_and_subagent` (lead: `agent="lead"`; with `agent_id` -> `agent=<id4>`, `role=<agent_type>`), `test_subagent_start_stop_states`, `test_permission_notification_needs_you_idle_is_your_turn` (values from Task 1), `test_stop_is_your_turn`, `test_session_end_is_done`, `test_unknown_event_returns_none`, `test_ascii_truncation_and_quotes` (accents stripped, `cmd` <= 43, `detail` <= 60, quotes/backslashes survive `json.dumps`), `test_mask`, `test_same_folder_names_get_distinct_session_ids`, and `test_unreachable_host_exits_0_fast_silently` (subprocess with `CLAUDE_GADGET_HOST=10.255.255.1`: exit code 0, empty stdout, under 2.5 s). Run `python -m unittest discover -s claude-plugin/agent-gadget/tests -v`: FAIL.
- [ ] **Step 2:** Implement `build_event` per spec section 10 (mapping table); `main()` posts it with the 1.5 s timeout. Run: PASS.
- [ ] **Step 3:** Update the plugin README (v2 events, mask option, privacy risk) and run `claude plugin validate claude-plugin/agent-gadget`: "Validation passed".
- [ ] **Step 4:** Commit (if git).

### Task 3: Core model - tree, states, selection

**Files:** Rewrite `model.h/.cpp`; modify `net.cpp` (call `modelApplyV2`); create `agent-gadget/tests/test_state.py`.

**Interfaces:** Produces in `model.h`: `enum AgentState : uint8_t { ST_NEEDS_YOU, ST_ERROR, ST_YOUR_TURN, ST_WORKING, ST_WAITING_SUBS, ST_DONE }` (urgency order); `struct EventV2 {...}`; `bool modelApplyV2(const EventV2&, uint32_t now)`; `void modelApplyV1(const char* agent, AgentState, const char* task, uint32_t now)`; `void modelPrune(uint32_t now)`; `struct View { uint8_t session; uint8_t agent; bool manual; }`; `View modelView(uint32_t now)`; `bool modelSelect(const char* session, const char* agent, uint32_t now, uint32_t holdMs)`; `String modelToJson()`; `extern uint32_t modelRev`; accessors for drawing and touch: `int modelSessionCount()`, `const Session* modelSession(int tab)` (tabs ordered by urgency then recency), `const Agent* modelAgent(const Session&, int slot)` (slot 0 = lead, 1..12 = sub-agents). Limits: 5 sessions, 1 lead + 12 sub-agents each.

- [ ] **Step 1:** Write tests in `test_state.py` (use `Gadget.reset()` and `debug("/debug/config", ...)` for short TTLs): `test_lead_waits_on_subagents` (lead Agent call + 2 working subs -> lead `waiting_subs`; both subs done -> lead `working`), `test_needs_you_clears_on_next_pretooluse`, `test_needs_you_clears_when_session_ends_and_prunes`, `test_dot_is_most_urgent_state`, `test_default_session_blocked_then_your_turn_then_active`, `test_manual_selection_holds_then_reverts` (`hold_ms=1500`), `test_overflow_13_subagents_keeps_needs_you_and_reports_more`, `test_sixth_session_never_evicts_needs_you`, `test_out_of_order_events_leave_no_ghost` (SubagentStop first, unknown `agent_id` PreToolUse, double Stop), `test_ttl_removes_done_and_stale`, `test_old_api_is_single_agent_session`. Run: FAIL.
- [ ] **Step 2:** Implement the model (static arrays, no heap growth), selection and `modelToJson`; wire `/state`. Flash `esp32dev_test` by USB (or OTA once running) and run `python -m unittest agent-gadget.tests.test_state -v`: PASS.
- [ ] **Step 3:** Commit (if git).

### Task 4: HTTP layer - v2 parsing, /select, /state, debug

**Files:** Modify `net.cpp`; extend `test_state.py`.

**Interfaces:** Consumes Task 3. Produces the endpoints of "Wire formats"; JSON helpers `jsonString(const String&, const char* key, char* out, size_t n)` that unescape `\"`, `\\`, `\/` and `\n` and `jsonEscape(const String&) -> String` used by `modelToJson`.

- [ ] **Step 1:** Add tests: `test_event_v2_roundtrip_in_state`, `test_quotes_and_backslashes_in_cmd_give_valid_state_json`, `test_malformed_oversized_or_unknown_state_returns_400_and_changes_nothing`, `test_select_unknown_returns_404`, `test_state_keeps_flat_agents_array`. Run: FAIL.
- [ ] **Step 2:** Implement parsing/escaping and the endpoints; guard debug endpoints with `#ifdef GADGET_DEBUG`. OTA-flash and run the tests: PASS.
- [ ] **Step 3:** Commit (if git).

### Task 5: Touch spike (spec section 4, touch)

**Files:** Create `agent-gadget/hmi_touch_spike.py`, `docs/touch-findings.md`.

**Interfaces:** Produces the decision (a) hotspot components or (b) raw coordinates, with the exact frame format (e.g. `67 xh xl yh yl state FF FF FF`) used by Task 8.

- [ ] **Step 1:** Flash the bridge (`agent-gadget/hmi_bridge`, USB). Script: open COM3, switch the bridge to 9600, send `sendxy=1`, print every received frame for 30 s while the user taps the corners and center.
- [ ] **Step 2:** Run it. If coordinate frames appear, record the format and the coordinate range; else add one hotspot component to the screen project, re-test, and record the component events. Write `docs/touch-findings.md` with the chosen option; if (a), also list the fixed zones needed (5 tabs, 1 lead, 12 sub slots, positions from Task 6's layout).
- [ ] **Step 3:** Restore the gadget firmware by USB (`pio run -e esp32dev_test -t upload`). Commit (if git).

### Task 6: Layout geometry (pure, shared by drawing and touch)

**Files:** Create `layout.h/.cpp`, `agent-gadget/tests/test_layout.py`; modify `ui_theme.h`.

**Interfaces:** Produces `struct Rect { int16_t x, y, w, h; }`; `Rect layoutTab(int index, int count)`; `Rect layoutLead()`; `int layoutSubs(int n, Rect out[12])` (1 row up to 6, 2 rows of 6 above; returns rows); `Rect layoutStrip()`; `struct Hit { enum Kind : uint8_t { None, Tab, Agent } kind; int8_t index; }` and `Hit hitTest(int x, int y, int nTabs, int nSubs)` (`Agent` index 0 = lead, 1..12 = sub-agent slots). Debug: `GET /debug/layout?subs=N` returns the slot rectangles.

- [ ] **Step 1:** Tests: `test_all_rects_inside_480x272`, `test_no_overlap_for_0_to_12_subs`, `test_two_rows_above_six`, `test_tabs_capped_at_five_with_more_marker`, `test_strip_height_about_80`. Run: FAIL.
- [ ] **Step 2:** Implement per the mockup D (title bar 20 px, tree about 166 px, strip about 80 px); expose the debug endpoint. Flash and run: PASS.
- [ ] **Step 3:** Commit (if git).

### Task 7: Sprites and the screen project

**Files:** Create `agent-gadget/tools/make_sprites.py`, `agent-gadget/tests/test_sprites.py`; generated `agent-gadget/assets/sprites/*.png`; modify `blank.HMI`; add annotated screenshots to `guide/`.

**Interfaces:** Produces picture ids in the project: `0` lead (36x42), `1..7` roles general, explore, plan, review, test, code, generic (36x42), and `8..15` the same eight at 24x28; solid black background (no transparency). `hmiPic(int x, int y, int id)` in `hmi_uart.h` sends `pic x,y,id`.

- [ ] **Step 1:** Test: `test_png_sizes_and_black_background` (decode with a stdlib PNG reader written in the test helper: 8 files at 36x42 and 8 at 24x28, corner pixels black). Run: FAIL.
- [ ] **Step 2:** Implement `make_sprites.py` (stdlib PNG writer, sprite style of the mockups, body color per role). Run: PASS; write a contact sheet PNG for the user.
- [ ] **Step 3:** Guide the user in the editor (annotated screenshots, as before): add the 16 images in the picture tab in id order, set page 0 `bco`=0, **文件 -> 输出生产文件**, flash with 下载 through the bridge (Task 5 firmware), then restore the gadget by USB. Verify with `hmi_pic_check.py` (sends `pic` for each id; the user confirms visually).
- [ ] **Step 4:** Commit (if git).

### Task 8: Screen layer - UI and touch

**Files:** Rewrite `display_hmi.cpp`; modify `hmi_uart.*` (`hmiPic`), `ui_theme.h`; create `touch.h/.cpp`; create `test_touch.py`.

**Interfaces:** Consumes Tasks 3, 6, 7, 5. Produces `void touchBegin()`, `void touchPoll()` (decodes frames per `docs/touch-findings.md`, calls `uiTap(x, y)`); `void uiTap(int x, int y)` -> `hitTest` -> `modelSelect(..., 30000)`; debug `POST /debug/tap {x,y}` calling `uiTap`.

- [ ] **Step 1:** Tests: `test_tap_on_tab_selects_that_session`, `test_tap_on_agent_selects_it_and_sets_manual`, `test_tap_on_empty_area_changes_nothing`, `test_manual_selection_reverts_after_hold`. Run: FAIL.
- [ ] **Step 2:** Implement the title bar with tabs (dot, name, count, global "N asks you"), the tree (sprites by role with `pic`, state markers via `cirs`, session-colored link lines via `fill`, dashed selection frame), the command strip (name, state, elapsed, `cmd`, `detail`, previous command with age), overflow "+N". Keep the draw-only-what-changed rule via `rev` counters; keep the `DISPLAY_SERIAL` backend compiling (`pio run -e esp32dev_noscreen`).
- [ ] **Step 3:** Run the tap tests: PASS. Flash `esp32dev_test`, run `scenario.py` (Task 10) and check the screen by eye with the user.
- [ ] **Step 4:** Commit (if git).

### Task 9: Draw scheduling and the latency budget

**Files:** Modify `hmi_uart.*`, `display_hmi.cpp`, `ui_theme.h`; create `test_budget.py`.

**Interfaces:** Produces a draw queue with priorities (title bar > strip > tree) and `GET /debug/stats` returning `{"queued_bytes":N,"est_ms":M,"titlebar_ms":T}` (estimate = bytes x 10 / baud).

- [ ] **Step 1:** Tests: `test_needs_you_titlebar_within_1s_with_12_subagents` (`titlebar_ms <= 1000` after the 12-sub scenario plus one `needs_you` event), `test_tab_switch_within_3s` (`est_ms <= 3000` after `select`). Run: FAIL.
- [ ] **Step 2:** Implement the queue and the stats. Then try raising the link speed: add `baud=115200` (and the ESP32 side `HMI_BAUD`) via the screen project's boot code, re-flash through Task 7's procedure; keep it only if `sendme`-style checks answer and the UI still draws; otherwise keep 9600 and record the result in `CLAUDE.md`.
- [ ] **Step 3:** Run: PASS. Commit (if git).

### Task 10: Scenario, install and acceptance

**Files:** Create `agent-gadget/scenario.py`; modify `agent-gadget/ARCHITECTURE.md`, `CLAUDE.md`, `claude-plugin/agent-gadget/README.md`.

- [ ] **Step 1:** `scenario.py` posts v2 events for 5 sessions, one with 12 sub-agents, one background session blocked on the user, then plays a short timeline (states changing); flags `--host`, `--speed`. Test `test_scenario_reaches_expected_state` (after the run, `/state` shows 5 sessions, 12 subs, default selection = the blocked session).
- [ ] **Step 2:** Update the installed plugin: `claude plugin update agent-gadget@agent-gadget-local`; start a new real session and confirm tabs, sub-agents and commands appear.
- [ ] **Step 3:** Docs: wire formats and endpoints in `ARCHITECTURE.md`; state/touch/baud findings and the flashing procedure in `CLAUDE.md`; release the OTA build (`pio run -e esp32dev_ota -t upload`, without `GADGET_DEBUG`).
- [ ] **Step 4:** Acceptance with the user (spec success criterion): in the scenario and in real sessions, the user finds the session that needs them at a glance, sees a lead's sub-agents and states, reads any agent's command with one tap, without visible flicker. Record deviations.
- [ ] **Step 5:** Commit (if git).

### Task 11: Flash the screen .tft from the gadget's web page (added 2026-11-08 at the user's request)

**Files:** Create `tft_upload.h/.cpp` (screen side, owns the UART during the upload); modify `net.cpp` (page and upload handler), `hmi_uart.*` (baud change, pause of the draw queue), `agent-gadget/tests/test_tft_upload.py`, `CLAUDE.md`.

**Interfaces:** `GET /tft` (form, same `admin` / `OTA_PASSWORD` auth as `/update`) and `POST /tft?size=<bytes>` (multipart file). Protocol from the TJC wiki (`advanced/hmi_download_protocol.html`): `00 FF FF FF`, `connect` -> `comok`; `whmi-wri <size>,115200,0` + `FF FF FF`; switch the ESP32 UART to 115200; wait for one byte `0x05` (about 250 ms); then send the file in 4096-byte packets, waiting for `0x05` after each (last packet = the remainder). After the last ack the screen reboots on the new .tft at the project baud (9600): reset the UART to 9600 and redraw everything. `GET /debug/tft` (GADGET_DEBUG) reports `{state, sent, total, last_error}`.

- [ ] **Step 1:** Tests (`test_tft_upload.py`, real gadget + screen): `/tft` without auth -> 401; `size` missing or 0 -> 400 and the screen keeps working; uploading `agent-gadget.tft` returns 200 within 90 s, then `/state` answers and a `pic` of id 0 is drawn (screen check by the user once). Run: FAIL.
- [ ] **Step 2:** Implement: the upload handler buffers to 4096 bytes and forwards each packet, blocking on `0x05` with a 2 s timeout (abort -> 500 with the reason, screen left in download mode: a new upload recovers it). Draws are suspended during the upload; HTTP events posted meanwhile still update the model. Run: PASS.
- [ ] **Step 3:** `CLAUDE.md`: the browser path replaces the editor 下载 + `hmi_bridge` procedure (the editor only exports the .tft). Commit.

### Task 12: Sprite themes (added 2026-11-08 at the user's request, lowest priority)

**Files:** modify `agent-gadget/tools/make_sprites.py` (`--theme <name>`), `agent-gadget/tests/test_sprites.py`; generated `agent-gadget/assets/sprites/<theme>/*.png` and one contact sheet per theme.

**Interfaces:** every theme keeps the picture contract of Task 7 (ids 0..15, same role order, 36x42 and 24x28, black background), so a theme swap is only a re-export of the .tft and a flash (Task 11), with no firmware change. Themes: `people` (current full characters, default), `heads` (big faces, role shown by hair, hat or glasses), `cats` (one cat per role: fur color, ears, accessory), `bricks` (blocky toy figures: cylinder head, square body; generic style, no brand name or logo).

- [ ] **Step 1:** Tests: the Task 7 tests run for every theme (sizes, black corners, eight distinct looks, big = small at scale 3/2); themes differ from each other. Run: FAIL.
- [ ] **Step 2:** One pixel grid set per theme in `make_sprites.py`. Run: PASS; send the contact sheets to the user to pick a theme.
- [ ] **Step 3:** Commit. Optional: a theme picker on `/config` that only records the choice (the .tft still holds one theme at a time: 16 pictures).
