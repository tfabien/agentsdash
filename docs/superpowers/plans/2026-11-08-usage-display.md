# Usage display (context, quotas, tokens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each session's context fill in its tab, the 5-hour and weekly quotas on a permanent strip line, and tokens per agent / per session.

**Architecture:** Plugin side: a new status line script posts context and quotas to `POST /usage`; `notify.py` adds token counts and a context fallback read incrementally from transcripts. ESP32 side: the model stores per-session context, per-agent tokens and one global quota record; the screen draws the tab fill, a token zone and a quota line.

**Tech Stack:** Python 3 standard library (plugin, `unittest`), ESP32 Arduino C++ (PlatformIO), USART HMI drawing commands.

**Spec:** `docs/superpowers/specs/2026-11-08-usage-display-design.md`

## Global Constraints

- Work only in `C:\WORKSPACES\perso\artillery-x3-screen-usage`, branch `agent-gadget-usage`. No merge, no push.
- **No hardware during the unattended run**: no COM3, no `-t upload`, no OTA, no HTTP request to the gadget (192.168.1.100),
  no edit of `~/.claude/settings.json`. Any manual run of `notify.py` uses `CLAUDE_GADGET_DRY_RUN=1`.
- PlatformIO: `%USERPROFILE%\.platformio\penv\Scripts\pio.exe`, run from `agent-gadget/esp32_agent_gadget`. Every env must build:
  `esp32dev`, `esp32dev_test`, `esp32dev_test_screen`, `esp32dev_noscreen`.
- Plugin: standard library only; never print to hook stdout; always exit 0; POST timeout 1.5 s (`notify.py`), 1 s (`statusline.py`).
- Screen text ASCII only; f16 is 8 px wide, f24 12 px. Code comments, docs, on-screen text in English.
- Draw queue priorities unchanged (title > strip > tree). A context or token change never triggers a full redraw.
- Session id on the wire = first 4 alphanumeric characters of `session_id` (same as `notify.py`).
- Thresholds: context fill dim green < 50 %, dim orange 50..79 %, dim red >= 80 %. Quota color = pace level from the projection at reset
  (spec 5.1b): `ok` < 85 % green, `tight` 85..100 % orange, `over` > 100 % red, `unknown` grey. **Never color quotas by the raw %.**
