# Screen Redesign Implementation Plan
> **Status: delivered (archived 2026-11-11).** Checkboxes ticked in bulk; the commit history and `execution-log-*.md` hold the details.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace layout D with the approved "lead panel + team rows" screen in the dark clean style, with plan progress, a clock and a full-screen standby clock.

**Architecture:** A Pillow script renders the static decor (background, rounded rows, labels, arrows, sprites on panel colors, standby digits) into PNGs that the user adds to the `.tft` with two new fonts. The ESP32 places pictures and writes text with `xstr` on flat colors. Pure geometry stays in `layout.*`; a new `ui_state.*` holds the screen-only state (detail view, label scroll, standby, team order); `clock.*` gets NTP time. The plugin adds plan fields to v2 events from the session's task-list tool calls.

**Tech Stack:** ESP32 Arduino (PlatformIO), TJC X2 screen (USART HMI 1.68.2 editor), Python 3 stdlib (plugin), Pillow (decor generator), unittest.

**Spec:** `docs/superpowers/specs/2026-11-11-screen-redesign-design.md` (mockups next to it).

## Global Constraints

- Code comments, docs and screen text in English; screen text ASCII only.
- Picture ids 0..15 and font ids 0 (`f24`), 1 (`f16`) keep their meaning; new fonts get ids 2 (`f12`, 6 px cells) and 3 (`f14` bold, 7 px cells); new pictures start at id 16 (table in Task 5).
- Text sits on flat colors only and uses `xstr` with a solid background (sta=1); text cut to its budget ends with `~` (today's `fit()`).
- Palette (RGB): screen 13,17,23; bars 22,27,34; frame and selected tab 36,48,68; inner panels 18,24,33; rows 26,34,48; text 230,237,243; dim 139,148,158; faint 110,118,129; working 63,185,80; needs you 240,136,62; plan accent 163,113,247; label outline 33,38,45; count chip 58,70,88.
- Standby after 5 min (`STANDBY_MS 300000`) with no agent in working, waiting on sub-agents, needs you or error; detail view lasts 10 s (`DETAIL_MS 10000`); manual selection hold stays `UI_HOLD_MS` (30 s).
- Time zone rule `CET-1CEST,M3.5.0,M10.5.0/3`.
- `notify.py`: stdlib only, never blocks, never prints (it runs in every session's hooks, read live from this working tree).
- Flashing with output redirected: set `PYTHONIOENCODING=utf-8`. PlatformIO: `%USERPROFILE%\.platformio\penv\Scripts\pio.exe`, run from `agent-gadget/esp32_agent_gadget/`.
- Every question to the user goes through AskUserQuestion.

## Review Focus

1. A session or sub-agent vanishes (TTL) while its detail is shown or the labels are scrolled: the panel falls back to the lead, the offset clamps. Tests in Task 7.
2. Names and commands longer than the field budgets: cut with `~`, never drawn into a neighbor zone. Test in Task 9 (`/debug/fit`).
3. Standby while the time is unknown (NTP down, AP mode): shows the waiting text and IP, never "00:00". Test in Task 8.
4. Odd plan values: total 0 (no plan), done > total, more than 16 tasks, a new task list replacing the old one. Tests in Tasks 3 and 4.
5. A tap during standby wakes the screen only; it does not also select what lies under the finger. Test in Task 7.

---

### Task 1: Hardware spike (fonts, background, text over it)

Settles whether TJC X2 fonts are anti-aliased and how the palette looks on the real panel, before anything else is built.

**Files:**
- Create: `agent-gadget/tools/make_decor.py` (only `background()` for now, extended in Task 5)
- Create: `agent-gadget/hmi_decor_spike.py`
- Modify: `agent-gadget/esp32_agent_gadget/display.h`, `display_hmi.cpp`, `display_serial.cpp`, `net.cpp` (debug route)

**Interfaces:**
- Produces: `void displayRaw(const String& cmd);` (display.h: HMI build sends it at once with `hmiSendNow`, serial build prints it); `POST /debug/hmi {"cmd": "..."}` in `GADGET_DEBUG` builds; `make_decor.py` function `background() -> PIL.Image` (480x272 RGB, zones of the spec's structure table) and CLI `python agent-gadget/tools/make_decor.py --out agent-gadget/assets/decor`.

- [x] **Step 1:** Implement `background()` from the spec's zone table and palette (rounded corners 6 px on panels, 8 px on the frame, selected tab x 6..166 joined to the frame, no border). Write `16_background.png`.
- [x] **Step 2:** Add `displayRaw` and `/debug/hmi`; build `pio run -e esp32dev_test_screen -t upload`.
- [x] **Step 3:** User step (AskUserQuestion to confirm each): in the editor (`agent-gadget.HMI`), 工具 -> 字库制作: generate `f12` (height 12, ASCII) and `f14` (height 14, bold, ASCII), trying the anti-alias option if offered; add them as font ids 2 and 3; add `16_background.png` as picture 16; 文件 -> 输出生产文件; flash through `http://<ip>/tft`.
- [x] **Step 4:** `hmi_decor_spike.py <ip>` posts to `/debug/hmi`: `pic 0,0,16`, then `xstr` samples in fonts 2 and 3 on the lead panel, a row and the bottom bar colors (lead name, "Waiting on 4 sub-agents", "Session 5h 48% reset 1h20"), plus sprite `pic` 0 and 8.
- [x] **Step 5:** Ask the user for a photo and approval (AskUserQuestion: approve / colors off / fonts unreadable). Record the outcome (anti-alias yes or no, any palette correction) in the spec's "Decisions after review". Colors corrected here apply to all later tasks.
- [x] **Step 6: Commit** `make_decor.py`, `hmi_decor_spike.py`, the firmware changes, `agent-gadget.HMI`, `agent-gadget.tft`, the spec note: `git commit -m "spike(screen): new fonts and background picture on the real panel"`.

### Task 2: Capture the task-list hook payloads

**Files:**
- Modify: `docs/hook-payloads.md` (new section "Task list tools")
- Create: `claude-plugin/agent-gadget/tests/fixtures/tasklist_*.json` (one file per captured tool call, anonymized: no paths outside the repo, no user names)

- [x] **Step 1:** Ask the user (AskUserQuestion) to run one CLI session and one desktop session with `CLAUDE_GADGET_DUMP=<scratch file>` that create a 3-task list, mark one in progress, finish one.
- [x] **Step 2:** From the dump, record for each tool (`TaskCreate`, `TaskUpdate`, `TodoWrite`, the desktop task-list tool, whichever appear): hook event, `tool_name`, `tool_input` shape, `tool_response` shape (task id), and whether the desktop tool sends the whole list or deltas (`advance`, `done`, `start`).
- [x] **Step 3:** Save one fixture per shape. Commit: `git commit -m "docs: task-list tool payloads (CLI and desktop)"`.

### Task 3: Model: longer fields and plan fields

**Files:**
- Modify: `agent-gadget/esp32_agent_gadget/model.h`, `model.cpp`, `net.cpp` (v2 parsing), `claude-plugin/agent-gadget/scripts/notify.py` (cut lengths)
- Test: `agent-gadget/tests/test_state.py`, `claude-plugin/agent-gadget/tests/test_notify.py`

**Interfaces:**
- Produces: `ROLE_LEN 24`, `CMD_LEN 64`, `PLAN_LEN 48`; `Session` fields `uint8_t planDone, planTotal; char planCur[PLAN_LEN], planNext[PLAN_LEN];` (total 0 = no plan; changes bump `usageRev`); `EventV2` fields `long planDone, planTotal` (-1 = absent), `char planCur[PLAN_LEN], planNext[PLAN_LEN]`, `bool hasPlanCur, hasPlanNext`; wire fields `plan_done`, `plan_total`, `plan_cur`, `plan_next`; `/state` session key `"plan": {"done","total","cur","next"}` or `null`.

- [x] **Step 1: Failing tests** in `test_state.py`:
  - `test_long_role_and_cmd_kept`: role `"general-purpose-agent-x"` (23 chars) and a 63-char cmd come back whole in `/state`.
  - `test_plan_fields`: event with `plan_done=2, plan_total=8, plan_cur="Write the failing tests", plan_next="Implement roles.cpp"` -> `plan == {"done":2,"total":8,"cur":"Write the failing tests","next":"Implement roles.cpp"}`; a later event without plan fields keeps it; `plan_total=0` -> `plan is None`; `plan_done=9, plan_total=8` -> `done == 8` (clamped).
  - In `test_notify.py`, `test_role_and_cmd_limits`: a 30-char `agent_type` gives a 23-char role, a 100-char command gives a 63-char cmd.
- [x] **Step 2: Run** `python -m unittest tests.test_state -v` (from `agent-gadget/`, gadget flashed with `esp32dev_test`) and `python -m unittest discover -s claude-plugin/agent-gadget/tests`. Expected: the new tests FAIL.
- [x] **Step 3: Implement** the field sizes, plan storage and clamping in `modelApplyV2`, parsing in `net.cpp`, JSON in `modelToJson`; in `notify.py` change `ascii_clean(..., 12)` for the role to 23 and the cmd limit 43 to 63 (and the header comment). Check `free_heap` in `/debug/stats` stays above 60 KB after `scenario.py`.
- [x] **Step 4: Run** both suites (flash `pio run -e esp32dev_test -t upload` first). Expected: PASS, including the older tests.
- [x] **Step 5: Commit** `git commit -m "feat(core): longer role and command, per-session plan fields"`.

### Task 4: Plugin: plan progress from the task-list tools

**Files:**
- Create: `claude-plugin/agent-gadget/scripts/plan_tracker.py`
- Modify: `claude-plugin/agent-gadget/scripts/notify.py` (call it, add fields to the event)
- Test: `claude-plugin/agent-gadget/tests/test_plan_tracker.py` (uses Task 2 fixtures)

**Interfaces:**
- Consumes: Task 2 fixtures; Task 3 wire fields.
- Produces: `update(state_dir: str, payload: dict) -> dict | None` returns `{"plan_done", "plan_total", "plan_cur", "plan_next"}` after applying one hook payload, `None` when the payload is not a task-list call and no plan is stored; state kept in `<state_dir>/plan-<session12>.json` as an ordered list of `{"id", "title", "status"}`. `notify.py` adds the dict to every v2 event of the lead when a plan is stored.

- [x] **Step 1: Failing tests** (titles cut with `ascii_clean(..., 47)`):
  - `test_create_three_then_progress`: 3 creates then one `in_progress`, one `completed` -> `{"plan_done":1,"plan_total":3,"plan_cur":<in-progress title>,"plan_next":<first pending title>}`.
  - `test_whole_list_tool_replaces`: a whole-list call (TodoWrite or desktop full list) replaces the stored list.
  - `test_desktop_deltas`: `advance`, `done=[n]`, `start=n` move the statuses as the desktop tool documents them (Task 2).
  - `test_all_done_keeps_total`: everything completed -> `plan_done == plan_total`, `plan_cur == ""`.
  - `test_new_list_after_done`: a create after a fully completed list starts a new list (total counts only the new tasks).
  - `test_broken_state_file`: unreadable JSON -> treated as no plan, no exception.
- [x] **Step 2: Run** `python -m unittest discover -s claude-plugin/agent-gadget/tests`. Expected: FAIL (module missing).
- [x] **Step 3: Implement** `plan_tracker.update` and the call in `notify.py` inside its existing try/except (a tracker error must never stop the event).
- [x] **Step 4: Run** the suite and `claude plugin validate claude-plugin/agent-gadget`. Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "feat(plugin): plan progress from task-list tool calls"`.

### Task 5: Decor pictures and the new `.tft`

**Files:**
- Modify: `agent-gadget/tools/make_decor.py` (all pictures), `agent-gadget/tools/make_sprites.py` (expose `look(role)` unchanged, add a background-color parameter to its PNG writer if needed)
- Create: `agent-gadget/tests/test_decor.py` (no hardware), `agent-gadget/assets/decor/*.png`
- Modify: `agent-gadget.HMI`, `agent-gadget.tft` (user step)

**Interfaces:**
- Produces the picture id table, also written into `ui_theme.h` as `PIC_*` constants in Task 9:

| Id | File | Size | Content |
|---|---|---|---|
| 16 | `16_background.png` | 480x272 | bars, frame, inner panels, selected tab |
| 17 | `17_row.png` | 290x32 | rounded row, row color, corners blended into the inner panel color |
| 18 | `18_row_compact.png` | 290x20 | same, compact |
| 19 | `19_label.png` | 132x22 | other-session outline (3 sessions or fewer), on bar color |
| 20 | `20_label_narrow.png` | 104x22 | outline when arrows show |
| 21..23 | `21_arrow_l.png`, `22_arrow_l_off.png`, `23_arrow_l_ask.png` | 24x22 | left arrow normal, off, orange |
| 24..26 | same `_r` | 24x22 | right arrow |
| 27..34 | `27_lead_big.png` .. | 36x42 | the 8 role sprites on the inner panel color |
| 35..42 | | 24x28 | the 8 role sprites on the row color |
| 43..50 | | 16x18 | tiny role sprites on the row color |
| 51 | `51_standby.png` | 480x272 | standby background (13,17,23 with the bottom bar) |
| 52..61 | `52_digit_0.png` .. | 56x96 | standby digits 0..9, text color on 13,17,23 |
| 62 | `62_colon.png` | 24x96 | colon |

- [x] **Step 1: Failing tests** in `test_decor.py` (reads with `png_reader.read_png`): every file of the table exists with its size; `16_background.png` pixel colors at the centers of the frame, lead panel, team panel, top bar and bottom bar equal the palette values; row corner pixel (0,0) equals the inner panel color and center equals the row color; sprites 27..50 have the panel or row color in their corners; digits differ pairwise.
- [x] **Step 2: Run** `python -m unittest tests.test_decor -v` from `agent-gadget/`. Expected: FAIL.
- [x] **Step 3: Implement** the generator (Pillow, draw at 4x then `resize(..., Image.LANCZOS)` for smooth corners and digits; sprites reuse `make_sprites.look()` with the black background replaced by the target color).
- [x] **Step 4: Run** the generator and the tests. Expected: PASS.
- [x] **Step 5: User step** (AskUserQuestion): add pictures 17..62 in id order in the editor picture panel (16 already there), export, flash through `/tft`. Check with `/debug/hmi` `pic 0,0,51` and `pic 100,80,52`.
- [x] **Step 6: Commit** `git commit -m "feat(screen): decor pictures and standby digits in the screen project"`.

### Task 6: Layout v2 (pure geometry and hit test)

**Files:**
- Modify: `agent-gadget/esp32_agent_gadget/layout.h`, `layout.cpp`, `ui_theme.h` (geometry constants), `net.cpp` (`/debug/layout`, `/debug/hit`)
- Test: `agent-gadget/tests/test_layout.py` (rewrite)

**Interfaces:**
- Produces:
  - `Rect layoutTopBar(); Rect layoutSelectedTab(); Rect layoutFrame(); Rect layoutLeadPanel(); Rect layoutTeamPanel(); Rect layoutTeamHeader(); Rect layoutBottomBar(); Rect layoutClock(); Rect layoutBadge();`
  - `int layoutLabels(int others, Rect out[2], bool& arrows);` returns visible labels (0..2). No arrows: x 170 and 306, w 132. Arrows: left arrow x 170, labels x 198 and 306 (w 104), right arrow x 414, all 24 or 104 wide, y 4, h 22. Badge x 442..474.
  - `Rect layoutArrow(bool right);`
  - `int layoutRows(int nSubs, Rect out[8]);` returns rows drawn: 1..5 subs -> normal rows x 176, y 54 + i*36, 290x32; 6..8 -> compact rows y 54 + i*23, 290x20; 9..12 -> 8 compact rows, the 8th being the "+N more" row.
  - `struct Hit { enum Kind : uint8_t { None, SelectedTab, Label, ArrowLeft, ArrowRight, LeadPanel, Row, More } kind; int8_t index; };` `Hit hitTest(int x, int y, int others, int nSubs);` top bar items answer taps for y 0..33.
  - `/debug/layout?subs=N&others=K` JSON keys: `top_bar, selected_tab, frame, lead_panel, team_panel, team_header, bottom_bar, clock, badge, arrows (bool), arrow_left, arrow_right, labels[], rows[]`; `/debug/hit?x&y&others&subs` -> `{"kind": "selected_tab"|"label"|..., "index": n}`.

- [x] **Step 1: Failing tests** in `test_layout.py`: all rects inside 480x272 for subs 0..12 and others 0..4; rows never overlap and stay inside the team panel; 5 subs -> last row bottom 230; 8 subs -> 8 compact rows, last bottom 235; 12 subs -> 8 rows; lead panel and team panel do not overlap; labels and arrows do not overlap the badge; hit at the center of each label, arrow, row and the lead panel returns its kind and index; hit at (x of label 0 center, y 32) returns `label` (taps below the drawn label); others 2 -> no arrows, others 3 -> arrows.
- [x] **Step 2: Run** `python -m unittest tests.test_layout -v` against an `esp32dev_test` build of the old firmware. Expected: FAIL (old keys).
- [x] **Step 3: Implement** the functions and routes; delete the layout D functions and constants that nothing uses any more after Task 9 (keep them compiling until then if `display_hmi.cpp` still needs them).
- [x] **Step 4: Run** after `pio run -e esp32dev_test -t upload`. Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "feat(screen): layout geometry of the lead panel and team rows"`.

### Task 7: Screen state: detail view, label scroll, standby, team order

**Files:**
- Create: `agent-gadget/esp32_agent_gadget/ui_state.h`, `ui_state.cpp`
- Modify: `touch.cpp` (`uiTap` uses the new hits), `model.cpp` (`/state` view JSON gets the screen state through a hook in `net.cpp`), `net.cpp` (`/debug/config` keys `standby_ms`, `detail_ms`)
- Test: `agent-gadget/tests/test_touch.py` (rewrite), `agent-gadget/tests/test_standby.py`

**Interfaces:**
- Consumes: Task 6 `hitTest`, `layoutLabels`; model `modelView`, `modelSelect`, `modelCount`, `modelSession`, `modelAgent`.
- Produces (`ui_state.h`):
  - `void uiStateConfigure(uint32_t standbyMs, uint32_t detailMs);`
  - `int uiDetailSlot(const Session& s, uint32_t now);` agent slot shown in the lead panel (0 = lead); falls back to 0 when expired or the agent is gone.
  - `void uiShowDetail(int slot, uint32_t now); void uiHideDetail();`
  - `int uiLabelOffset(int others);` clamped to `others - 2` (0 when 2 or fewer); `void uiScrollLabels(int delta, int others);`
  - `int uiOtherSessions(int8_t selected, int out[MAX_SESSIONS]);` session indexes other than the selected one, model order.
  - `bool uiArrowAsks(bool right, int8_t selected, int others);` true when a session hidden on that side needs the user (orange arrow).
  - `bool uiStandby(uint32_t now);` true after `standbyMs` with no agent in an active state (working, waiting on sub-agents, needs you, error); `void uiWake(uint32_t now);`
  - `int uiTeamOrder(const Session& s, uint8_t out[8], int& more);` slots shown in the team rows: model order; past 8 rows, done agents are dropped first, then the least recently active; with more than 8 sub-agents, 7 slots plus `more` hidden.
  - `/state` `"view"` gains `"detail": "<agent id>"|null, "standby": bool, "label_offset": n, "arrow_left_asks": bool, "arrow_right_asks": bool`.
- Tap rules in `uiTap`: in standby, wake only; `Label i` -> select session `others[offset + i]` (default slot), hide detail; arrows scroll by 1; `Row i` -> `modelSelect` that agent and `uiShowDetail(slot)`; `More` -> nothing; `LeadPanel` -> `uiHideDetail`; `SelectedTab` -> nothing.

- [x] **Step 1: Failing tests** in `test_touch.py`: tap a row -> view detail is that agent, after `detail_ms=1500` + 2 s it is `null`; tap the lead panel hides it; tap label 0 with 3 sessions selects the other session; with 5 sessions, right arrow moves `label_offset` to 1, a second tap keeps 2 at most; detail agent removed (`done_ttl_ms` short) -> `detail` becomes `null`; session removed while scrolled -> `label_offset` clamps; with 5 sessions at offset 0 and the last one needing the user, `/state` `"view"` `"arrow_right_asks"` is true and `"arrow_left_asks"` false. In `test_standby.py` (with `standby_ms=2000`): idle sessions -> `standby` true after 3 s; a `working` event -> false at once; a tap in standby -> `standby` false and `view.session` unchanged (Review Focus 5); 10 subs with 3 done -> `uiTeamOrder` exposed as `/state` `"team": [ids]` lists 7 non-done ids and `"team_more": 3`.
- [x] **Step 2: Run** both files. Expected: FAIL.
- [x] **Step 3: Implement** `ui_state.cpp` (static storage, no heap growth) and the `uiTap` rules.
- [x] **Step 4: Run** `test_touch`, `test_standby`, `test_state`. Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "feat(screen): detail view, session label scroll, standby and team order"`.

### Task 8: Clock (NTP)

**Files:**
- Create: `agent-gadget/esp32_agent_gadget/clock.h`, `clock.cpp`
- Modify: `net.cpp` (start after Wi-Fi connects, `/state` key `"time"`, `/debug/config` key `clock_off`)
- Test: `agent-gadget/tests/test_clock.py`

**Interfaces:**
- Produces: `void clockBegin();` (`configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org", "time.google.com")`); `bool clockValid();` (year >= 2025); `bool clockHHMM(char out[6]);` `bool clockDate(char* out, size_t n);` ("Wednesday 11 November"). `/state` `"time": "HH:MM"` or `null`.

- [x] **Step 1: Failing tests** `test_time_format`: `/state["time"]` matches `^\d\d:\d\d$` within 30 s of boot and equals the PC's local `HH:MM` within one minute. `test_time_unknown_is_null`: `/debug/config {"clock_off": true}` makes `clockValid()` false, then `/state["time"] is None`; `{"clock_off": false}` restores it.
- [x] **Step 2: Run.** Expected: FAIL (no key).
- [x] **Step 3: Implement.**
- [x] **Step 4: Run.** Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "feat(core): NTP clock (Europe/Paris)"`.

### Task 9: Draw the main screen

**Files:**
- Modify: `agent-gadget/esp32_agent_gadget/display_hmi.cpp` (rewrite of the title bar, tree and strip parts), `ui_theme.h` (palette, `PIC_*`, `FONT_F12 2`, `FONT_F14 3`, cell widths 6 and 7), `hmi_uart.h/.cpp` (`void hmiPicCrop(int x, int y, int w, int h, int id);` = `picq`), `display_serial.cpp` (print plan and detail), `net.cpp` (`/debug/fit`)
- Test: `agent-gadget/tests/test_budget.py` (extend), `agent-gadget/tests/test_fit.py`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7, 8.
- Produces: `String fit(const char* s, int widthPx, int cellPx)` exposed for tests as `GET /debug/fit?s=..&w=..&cell=..` -> `{"text": ...}`.
- Draw regions (existing queue): `HMI_TITLE` = top bar; `HMI_STRIP` = lead panel and bottom bar; `HMI_TREE` = team panel.
- Full redraw: `pic 0,0,16`, then each zone. Zone redraws: top bar `picq` of its rect from picture 16 then tab text, labels (`pic` 19/20), arrows, badge; lead panel `picq` then content per the spec (normal or detail, with plan block or "LAST"); team header line ("TEAM · N SUB-AGENTS · K WORKING", ASCII middle dot replaced by "-"); rows `pic` 17/18 then bar fill, sprite (`pic` 35+ or 43+), text, done rows in faint text; "+N more" row; bottom bar `picq` then quotas and clock (clock text redrawn once a minute).

- [x] **Step 1: Failing tests:** `test_fit.py`: `fit("general-purpose", 84, 7) == "general-purp~"`, short strings unchanged, width smaller than one cell gives `""`. `test_budget.py` `test_scenario_drains`: after `scenario.py` runs 20 s on the screen build, `queued_bytes` returns to 0 within 2 s and `est_ms` of a full redraw stays under 400.
- [x] **Step 2: Run** on `esp32dev_test_screen`. Expected: FAIL.
- [x] **Step 3: Implement** the drawing; remove layout D drawing code and unused constants.
- [x] **Step 4: Run** the tests, then `python agent-gadget/scenario.py <ip>`; ask the user (AskUserQuestion) for a photo with 3 sessions and 5 sub-agents, then with 8 sub-agents, and approval against the mockups.
- [x] **Step 5: Commit** `git commit -m "feat(screen): lead panel, team rows, session labels and bottom bar"`.

### Task 10: Detail view, standby screen, animation, messages

**Files:**
- Modify: `display_hmi.cpp`, `display_serial.cpp`
- Test: `agent-gadget/tests/test_budget.py` (`test_animation_budget`)

**Interfaces:**
- Consumes: Task 7 (`uiDetailSlot`, `uiStandby`), Task 8 (`clockHHMM`, `clockDate`), Task 5 pictures 27..34, 51..62.

- [x] **Step 1: Failing test** `test_animation_budget`: 8 working sub-agents for 10 s -> average UART load from `/debug/stats` under 2 KB/s and the title-bar redraw time (`titlebar_ms`) under 150 ms.
- [x] **Step 2: Run.** Expected: FAIL (`/debug/stats` has no `anim_steps` key yet; the test also asserts `anim_steps > 0`).
- [x] **Step 3: Implement:** detail panel (spec section "Lead panel (detail)", light outline around the tapped row); standby screen (picture 51, digits 52..62, date, summary line or IP, quota bar; without valid time: today's waiting text and IP, Review Focus 3); animation every 600 ms (working sprites bob 2 px with a flat fill of the band, needs-you sprites alternate with an orange disc), counted in `anim_steps`; boot, Wi-Fi setup and `.tft` messages with the new palette and fonts.
- [x] **Step 4: Run** the test; ask the user (AskUserQuestion) for photos of the detail view and the standby screen (`standby_ms=5000` through `/debug/config`) and approval.
- [x] **Step 5: Commit** `git commit -m "feat(screen): detail view, standby clock, sprite animation, restyled messages"`.

### Task 11: Docs and release build

**Files:**
- Modify: `agent-gadget/ARCHITECTURE.md` (screen modules, ui_state, clock, plan fields, picture and font ids, debug routes), `CLAUDE.md` (screen protocol: fonts 2 and 3, pictures 16..62, `/debug/hmi`; plugin: plan fields), `claude-plugin/agent-gadget/README.md` (plan progress), `docs/superpowers/specs/2026-11-08-agent-gadget-ui-design.md` (note: superseded for the look by the 2026-11-11 spec)

- [x] **Step 1:** Update the docs.
- [x] **Step 2:** Build and flash the release firmware `pio run -e esp32dev -t upload`; run `python -m unittest discover -s claude-plugin/agent-gadget/tests`. Expected: PASS; the screen shows the new UI with live sessions.
- [x] **Step 3: Commit** `git commit -m "docs: screen redesign (modules, picture and font ids, plan fields)"`.
