# Agent gadget UI: decisions taken during execution (2026-11-08)

Copied from the execution ledger before its deletion. Each ruling: what was decided, why, and what it costs if wrong.

## Rulings

-   Ruling: `jsonEscape` is implemented in T3 (model.cpp, needed by `modelToJson`); T4 adds `jsonString` (unescape) and its tests.
-   Ruling: create `scenario.py` (and its test) at the start of T8; T10 only extends its timeline.
- - T5 and T7 need the user's hands (taps, editor import). Ruling: execute T0-T4 and T6 first (autonomous), then ask the user once for T5+T7 together, then T8-T10.
- Task 0: Ruling: tests run with `python -m unittest discover -s agent-gadget/tests` — the directory name has a hyphen, so the plan's dotted module path cannot import — none (same tests).
- Task 0: Ruling: `test_reset_removes_posted_agent` looks for its own agent instead of asserting an empty state — live Claude sessions (user-level plugin) post to the same gadget while tests run — a race remains until T3 adds an isolation mode to /debug/config.
- Task 0: Ruling: added env `esp32dev_test_ota`; test builds are flashed by USB (`esp32dev_test`) because OTA aborted at ~19% while live sessions kept posting events — none. Observation for T9: blocking draws starve the HTTP/OTA loop.
- Task 1: Ruling: spec call 10 corrected from real payloads — `Stop` fires for the lead while background sub-agents still run, so a lead with sub-agents not done stays "waiting on sub-agents" after Stop; "needs you" starts on `PermissionRequest` (immediate; `Notification permission_prompt` arrives ~6 s late) and uses `notification_type`, not message text; it clears on PostToolUse/PostToolUseFailure/PermissionDenied/UserPromptSubmit/Stop (PreToolUse fires BEFORE the prompt, so it cannot be the clearing event); `<task-notification>` prompts are reports; `SubagentHandback` is ignored — if wrong: a false orange after a long approved command (accepted, documented). T2 must add hooks PermissionRequest, PostToolUse (stateless script: marker file so PostToolUse sends only when the agent was needs_you), PermissionDenied.
- Task 1: Ruling: Notification/PermissionRequest payloads come from the official docs, not captured (`claude -p` has no interactive prompt) — a real capture is requested from the user together with T5/T7 — a field name could differ.
- Task 2: Ruling: added hooks PermissionRequest, PostToolUse, PostToolUseFailure, PermissionDenied and a stateless marker file in the temp folder (needs_you start/clear) per T1's ruling — a stale marker after a crash is cleared by the agent's next prompt/stop.
- Task 2: Ruling: the plugin is read live from the working tree, so v2 events would break the real display until the firmware accepts them; main() sends the old {agent,state,task} (`to_v1`, DEFAULT_PROTOCOL = 1, env CLAUDE_GADGET_PROTOCOL=2) — T4 must flip DEFAULT_PROTOCOL to 2 once /event accepts v2 — if forgotten: the screen keeps the flat v0.1 view.
- Task 2: Ruling: `build_event(payload, env=None, state_dir=None)` takes the marker folder as a parameter (tests use a temp dir) — none.
- Task 3: Ruling: T3's tests post v2 events, call /select and shorten TTLs, so T3 also implements the minimal HTTP wiring they need (v2 parse in /event, v1 fallback, /state v2, /select, /debug/config incl. `isolate` = ignore requests without header `X-Gadget-Test`, which the test client always sends); T4 keeps escaping/unescaping, validation (400/404), the flat `agents` array checks and the plugin protocol flip — none.
- Task 3: Ruling: the existing screen layer is adapted minimally (flat list from `modelFlat`) so the firmware keeps building and the real display keeps working until T8 replaces it — none.
- Task 3: Ruling: API tests run on a build WITHOUT screen drawing (env `esp32dev_test` = -DGADGET_DEBUG -DDISPLAY_SERIAL); `esp32dev_test_screen` keeps the real screen layer — the first run on the real screen timed out (blocking 9600-baud redraws starve the HTTP loop; T9 fixes it) — the device runs the no-screen test firmware until a screen build is flashed again.
- Task 3: Ruling: `more` (sub-agents) and `more_sessions` count evictions/drops since the session/gadget started (approximation) — the "+N" can overstate after hidden agents finish.
- Task 3: Ruling: the T0 test became `test_reset_empties_state` (exact assertions) using isolation, plus a test that requests without the test header are ignored while isolated — none.
- Task 3: Ruling: lead "waiting_subs" applies when the lead's reported state is working or your_turn, `waitingKids` is set by a lead PreToolUse whose cmd starts with Agent/Task or by Stop, cleared by UserPromptSubmit/SessionStart, and at least one sub-agent is working or needs_you (error/done sub-agents do not block) — a sub-agent stuck "working" keeps the lead waiting until the stale TTL.
- Task 4: Ruling: oversized fields are truncated (cmd 43, detail 60) and answered 200, not 400 — a screen of ASCII limits is the right place to cut, and a hook must never be rejected for a long command; 400 only for missing/invalid fields or unknown state — a very long body is cut silently.
- Task 4: Ruling: most T4 tests passed immediately because T3 already wired v2/select/state (see T3 ruling); the real RED were the JSON escape decoding (firmware: \n, \u00e9, \/) and a flaw in my own test (it compared elapsed seconds) — fixed in the test.
- Task 4: Ruling: `DEFAULT_PROTOCOL` flipped to 2 in the plugin (test added, README updated) now that /event accepts v2 — a gadget flashed with the older firmware needs CLAUDE_GADGET_PROTOCOL=1.
- Task 6: Ruling: RED was observed in the previous session (404 on /debug/layout and /debug/hit, recorded in docs/superpowers/HANDOFF.md); /debug/hit added beside /debug/layout so the test reaches hitTest; tabs_more is always returned (w 30) and drawn only when sessions > 5 — none.
- Task 6: Ruling: pio output must run with PYTHONUTF8=1 when redirected to a file (cp1252 crash killed esptool mid-upload) — none.
- Task 7: Ruling: T7 steps 1-2 (sprite PNGs, no hardware) run before the user pause; T5 + T7 step 3 + the permission capture are asked together afterwards — none.
- Task 7: Ruling: no sprite exists in ux_mockup.html, so the style is a 12x14 pixel grid per role (head, eyes, body color per role, one accessory: crown, cap, antenna, academic hat, glasses, helmet, headphones, none), scaled x3 (36x42) and x2 (24x28); body colors avoid green/orange/red state colors — the user may want other looks (regenerate and re-flash, ~50 s).
- Task 7: Ruling: file names `<id>_<role>_<big|small>.png` give the editor import order; added `test_roles_differ_and_big_matches_small` beyond the brief — none.
- Task 7: Ruling: `hmi_touch_spike.py` (T5 step 1) and `hmi_pic_check.py` (T7 step 3) written now so the user session is one sitting — none.
- Task 5: Ruling: decision (b) raw coordinates: frame `67 xh xl yh yl st FF FF FF`, pixels, press 01 / release 00; no hotspot components in the .tft — none.
- Task 5: Ruling: no tap reached y < 29 (title bar is y 0..20); T8 must extend the tab hit zone to y 0..L_TREE_Y+~20 or move the tabs lower, and re-check test_layout — if ignored: tabs are hard to tap.
- Task 5: Ruling: step 3 (restore the gadget firmware) is deferred until after the T7 flash, which needs the same bridge — none; T5's task-done runs the plugin suite only (the gadget suite needs the gadget firmware, re-run after restore).
- Task 7: Ruling: the user saved the project as agent-gadget.HMI / agent-gadget.tft (blank.* kept as baseline); CLAUDE.md updated — none.
- Task 7: Ruling: editor flash failed 3 times ("联机失败"): the editor waits ~39 ms for comok at 115200 and the screen answered at 9600; hmi_bridge now boots at 115200 and the screen is set to 115200 before 下载 (documented in CLAUDE.md and hmi_bridge.ino); the first flash worked only because the Artillery firmware ran at 115200 — none.
- Task 2 (follow-up): Ruling: real capture confirmed Notification fields (notification_type permission_prompt/idle_prompt, message); found a bare SubagentStop (agent_type "", no SubagentStart) after every lead turn; the plugin now drops a SubagentStop without a prior SubagentStart marker and without agent_type — if the plugin is loaded mid-run, an untyped real sub-agent that started before stays 'working' until the stale TTL. Tests test_hidden_agent_stop_is_ignored (RED->GREEN) and test_untyped_agent_that_started_still_reports_done.
- Task 8: Ruling: at the user's request the device is re-flashed with the screen build (esp32dev_test_screen) at each visible milestone so the user watches this session live; API tests still run on esp32dev_test (no-screen) until T9 removes the blocking redraws — costs ~3 min of USB flashing per milestone.
- Task 8: Ruling: tab hit zone is 28 px tall (drawn 20 px) per the touch spike; tabs win over the 2 px overlap with the top sub-agent row — test_tab_hit_zone_reaches_below_the_title_bar. Tapping a tab selects that session's default agent (needs-you first, else most recent: new modelDefaultSlot) — test_tap_on_tab_picks_the_agent_that_needs_you (added).
- Task 8: Ruling: scenario.py + test_scenario_reaches_expected_state created in T8 (pre-flight ruling); it always sends X-Gadget-Test so it also works on isolated test builds — none.
- Task 8: Ruling: the selection frame is a solid 1 px yellow rectangle (one `draw` command) where the spec says dashed — 9600-baud budget; dashes = ~24 extra commands per move — the user may prefer dashes (cosmetic).
- Task 8: Ruling: the drawing itself has no automated test (the screen cannot be read back); it is checked by eye with the user on the screen build; both backends compile (esp32dev, esp32dev_noscreen) — a drawing regression is only caught visually.
- Task 8: Ruling: link lines run only outside slot rectangles (lead->bus, bus, bus->first slot of each row, gaps between neighbours), so slot redraws never erase them; session color from a hash of the session id (5-color palette) — two sessions can share a color.
- Task 9: Ruling: the 115200 link is set by the ESP32 at boot (runtime `baud=115200` at 9600, then verify `comok`), not by the screen project's boot code — no .tft re-flash, and it also handles ESP32-only resets (screen still at 115200: "already fast"); fallback 9600 if the screen refuses — a screen that loses power alone (ESP32 still running) talks 9600 to an ESP32 at 115200 until the next ESP32 reboot.
- Task 9: Ruling: the first boot attempt left the ESP32 at 9600 while the screen had switched (150 ms check too short); waits raised to 300 ms + 3 tries, outcome exposed as `link` in /debug/stats — none.
- Task 9: Ruling: Serial2 TX buffer capacity is measured at begin (availableForWrite() = 996, not 1024); queues 1.5/1/6 KB, whole commands only, overflow -> region redrawn — none.
- Task 9: Ruling: WiFi.setSleep(false): modem sleep caused HTTP stalls up to 5.6 s even with no drawing (p50 0.22 -> 0.06 s, max 5.6 -> 0.9 s) — about 20-30 mA more current.
- Task 9: Ruling: /debug/stats also reports uptime, reset reason, heap, stack, loop_max_ms (diagnostics added while chasing timeouts; loop max 39 ms during the full suite) — none.
- Task 9: Ruling: intermittent test timeouts traced to bursty Wi-Fi loss (ping 23% loss once, 0% later; RSSI -50 dBm, channel 6; router 0% loss; no reboot, loop max 64 ms); the test client retries once on network timeouts (all requests are idempotent: full-state events, selection) — a real firmware stall shorter than 2 timeouts would be hidden from the suite (loop_max_ms in /debug/stats still shows it).
- Task 10: Ruling: step 1 (scenario.py + test) was done in T8 (pre-flight ruling) — none.
- Task 10: Ruling: step 2 `claude plugin update` is not needed: the user-level plugin agent-gadget@agent-gadget-local v0.2.0 is read live from this working tree; this very session shows on the screen (tab "artil...") — none.
- Task 10: Ruling: the release flash (esp32dev, no GADGET_DEBUG) moves after T11, which needs test builds again; acceptance runs now on the screen test build (same UI) — the device keeps the debug endpoints until then.
- Task 10: Ruling: acceptance (step 4) accepted by default by the user ("disons que c'est ok"), deviations to be specified later; evidence: screen photo, real taps, budget tests (title bar 1-65 ms, est_ms <= 3000), 40 API tests — the four criteria were not walked through one by one with the user.
- Task 11: Ruling: the download keeps the current link speed (whmi-wri <size>,115200,0 at 115200), no baud switch; 525836 bytes in < 58 s, screen back with link=switched — none.
- Task 11: Ruling: test_missing_or_zero_size accepts debug state "idle" or "done" (a previous run leaves "done"); 400 for missing, 0 and non-digit size — none.
- Task 11: Ruling: drawing and touch polling stop while the download runs (tftActive), so 0x05 acks are never parsed as touch; after the end (or a failure) the firmware re-runs the link setup for up to 10 s and redraws everything — a failed download leaves the screen in download mode until a new upload.
- Task 11: Ruling: scenario.py retries once on network errors (same reason and cost as the test client retry in T9).
- Task 11: Ruling: test client and scenario.py now make 3 attempts on network errors (the suite of 43 tests kept losing to bursty Wi-Fi: 2 consecutive 5 s timeouts); state tests pass alone twice — a firmware stall up to ~10 s would be hidden from the suite (loop_max_ms still shows it).
- Final: Ruling: changing the eviction rule changes two T3 tests: a 13th working sub-agent and a 6th working session now wait outside (+N) instead of evicting an equally urgent one; test_sixth_session_never_evicts_needs_you now posts a needs_you newcomer — a new busy session stays hidden until a slot frees (session ends, 10 min silence) or it needs the user.
- Final: fixed important 3 (sub-agent "+N" not drawn) — Ruling: no automated test possible (screen cannot be read back); "+N" drawn right of the sub-agent rows, part of the tree signature; checked by build only — a drawing mistake would only show on screen.
- Final: Ruling: minor 11 (backslashes reach xstr) re-graded Important by effect: `detail` holds Windows paths on this PC; fixed by mapping '\' to '/' in asciiOnly — no automated test (screen), checked by build only.
- Final: Ruling: reviewer's "declined to judge" items are all covered by earlier rulings or pre-existing v0.1 behavior (failed /update message, handleSave delay, /tft blocking 58 s, counts since boot, stuck working until stale TTL, screen alone at 9600, test retries, tab reorder on urgency, solid frame, no drawing test, sprite taste, no auth on /event) — they stand for a single-user LAN gadget.