- Status line context wins if newer than 120 s. Quota data older than 15 min is drawn grey.
- Token count = `input_tokens + cache_creation_input_tokens + output_tokens` per unique `message.id` (cache reads excluded).
- Context = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` of the last assistant message.

## Review Focus

- A transcript line cut in the middle (Claude still writing): must be left for the next scan, never parsed or skipped for good. Test in Task 1.
- A status line JSON with no `rate_limits` (API-key user, or before the first reply) or `null` fields: prints the parts it has, posts no quota keys. Test in Task 3.
- `/usage` for a session the gadget does not know: quotas stored, no session created. Device test in Task 4.
- 100 % context or more (values above 100 from a bad window guess): fill clamps to the tab width. Test in Task 5 (`/debug/layout`).
- A `resets_at` already in the past: `*_reset_s` sent as 0, shown `0m`. Test in Task 3.
- A new quota window (`resets_at` jumps, % drops to a few %): the old window's samples must not produce a negative or huge rate. Test in Task 3.

---

### Task 1: Transcript scanner (plugin)

**Files:**
- Create: `claude-plugin/agent-gadget/scripts/transcript_usage.py`
- Test: `claude-plugin/agent-gadget/tests/test_transcript_usage.py`

**Interfaces:**
- Produces:
  - `scan(path: str, entry: dict | None, max_read: int = 4 * 1024 * 1024) -> dict` returns the updated entry
    `{"offset": int, "size": int, "tokens": int, "last_ctx": int, "model": str, "seen": [message ids], "partial": bool}`.
    `seen` keeps only the last 50 ids (duplicates are always adjacent lines). Missing file: returns `entry` unchanged (or a zero entry).
  - `load_cache(state_dir: str, session4: str) -> dict` / `save_cache(state_dir: str, session4: str, cache: dict) -> None`;
    file `<state_dir>/<session4>.tok.json`, `{transcript_path: entry}`. Errors return `{}` / are ignored.
  - `context_window(last_ctx: int, model: str) -> int`: 1000000 if `last_ctx > 200000` or `"[1m]" in model`, else 200000.

- [ ] **Step 1: Write the failing tests** (helper writes JSONL lines into a temp file)
  - `test_counts_each_message_id_once`: 3 lines same `message.id` with usage `{input 2, cache_creation 6051, cache_read 145121, output 460}`, then 1 line another id `{input 1, cache_creation 0, cache_read 151000, output 10}` -> `tokens == 2+6051+460 + 1+0+10`, `last_ctx == 151001`, `model` taken from `message.model`.
  - `test_incremental`: scan, append one new message, scan with the returned entry -> only the new tokens are added; `offset == file size`.
  - `test_partial_last_line_waits`: file ends with half a JSON line (no `\n`) -> not counted, `offset` stops before it; complete it -> counted once.
  - `test_shrunk_file_restarts`: entry offset bigger than the file -> rescanned from 0.
  - `test_big_file_reads_tail`: file larger than `max_read` (use `max_read=200`) -> `partial is True`, `last_ctx` from the last message.
  - `test_ignores_non_assistant_and_bad_json`: user lines, garbage lines -> no error, zero tokens.
  - `test_context_window`: `(150000,"claude-opus-5-5") -> 200000`, `(250000,"x") -> 1000000`, `(1000,"claude-x[1m]") -> 1000000`.
  - `test_cache_roundtrip_and_corrupt_file`: save then load equal; a corrupt file loads `{}`.

- [ ] **Step 2: Run, expect FAIL** — `python -m unittest discover -s claude-plugin/agent-gadget/tests -p test_transcript_usage.py` -> ImportError.

- [ ] **Step 3: Implement `transcript_usage.py`** — binary read from `offset` (or `size - max_read` when the gap is larger, then drop the first partial line), split on `b"\n"`, keep the trailing fragment unread, `json.loads` each line, UTF-8 with `errors="ignore"`.

- [ ] **Step 4: Run, expect PASS** (same command), then the whole plugin suite: `python -m unittest discover -s claude-plugin/agent-gadget/tests` -> all OK.

- [ ] **Step 5: Commit** — `git commit -m "feat(plugin): incremental transcript token and context scanner"`

### Task 2: Token and context fields in hook events

**Files:**
- Modify: `claude-plugin/agent-gadget/scripts/notify.py` (`build_event`, `main`)
- Modify: `docs/hook-payloads.md` (sub-agent `transcript_path` finding)
- Test: `claude-plugin/agent-gadget/tests/test_notify.py`

**Interfaces:**
- Consumes: Task 1 `scan`, `load_cache`, `save_cache`, `context_window`.
- Produces: `add_usage(ev: dict, payload: dict, state_dir: str) -> dict` (adds `tok`; lead also `stok`, `ctx_k`, `ctx_pct`; never raises, returns `ev` unchanged on any error).
  `subagent_transcript(payload: dict) -> str | None`.
  Wire: optional integer fields `tok`, `stok`, `ctx_k` (thousands, rounded), `ctx_pct` (0..100+, rounded) on v2 events.

- [ ] **Step 1: Find out what `transcript_path` holds inside a sub-agent.** Read the newest dumps or transcripts on disk only (no live run needed):
  sub-agent transcripts are `~/.claude/projects/<proj>/<session_id>/subagents/agent-<agent_id>.jsonl`. If an existing
  `CLAUDE_GADGET_DUMP` file is around, check a sub-agent `PreToolUse` payload. Otherwise run
  `claude -p "use one general-purpose sub-agent to list the files of this folder" ` in a temp folder with
  `CLAUDE_GADGET_DRY_RUN=1 CLAUDE_GADGET_DUMP=<scratch file>` set (dry run: nothing is posted). Record the answer in
  `docs/hook-payloads.md` (one line under "Common fields"). If this cannot be settled, keep the derived path rule.
- [ ] **Step 2: Write the failing tests** (in `test_notify.py`, temp dirs for transcripts and state):
  - `test_lead_event_has_tokens_and_context`: lead transcript with one message (input 2, cache_creation 6051, cache_read 145121, output 460) -> `tok == 6513`, `stok == 6513`, `ctx_k == 151`, `ctx_pct == 76`.
  - `test_subagent_event_uses_its_own_transcript`: sub-agent payload (`agent_id` `aa0bc7f345def841f`) with file `<dir>/<session_id>/subagents/agent-aa0bc7f345def841f.jsonl` -> `tok` from that file, no `ctx_pct` key.
  - `test_session_total_includes_subagents`: after one sub-agent event and one lead event -> lead `stok == lead tokens + sub tokens`.
  - `test_missing_transcript_sends_event_without_usage`: no file -> event unchanged, no `tok` key.
  - `test_subagentstop_prefers_agent_transcript_path`.
  - `test_mask_keeps_numbers`: `CLAUDE_GADGET_MASK=1` -> `tok` still present.
- [ ] **Step 3: Run, expect FAIL** — `python -m unittest discover -s claude-plugin/agent-gadget/tests -p test_notify.py`.
- [ ] **Step 4: Implement** `add_usage` and `subagent_transcript`; call `add_usage` in `main()` after `build_event` (v2 only, not for `to_v1`). Wrap in `try/except Exception`.
- [ ] **Step 5: Run whole plugin suite, expect PASS**; time one run of the script on the biggest local transcript with `CLAUDE_GADGET_DRY_RUN=1`: must finish under 0.5 s on a second run (cache warm). Write the timing in the commit message.
- [ ] **Step 6: Commit** — `git commit -m "feat(plugin): tokens per agent, session total and context fallback in v2 events"`

### Task 3: Status line script

**Files:**
- Create: `claude-plugin/agent-gadget/scripts/statusline.py`
- Modify: `claude-plugin/agent-gadget/README.md` (section "Status line (context and quotas)": what it shows, manual install snippet from spec 5.1, desktop app does not run it, one terminal session is enough for quotas)
- Test: `claude-plugin/agent-gadget/tests/test_statusline.py`

**Interfaces:**
- Consumes: `notify.host()` (import, do not copy).
- Produces:
  - `usage_body(data: dict, now: float) -> dict` -> `{"v":1,"session",...}` with only the keys that have data (spec 5.3 names).
  - `status_text(body: dict) -> str` -> e.g. `ctx 42% | 5h 48% 1h20 | 7d 61% 2d04h`.
  - `fmt_duration(seconds: int) -> str`: `< 3600` -> `"45m"`, `< 86400` -> `"1h20"`, else `"2d04h"`; negatives -> `"0m"`.
  - `should_send(body: dict, last: dict | None, now: float) -> bool`: true if compare-key differs (ctx_pct, h5_pct, d7_pct, reset minutes rounded to 1 min) or `now - last["at"] >= 60`.
  - Cache file `<tempdir>/agent-gadget-plugin/<session4>.usage`.
  - `pace(samples: list, window: str, pct: float, resets_at: float, now: float) -> dict | None` with `window` `"h5"` or `"d7"`:
    returns `{"rate10": int, "proj": int, "empty_s": int, "level": "ok|tight|over"}` or `None` (unknown), rules of spec 5.1b.
  - `update_history(path: str, now: float, h5: tuple | None, d7: tuple | None) -> list` (append at most one sample per 60 s, drop samples older than 8 days, return the samples; errors -> `[]`).
    History file `<tempdir>/agent-gadget-plugin/quota_history.json`.

- [ ] **Step 1: Write the failing tests**
  - `test_full_body`: input with `context_window {used_percentage 42.4, context_window_size 200000, total_input_tokens 84800}` and `rate_limits five_hour {used_percentage 48.2, resets_at now+4800}`, `seven_day {61.0, now+187000}` -> `{"v":1,"session":"abcd","ctx_pct":42,"ctx_k":85,"ctx_max_k":200,"h5_pct":48,"h5_reset_s":4800,"d7_pct":61,"d7_reset_s":187000}`.
  - `test_no_rate_limits`: no `rate_limits` key / `null` values -> no `h5_*`/`d7_*` keys; text `ctx 42%`.
  - `test_reset_in_past_is_zero`.
  - `test_status_text` for full and empty bodies (empty -> `""`).
  - `test_fmt_duration`: 2700 -> `45m`, 4800 -> `1h20`, 187000 -> `2d03h`, -5 -> `0m`.
  - `test_should_send`: same values 10 s later -> False; 61 s later -> True; ctx 42 -> 43 -> True.
  - `test_pace_h5_slope`: samples 30 min ago 39 % and now 48 % (same `resets_at`, 2 h left) -> `rate10 == 180`, `proj == 84`, level `ok`, `empty_s == -1`.
  - `test_pace_h5_over`: 30 min ago 40 %, now 70 %, 2 h left -> rate 60 %/h, `proj == 190`, level `over`, `empty_s == 1800`.
  - `test_pace_high_pct_low_rate_is_ok`: 30 min ago 79 %, now 80 %, 1 h left -> `proj == 82`, level `ok` (the user's rule).
  - `test_pace_h5_fallback_average`: no history, `pct 20`, window started 2 h ago (`resets_at = now + 3 h`) -> `rate10 == 100`, `proj == 50`.
  - `test_pace_unknown_when_too_early`: window started 5 min ago and no history -> `None`.
  - `test_pace_new_window_ignores_old_samples`: samples with an older `resets_at` at 95 % -> not used (fallback average instead).
  - `test_pace_d7_average`: `pct 61`, `resets_at = now + 2 days` (5 days elapsed) -> `rate10 == 5` (0.508 %/h rounded to tenths), `proj == 85`, level `tight`.
  - `test_history_one_sample_per_minute_and_8_days`.
  - `test_body_has_pace_fields`: full input with history -> `h5_rate10`, `h5_proj`, `h5_empty_s`, `d7_*` present; unknown pace -> those keys absent.
  - `test_script_prints_line_and_never_fails`: subprocess with `CLAUDE_GADGET_DRY_RUN=1` -> stdout one line, exit 0; with garbage stdin -> exit 0, empty stdout.
- [ ] **Step 2: Run, expect FAIL** — `python -m unittest discover -s claude-plugin/agent-gadget/tests -p test_statusline.py`.
- [ ] **Step 3: Implement `statusline.py`**: read stdin, build body, print text, then send if `should_send` (dry run: write the body to stderr instead). All in `try/except`, exit 0.
- [ ] **Step 4: Run whole plugin suite, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(plugin): status line script posts context and plan quotas to /usage"`

