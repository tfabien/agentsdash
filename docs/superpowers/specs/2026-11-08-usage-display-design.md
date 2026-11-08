# Agent gadget - context size, plan quotas and token use on the screen (design)

Status: outline agreed in chat on 2026-11-08 (data from status line + hooks, context fill in the tabs, quotas always
visible, tokens per agent). Details in section 8 are the designer's calls, open to veto. Branch `agent-gadget-usage`.
Builds on `2026-11-08-agent-gadget-ui-design.md` (layout D). Language of the product: English.

## 1. Intent and why

The user wants three numbers always visible on the desk screen:

1. **Context size of each session**, to run `/compact` before a session gets too big.
2. **Plan quotas** (rolling 5-hour window and weekly window), to avoid hitting the limits.
3. **Tokens used per session and per agent** (a plus, lower priority).

The screen stays read-only. It never runs `/compact` and never blocks Claude.

## 2. Goals, non-goals, anti-goals

Goals
- Each session tab shows its context fill, readable from a distance (color and length).
- The 5-hour and weekly quotas are on screen whatever session or agent is selected, with time to reset.
- The command strip shows the tokens of the selected agent; for the lead, the session total.

Non-goals
- No alert sound, no automatic `/compact`, no history or charts.
- No cost in dollars.
- No quota data for API-key users (Claude Code only reports quotas to Pro/Max subscribers).
- No change to any project outside this repository.

Anti-goals
- Slowing Claude Code: every script stays under 1.5 s, never prints to hook stdout, always exits 0.
- A wrong number shown as current: old data must look old (grey), missing data must say so.
- Text that cannot be read over the context fill in a tab.

## 3. Data sources (facts checked 2026-11-08)

| Number | Source | Notes |
|---|---|---|
| Context % and window size | Status line JSON: `context_window.used_percentage`, `context_window.context_window_size`, `context_window.total_input_tokens` | Exact. Window is 200000 or 1000000. |
| Quotas | Status line JSON: `rate_limits.five_hour.used_percentage`, `.resets_at`, same for `seven_day` | Unix epoch seconds. Present only for subscribers and after the first API response. **No hook carries it.** |
| Context (fallback) | Transcript (`transcript_path` in every hook payload): last assistant `message.usage` | `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. |
| Tokens per agent | Transcripts | Lead: `transcript_path`. Sub-agent: `<dir of transcript_path>/<session_id>/subagents/agent-<agent_id>.jsonl` (also `agent_transcript_path` on `SubagentStop`). |

Transcript facts (checked on a real file): one assistant message is written on several lines that repeat the same
`message.id` and the same `usage`, so token sums must count each `message.id` once. Files reach several MB:
read them incrementally (keep a byte offset), never in full on each hook.

The status line script runs on: session start, each new assistant message, `/compact` end, and every
`refreshInterval` seconds if set. Debounced at 300 ms. It is configured once in the user's `~/.claude/settings.json`
(`statusLine`, a single command). **Checked 2026-11-08 on this PC: the Claude desktop app does not run the status
line** (no status line process spawned by the desktop session in 12 s), while terminal `claude` sessions run it every
`refreshInterval`. Consequences: quotas are account-wide, so **one terminal session is enough** to feed them; desktop
sessions get their context from transcripts (section 5.2). Quotas with no terminal session open: shown as missing/old.

## 4. Approaches considered

1. Hooks only (transcripts): gives context and tokens, never the quotas. Rejected: misses goal 2.
2. **Status line script + hooks (chosen)**: a status line script in this repo's plugin posts context and quotas; the
   existing hook script adds tokens and a context fallback from transcripts. Only source of quotas that is documented.
3. ESP32 or a PC daemon polls Anthropic's undocumented usage endpoint: needs the OAuth token stored on the gadget or a
   new daemon, and can break without notice. Rejected.

## 5. Design

### 5.1 Status line script (new): `claude-plugin/agent-gadget/scripts/statusline.py`

- Reads the status line JSON on stdin. Python standard library only. Any error: print nothing extra, exit 0.
- Prints **one short line** to stdout (this becomes the status line): `ctx 42% | 5h 48% 1h20 | 7d 61% 2d04h`
  (parts with no data are left out). ASCII only.
- POSTs `POST http://<host>/usage` (same host lookup as `notify.py`, timeout 1 s), body in 5.3.
- Sends only when something changed since the last post for this session (rounded values: context %, quota %,
  reset minutes), or when the last post is older than 60 s. Last post kept in a small file in the temp folder
  (`agent-gadget-plugin/<session>.usage`). Network errors are ignored.