## Deferred minor findings (final review)

- 6 lead PreToolUse "Task*" (TaskCreate/TaskUpdate/TaskList) sets waitingKids.
- 7 manual hold signed compare wraps after ~24.8 days.
- 8 title signature omits the project name.
- 9 zero-width link fills in the small layout.
- 10 lead link redraw cuts 2 px of the lead's selection frame.
- 12 tft waitAck could take a 0x05 from a touch frame (send sendxy=0 first).
- 13 hook timeout does not bound DNS for an unresolvable host (agent-gadget.local).
- 14 empty session/agent ids accepted by /event.
- 15 4-character ids can collide (~0.1% with 12 sub-agents).

## Task completion lines

- Task 0: complete (commits 726ac50..add3b76, tests: python -m unittest discover -s agent-gadget/tests -v → OK)
- Task 1: complete (commits add3b76..aab4b01, tests: python -m unittest discover -s claude-plugin/agent-gadget/tests -v → OK)
- Task 2: complete (commits aab4b01..4de4fad, tests: python -m unittest discover -s claude-plugin/agent-gadget/tests -v → OK)
- Task 3: complete (commits 4de4fad..95fac40, tests: python -m unittest discover -s agent-gadget/tests -v → OK)
- Task 4: complete (commits 95fac40..c8c1c7d, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 6: complete (commits cbf21ca..12f593a, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 5: complete (commits abe922c..97ba0d8, tests: python -m unittest discover -s claude-plugin/agent-gadget/tests → OK)
- Task 7: complete (commits 12f593a..9b3a7c4, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 8: complete (commits e8f2d46..6ccd800, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 9: complete (commits 6ccd800..2908690, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 10: complete (commits 2908690..bb6fce2, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Task 11: complete (commits bb6fce2..974cdbf, tests: bash -c 'python -m unittest discover -s agent-gadget/tests && python -m unittest discover -s claude-plugin/agent-gadget/tests' → OK)
- Final: fixed critical 1 (phantom needs-you lead when a session is created by a sub-agent event; bare SubagentStop for an unknown session) — test_session_created_by_a_subagent_has_no_phantom_needs_you + test_subagent_stop_for_an_unknown_session_creates_nothing RED→GREEN, test_state 17/17.
- Final: fixed important 2 (overflow churn, "+N" growing per event) — test_overflow_does_not_churn RED→GREEN; newcomers evict only strictly less urgent sessions/sub-agents (finished sub-agents first), hidden ids counted once (8-entry rings).
- Final: fixed important 3 (sub-agent "+N" not drawn) — Ruling: no automated test possible (screen cannot be read back); "+N" drawn right of the sub-agent rows, part of the tree signature; checked by build only — a drawing mistake would only show on screen.
- Final: fixed important 4 (late Notification permission_prompt marks the lead orange) — test_late_permission_notification_of_a_subagent_does_not_mark_the_lead RED→GREEN, plugin suite 26/26.
- Final: fixed important 5 (parallel tool calls clear needs-you) — test_parallel_tool_call_does_not_clear_needs_you RED→GREEN; marker keyed by tool name + hash of tool_input (PermissionRequest has no tool_use_id), PreToolUse skipped while a marker waits; old "1" markers read as "any" (test_marker_from_the_previous_plugin_version_still_clears, written with the fix, not seen RED).
- Final: suites green after the fix pass: gadget 46/46 (screen build), plugin 26/26.