### Task 4: Firmware model and HTTP (`/usage`, event fields, `/state`)

**Files:**
- Modify: `agent-gadget/esp32_agent_gadget/model.h`, `model.cpp`, `net.cpp`
- Test (written now, run later with the user): `agent-gadget/tests/test_usage.py`

**Interfaces:**
- Produces (model.h):
  - `Session`: `uint8_t ctxPct` (255 = unknown), `uint16_t ctxK`, `bool ctxFromStatusLine`, `uint32_t ctxAt`, `uint32_t stok`, `uint32_t usageRev`.
  - `Agent`: `uint32_t tok`.
  - `EventV2`: `long tok, stok, ctxPct, ctxK` (-1 = absent).
  - `struct UsageV1 { char session[ID_LEN]; long ctxPct, ctxK, ctxMaxK, h5Pct, h5ResetS, h5Rate10, h5Proj, h5EmptyS, d7Pct, d7ResetS, d7Rate10, d7Proj, d7EmptyS; };` (absent = `LONG_MIN`, because `empty_s` can be -1)
  - `struct QuotaWindow { bool known; uint8_t pct; uint32_t resetS; int16_t rate10; int16_t proj; int32_t emptyS; };` (`proj` -1 = pace unknown, `emptyS` -1 = none)
  - `struct Quotas { QuotaWindow h5, d7; uint32_t receivedAt; uint32_t rev; };`
  - `enum PaceLevel : uint8_t { PACE_UNKNOWN, PACE_OK, PACE_TIGHT, PACE_OVER };` and `PaceLevel modelPaceLevel(const QuotaWindow& w);` (from `proj`: < 85 ok, 85..100 tight, > 100 over; `pct >= 100` over; `proj` -1 unknown)
  - `extern Quotas modelQuotas;`
  - `void modelApplyUsage(const UsageV1& u, uint32_t now);`
  - `uint32_t modelQuotaResetLeft(uint32_t resetS, uint32_t now);` (floored at 0)
  - `uint8_t modelSessionCtx(const Session& s, uint32_t now);` (applies the 120 s status line priority; 255 unknown)
  - `String modelFormatTokens(uint32_t t);` -> `"999"`, `"12k"`, `"1.6M"`.