- Resets are sent **relative** (`*_reset_s` = `resets_at` minus now), so the ESP32 needs no clock.
- Install is a manual step documented in the plugin README: `"statusLine": {"type": "command",
  "command": "python <repo>/claude-plugin/agent-gadget/scripts/statusline.py", "refreshInterval": 10}`.
  **The implementation never edits `~/.claude/settings.json`.**

### 5.2 Hook script changes: `scripts/notify.py`

- New module `scripts/transcript_usage.py` (imported by `notify.py`), pure functions plus a cache:
  - `scan(path, cache)`: reads from the cached byte offset to the end, only whole lines; for each assistant line with
    `message.usage`, counts each `message.id` once. Keeps per file: offset, `tokens` (sum of `input_tokens +
    cache_creation_input_tokens + output_tokens`, **cache reads excluded** because they repeat the whole context every
    turn), `last_ctx` (input + cache creation + cache read of the last message), `model`.
  - Cache file per session in the temp folder (`agent-gadget-plugin/<session>.tok.json`), keyed by transcript path.
  - If a file shrank (rewritten), restart it from offset 0.
- Every v2 event gains optional fields:
  - `tok`: tokens of this agent (lead: lead transcript; sub-agent: its own transcript).
  - lead events only: `stok` (session total = sum of every transcript of the session in the cache, sub-agents
    included, so it survives sub-agents leaving the screen), `ctx_k` (last context in thousands), `ctx_pct`
    (`last_ctx` / window; window = 1000000 if `last_ctx` > 200000 or the model id contains `[1m]`, else 200000).
- Time budget: scanning stays incremental; if a scan would read more than 4 MB at once (first sight of a big
  transcript), it reads only the last 4 MB for `last_ctx` and marks `tokens` as partial (still sent, it only grows).
  Builder's call how to mark partial; the screen does not need to know.
- The sub-agent transcript path is derived from `transcript_path`, `session_id` and `agent_id`. If the hook payload
  inside a sub-agent already carries the sub-agent's own transcript as `transcript_path`, use it. **Check this with
  one dump** (`CLAUDE_GADGET_DUMP`) of a session with a sub-agent, and record the result in `docs/hook-payloads.md`.
- `CLAUDE_GADGET_MASK` does not hide numbers.

### 5.3 Wire format

`POST /usage` (new), ASCII JSON, every field optional except `v`:
`{"v":1,"session":"<id4>","ctx_pct":42,"ctx_k":84,"ctx_max_k":200,"h5_pct":48,"h5_reset_s":4800,"d7_pct":61,"d7_reset_s":187000}`.
`session` uses the same 4-character id as the events (same sanitizing as `notify.py`). Reply `ok`, 400 if `v` is missing.

Events v2 (existing `/event`): optional `tok`, `stok`, `ctx_pct`, `ctx_k` as above. Old firmware ignores unknown keys
(the parser looks keys up by name), so the plugin stays compatible.

`GET /state` gains `"usage":{"h5_pct","h5_reset_s","d7_pct","d7_reset_s","age_s"}` (absent when never received) and,
per session, `"ctx_pct","ctx_k","ctx_src":"statusline|transcript","tok"` and, per agent, `"tok"`.

### 5.4 Model (ESP32 core)

- `Session` gains `ctxPct` (uint8, 255 = unknown), `ctxK` (uint16), `ctxFromStatusLine` + `ctxAt` (millis), `stok` (uint32).
  `Agent` gains `tok` (uint32).