- Rules: event context fields update the session only if no status line value newer than 120 s; `/usage` context sets `ctxFromStatusLine`; `tok` changes bump the agent `rev`; context/stok/quotas bump `usageRev` / `modelQuotas.rev` and `modelRev`. New sessions start with `ctxPct = 255`.
- `/state` additions exactly as spec 5.3 (`usage` object with `age_s`; per session `ctx_pct` (null when unknown), `ctx_k`, `ctx_src`, `tok` (= stok); per agent `tok`).
- `net.cpp`: `POST /usage` -> 400 `"v is required"` without `v`; isolation rule like `/event`; `HTTP_OPTIONS` like `/event`. `handleEvent` reads the 4 optional longs with `jsonLong`.

- [ ] **Step 1: Write `test_usage.py`** (style of `test_state.py`, uses `Gadget.request("POST","/usage",body)`; add a `usage(**fields)` helper to `gadget_client.py`):
  - `test_usage_requires_v` (400), `test_quotas_in_state` (h5 48 / d7 61 appear under `usage`, `age_s` small),
  - `test_usage_unknown_session_keeps_quotas_only` (no session created),
  - `test_statusline_context_wins_over_event` (usage ctx 42 then event ctx_pct 70 -> state shows 42, `ctx_src` `statusline`),
  - `test_event_context_when_no_statusline` (event ctx_pct 70 -> 70, `transcript`),
  - `test_tokens_per_agent_and_session` (lead event tok 6513 stok 9000, sub event tok 2487 -> agent toks and session `tok` 9000),
  - `test_reset_counts_down` (h5_reset_s 100, wait 2 s -> state value <= 98).
  - `test_pace_fields_roundtrip` (h5_rate10 180, h5_proj 84, h5_empty_s -1 -> same values in `/state`; absent pace -> keys absent or null).
- [ ] **Step 2: Implement** model and net changes.
- [ ] **Step 3: Build every env, expect SUCCESS** — from `agent-gadget/esp32_agent_gadget`: `pio run -e esp32dev -e esp32dev_test -e esp32dev_test_screen -e esp32dev_noscreen`.
- [ ] **Step 4: Check the test file loads** — `python -m unittest discover -s agent-gadget/tests -p test_usage.py` must import cleanly and SKIP (no gadget reachable on the default host is expected; if it is reachable, stop: do not run device tests unattended, set `GADGET_HOST=127.0.0.1` for this check).
- [ ] **Step 5: Commit** — `git commit -m "feat(core): /usage endpoint, per-session context, per-agent tokens, plan quotas"`

### Task 5: Screen (tab fill, token zone, quota line)

**Files:**
- Modify: `agent-gadget/esp32_agent_gadget/layout.h`, `layout.cpp`, `ui_theme.h`, `hmi_uart.h`, `hmi_uart.cpp`, `display_hmi.cpp`, `display_serial.cpp`, `net.cpp` (`/debug/layout`)
- Test (run later with the user): `agent-gadget/tests/test_layout.py`

**Interfaces:**
- Consumes: Task 4 `modelSessionCtx`, `modelQuotas`, `modelQuotaResetLeft`, `modelFormatTokens`, `Agent.tok`, `Session.stok`.
- Produces (layout.h): `Rect layoutTabFill(int index, int count, int pct);` (width `L_TAB_W * min(pct,100) / 100`, pct 255 -> width 0),
  `Rect layoutStripTokens();` (right 64 px of command line 2: x 412, y `L_STRIP_Y + 28`, w 64, h 17),
  `Rect layoutQuotaLine();` (x 0, y `L_STRIP_Y + 62`, w 480, h 18).
- `ui_theme.h`: `C_FILL_OK`, `C_FILL_WARN`, `C_FILL_HOT` (dim RGB565, start values `0x0280`, `0x5180`, `0x6000`; to be tuned on the real screen), `L_TOK_W 64`, `L_QUOTA_BAR_W 60`.
- `/debug/layout?...&ctx=P` adds `"tab_fill": rect` for tab 0 at `P` percent and `"strip_tokens"`, `"quota_line"` rects.