- Context priority: a status line value newer than 120 s wins; otherwise the transcript value from events.
- `/usage` for a session the gadget does not know: quotas are kept, the context is dropped (no session is created).
- Quotas are one global record (account-wide): percentages, reset seconds, `receivedAt`. Displayed reset =
  `reset_s - (now - receivedAt)/1000`, floored at 0. When the 5-hour reset reaches 0, show `0%` greyed until new data.
- Changing any of these bumps the matching `rev` so the screen redraws only that region.

### 5.5 Screen

Tabs (title bar, 74 x 20 px each):
- The tab background fills from the left over `w * ctx_pct / 100` px. The fill uses a **dim** color so white text
  stays readable: dim green under 50 %, dim orange 50 to 79 %, dim red from 80 % (exact RGB565 values: builder,
  checked on the real screen for contrast). Unfilled part keeps `C_TAB` / `C_TAB_SEL`.
- Unknown context: no fill. Redraw only when the fill changes by 2 px or more, or the color band changes.
- The state dot, name and agent count stay as they are, drawn over the fill.

Command strip (y 190..272), lines unchanged except:
- Line 2 (current command) gives its right 64 px to the tokens: selected sub-agent `34k`; lead `1.6M` = session total
  (`stok`), in grey. Format: under 1000 as is, then `12k`, `1.6M`.
- Line 3 shows `detail` only when it adds something (not empty and not already contained in `cmd`); otherwise it shows
  the previous command (`before: ...`), which used to be on line 4.
- Line 4 (y+62) becomes the **quota line**, always drawn, same for every selection:
  `5h [######----] 48% 1h20   7d [######----] 61% 2d04h`. Bars about 60 px. Colors: green under 70 %,
  orange 70 to 89 %, red from 90 %. No data yet: `quotas: no status line data` in grey. Data older than 15 min: grey.
  Reset times refresh with the existing 2 s age refresh, not on every loop.
- The empty screen (no session) also shows the quota line at the bottom when data exists.

`display_serial.cpp` (no-screen build) prints the same numbers in its text output.

## 6. Constraints

- Screen text ASCII only. Fonts f24 (12 px wide) and f16 (8 px wide).
- The draw queue priorities stay: title bar > strip > tree. A context change must not trigger a full redraw.
- Plugin: Python standard library, never prints to hook stdout, exits 0, 1.5 s timeout (status line: 1 s for the POST).
- The user-level plugin runs live from the main working tree: this branch must not break `notify.py` once merged.
- Another task is running on branch `agent-gadget-ui` (screen `.tft` upload). This branch starts from `bb6fce2`;
  expect merge conflicts in `net.cpp` and `ARCHITECTURE.md`, keep changes there small and grouped.

## 7. Tests

- Plugin (no hardware, `python -m unittest discover -s claude-plugin/agent-gadget/tests`): status line parsing and
  output line, change detection, relative resets, chaining; transcript scan with duplicated `message.id`, offsets,
  shrunk file, 4 MB cap; new event fields.
- Firmware: every PlatformIO env must compile (`pio run`). Device tests (existing harness `agent-gadget/tests`, test
  build flashed by USB): `/usage` parsing and 400, context priority and expiry, unknown session, `/state` fields,
  event `tok`/`stok`. **Written during the unattended run, executed only later with the user** (the ESP32 is shared
  with another task).
- Layout: tab fill width for 0, 50, 100 %; strip token zone does not overlap the command text.
- Manual on the real screen, with the user: readability of text over the three fill colors, quota line, install of the
  status line in `~/.claude/settings.json`.

## 8. Calls made by the designer (user can override)

- Fill thresholds 50 / 80 % for context; 70 / 90 % for quotas.
- Tokens exclude cache reads.
- The quota line takes the old "previous command" line; the previous command moves to line 3 when `detail` is redundant.
- Status line install stays manual (README).
- Context window guessed 200k unless over 200k or `[1m]` in the model id (fallback path only).

## 9. Left to the builder

RGB565 dim colors, exact pixel positions inside the strip, cache file format, how partial token counts are marked,
test names, and the order of commits.