- [ ] **Step 1: Extend `test_layout.py`**: `test_tab_fill_widths` (ctx 0 -> w 0, 50 -> 37, 100 -> 74, 150 -> 74, 255 -> 0); `test_strip_token_zone_right_of_command` (`strip_tokens.x + w <= 480`, `x >= 4 + 8*40`); `test_quota_line_inside_strip` (`y >= strip.y`, `y + h <= 272`).
- [ ] **Step 2: Implement layout functions and the debug field.**
- [ ] **Step 3: Implement drawing** in `display_hmi.cpp`:
  - `drawTitle`: after the tab background, fill `layoutTabFill` with the band color, then draw the dot, name and count over it with a new
    `hmiTextClear(x, y, w, h, font, fg, xcen, s)` in `hmi_uart.h/.cpp` (same as `hmiText` with `xstr` background mode `sta=3`, no background).
    Mode 3 is from the TJC docs and **not tested on this screen**: add it to the morning checklist; if it fails there, the fallback is
    `hmiText` with `bg` = fill color for text boxes that start inside the fill. Title signature mixes `fillWidth/2` and the band per tab.
  - `drawStrip`: command line 2 width shrinks by `L_TOK_W`; tokens grey in `layoutStripTokens` (lead: `stok`; sub-agent: `tok`; zero -> blank); line 3 rule from spec 5.5 (detail if non-empty and not a substring of `cmd`, else `before: ...`).
  - New `drawQuotaLine(now)` in region `HMI_STRIP`: spec 5.5 text and bars with the projection tick, color from `modelPaceLevel` (never from `pct`),
    `empty 1h05` in place of the reset time when `over` (counted down from `emptyS` and `receivedAt`), grey if `now - receivedAt > 15 min` or no data (`quotas: no status line data`). Called from `drawStrip`, and from the 2 s age refresh. Strip signature mixes `modelQuotas.rev`, the agent's `tok`, and `stok`.
  - `drawEmpty`: quota line at the bottom when `modelQuotas.known`.
  - `display_serial.cpp`: one extra line per render `[display] ctx <sid>=<pct>% ... | 5h 48% 1h20 | 7d 61% 2d03h`, plus `tok` per row.
- [ ] **Step 4: Build every env, expect SUCCESS** (command from Task 4 Step 3).
- [ ] **Step 5: Commit** — `git commit -m "feat(screen): context fill in tabs, tokens in the strip, permanent quota line"`

### Task 6: Docs and morning report

**Files:**
- Modify: `agent-gadget/ARCHITECTURE.md` (wire format `/usage`, new event fields, `/state` additions, screen items), `CLAUDE.md` (one line under "Claude plugin" for `statusline.py`; one line under Firmware for `/usage`), `agent-gadget/scenario.py` (add `/usage` posts and `tok` fields so the scenario fills the new zones; do not run it).
- Create: `docs/superpowers/usage-display-REPORT.md`

- [ ] **Step 1: Update the docs** listed above (English, short).
- [ ] **Step 2: Final checks** — plugin suite green; all 4 envs build; `git status` clean apart from the report.
- [ ] **Step 3: Write the report** (French, short): tasks done, test and build results with counts, the sub-agent `transcript_path` finding, anything skipped and why, and the **morning checklist with the user**:
  1. Flash `esp32dev_test` by USB, run `python -m unittest discover -s agent-gadget/tests` (expect `test_usage.py`, `test_layout.py` green).
  2. Flash `esp32dev`, run `python agent-gadget/scenario.py`, check text readability over the 3 fill colors (and that `xstr` mode `sta=3` draws without background), tune `C_FILL_*`.
  3. Install the status line in `~/.claude/settings.json` (README snippet), open one terminal `claude` session, check the quota line.
  4. Merge plan with branch `agent-gadget-ui` (expect conflicts in `net.cpp`, `ARCHITECTURE.md`, `CLAUDE.md`).
- [ ] **Step 4: Commit** — `git commit -m "docs: usage display (wire format, install, morning checklist)"`
