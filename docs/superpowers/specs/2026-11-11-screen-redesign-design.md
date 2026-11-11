# Screen redesign: design

Date: 2026-11-11. Status: approved by the user.
Replaces the look of layout D (`2026-11-08-agent-gadget-ui-design.md`, sections on the title bar, tree and command strip).
The core model, the HTTP API, the draw queue and the touch parser stay.

Visual references (open in a browser, both are self-contained HTML at the real 480x272 size):
- `2026-11-11-screen-redesign-mockup-frame.html`: the approved frame and tabs (selected tab and session frame in the same
  color, two dark inner panels, no border, no purple line). This file wins over the next one for the top bar and frame.
- `2026-11-11-screen-redesign-mockup-states.html`: the four screen states (normal, compact, detail, standby). Its top bar
  (clock top right, purple line) is outdated: the clock moved to the bottom bar.

The mockups use a proportional browser font. The screen uses TJC bitmap fonts with fixed ASCII cells: the character
budgets below are the binding numbers, not the mockup's text widths.

## Intent

The user finds the current screen ugly and hard to read: sprites eat the space, agent names and commands are cut,
the selected tab does not show, the quota line is unreadable. The gadget must answer at a glance:
**who does what, how many agents, which task, where the superpowers plan stands.**
Sprites are a bonus: small animations that make the gadget pleasant, never at the cost of text.

## Goals

- Full agent names and readable current actions.
- The selected session is obvious, and its lead and sub-agents read as one group.
- Plan progress (task n of m, current task title, next task) for sessions that use a task list.
- A clock, in the bottom bar during work and full screen in standby.
- One visual style, "dark and clean" (GitHub-like dark palette, flat panels, small rounded corners).

## Non-goals

- Sprite themes (office, royalty, cats): separate plan `2026-11-08-sprite-themes.md`. This design only needs the
  existing sprite ids plus one new small size.
- Runtime theme switching, light mode, accents in screen text.
- Changes to the HTTP API beyond the plan fields.

## Anti-goals (rejected during the mockups)

- Big sprites in a tree with names cut to 5 characters (today's layout D).
- Neon terminal and warm gradient styles.
- A purple line on the selected tab; a grey border around tab and frame ("too busy").
- Sub-agent rows that look attached to the non-selected tabs.

## Approaches

1. **Pre-rendered decor (chosen).** A PC script renders the static decor (background with the frame, rounded rows,
   labels, arrows, standby digits) to PNG; they go into the `.tft` as pictures. The ESP32 places pictures and writes
   text, bars and the clock. Faithful to the mockup, few UART bytes. Any decor change needs a `.tft` reflash
   (about 1 min through `/tft`).
2. All ESP32 primitives (today's way): no reflash for tweaks, but jagged corners, many bytes, a look close to today's.
3. Components placed in the Chinese editor: row count and per-state colors become rigid. Rejected.

## Screen structure (480x272)

| Zone | Rect (x, y, w, h) | Content |
|---|---|---|
| Top bar | 0, 0, 480, 30 | Selected tab (left, fixed slot), other session labels, arrows, needs-you badge |
| Session frame | 6, 30, 468, 216 | Same color as the selected tab; holds the two inner panels |
| Lead panel | 12, 36, 150, 204 | Lead, context, plan; or the tapped sub-agent's detail |
| Team panel | 170, 36, 302, 204 | Header + sub-agent rows |
| Bottom bar | 0, 250, 480, 22 | Quotas 5h and week, clock right |

Palette (RGB, convert to RGB565 in `ui_theme.h`): screen background 13,17,23; top/bottom bars 22,27,34;
frame and selected tab 36,48,68; inner panels 18,24,33; rows 26,34,48; text 230,237,243; dim text 139,148,158;
faint 110,118,129; working 63,185,80; needs you 240,136,62; error red (today's); your turn grey-blue (today's);
plan accent 163,113,247 (only the "PLAN" label and the current segment).

### Top bar

- **Selected tab**: fixed slot x 6..166 (same width as the lead panel, sits right above it), 28 px tall, frame color,
  rounded top corners, no line, no border. Content: state dot, title (or project) in bold, agent count chip
  (grey 58,70,88 with light text). Budget: 15 characters of the 14 px font.
- **Other sessions**: labels in the zone x 170..440, 22 px tall, 1 px outline 33,38,45, dim 12 px text, state dot and count.
  With 3 sessions or fewer, the 2 others share the zone. With 4 or 5, two labels show between arrows `<` `>` (24 px
  each); an arrow turns orange when a hidden session on that side needs the user; a greyed arrow means nothing on that side.
  Tapping a label selects that session (it moves to the left slot).
- **Badge** "N !" (needs-you count, all sessions) at the right end, orange.
- Touch: labels and arrows answer taps down to y 34 (fingers rarely reach y < 29, `docs/touch-findings.md`).

### Lead panel (normal)

- Lead sprite (36x42, id 0) top left; bobs while working, still otherwise, alternates with an orange version when it needs the user.
- Name (title or project), 14 px bold, full panel width line; state and age line colored by state ("working, 12m");
  "ctx 34%".
- Lead's current action, 12 px, up to 2 lines.
- With a plan: "PLAN 3/8" label (accent), segment bar (done green, current accent, todo grey; more than 16 tasks: one
  continuous bar), current task title (up to 2 lines), "next: ..." (1 line, faint).
- Without a plan: "LAST" label and the previous command with its age.

### Lead panel (detail of a tapped sub-agent)

Sprite, role, state and age, tokens; "COMMAND" label and the full command over up to 3 lines (cmd + detail);
"BEFORE" label and the previous command with its age; "tap to go back" hint. Back to the lead after 10 s or a tap on the panel.
The tapped row gets a light outline. The detail shows only after a tap: in automatic mode the panel always shows the lead.
Session selection keeps today's rules (most urgent session automatically, a manual pick holds 30 s, `UI_HOLD_MS`).

### Team panel

- Header line: "TEAM · 5 SUB-AGENTS · 4 WORKING" (faint 10 to 12 px caps). No sub-agent: "NO SUB-AGENTS" and the panel stays empty.
- **Normal rows** (1 to 5 sub-agents): 290x32 at y 54 + i*36 (last ends at y 230). Left state bar 4 px, small sprite
  24x28 (ids 8..15), role in bold on line 1, current action on line 2 (needs-you text in orange). Done rows dimmed.
- **Compact rows** (6 to 8 sub-agents): 290x20 at y 54 + i*23 (last ends at y 235). State bar, tiny sprite 16x18
  (new ids), role (budget 12 characters) and action on one line.
- More than 8: 7 rows plus a "+N more" row; done agents are dropped from view first, then the oldest idle ones.

### Bottom bar

"Session 5h [bar] 48% reset 1h20", "Week [bar] 61% reset 2d03h", clock "14:32" right-aligned. Bar color from the pace
(today's `paceColor`). Pace over: "empty in 40m" replaces "reset ...". Stale quotas (no report for 15 min): grey.
No quota known: the zone shows only the clock.

### Standby (full-screen clock)

- Enters after 5 min with no agent in working, waiting on sub-agents, needs you or error state, in any session
  (your turn and done count as idle), and also when there is no session.
- Shows: big "HH:MM" (digit pictures), date "Wednesday 11 November" (16 px), a summary line ("3 sessions idle, last
  activity 7m ago", or the gadget IP when there is no session), the quota bar at the bottom.
- Leaves on any event that puts an agent in an active state, or on a tap.
- Clock: NTP (`configTzTime`, Europe/Paris rule `CET-1CEST,M3.5.0,M10.5.0/3`). Until the time is known, the clock
  is hidden and standby shows the current "waiting for agents" text and IP.

### Other screens

Wi-Fi setup, boot and `.tft` update messages keep their text but use the new palette and fonts.

## Fonts (in the `.tft`)

Today: `f24` (id 0) and `f16` (id 1), ASCII cells half the height (12 and 8 px wide). Add, keeping ids 0 and 1:

| Font | Height | ASCII cell | Use |
|---|---|---|---|
| f12 | 12 px | 6 px | actions, labels, bottom bar, other-session labels |
| f14 bold | 14 px | 7 px | names, selected tab, task title |
| f16 (existing) | 16 px | 8 px | standby date |

Character budgets: lead panel line 138 px = 23 chars of f12 or 19 of f14; row text 246 px = 41 chars of f12 or
35 of f14; compact row role 12 chars of f14 + action 26 chars of f12.
Whether the TJC X2 font generator gives anti-aliased glyphs is unknown: the hardware spike (below) settles it.

## Pictures (in the `.tft`)

Ids 0..15 stay as they are (existing sprites), so the current firmware keeps working with a new `.tft`. New ids from 16:
main background (480x272: bars, frame, both inner panels, selected tab shape), normal row and compact row
(rounded, row color), other-session label outline, arrows (normal, off, orange), tiny sprites 16x18 (8),
standby background, standby digits 0..9 and colon. Generated by a new script in `agent-gadget/tools/`
(Pillow, like `make_sprites.py`), then added by hand in the editor picture panel in id order.

## Drawing rules

- Static decor comes from pictures (`pic`). Old text is erased by writing over a flat area: every text sits on a flat
  color (panel, row, bar), so `xstr` with a solid background (sta=1) is enough. Rounded corners never touch text.
- Clearing a row: redraw its row picture. Clearing a zone of the background: `picq` from the main background picture.
- Animation: every 600 ms, working sprites move 2 px up or down (flat fill of the 2 px band + `pic`); needs-you sprites
  alternate with an orange disc. Budget: about 40 bytes per sprite per step, under 1 KB/s for 13 sprites at 115200 baud.
- Draw order stays prioritized (top bar, lead panel, team panel + bottom bar) through the existing queue.

## Data changes

- `ROLE_LEN` 13 -> 24 (today "general-purpose" shows as "general-purp"); `notify.py` cuts the role at 12: raise to 23.
  `CMD_LEN` 44 -> 64 and `notify.py` cmd cut 43 -> 63. RAM: about +50 bytes per agent, 65 agents, about 3.3 KB.
- Plan per session: `planDone`, `planTotal`, `planCur[48]`, `planNext[48]`, new optional v2 event fields
  `plan_done`, `plan_total`, `plan_cur`, `plan_next`. Source: `notify.py` reads the task-list tool calls of the
  session (`TaskCreate`/`TaskUpdate` in the CLI, `TodoWrite` if present, the desktop app's task list tool, which
  sends deltas such as `advance`, `done`, `start`) and keeps per-session state on disk. **Open:** the exact payloads
  are unknown; capture them first with `CLAUDE_GADGET_DUMP` in both the CLI and the desktop app, then fix the field mapping.
- Clock: NTP time on the ESP32; no wire change.

## Plan order (for the plan writer)

1. **Hardware spike, first.** Generate f12 and f14 in the editor, render one main background picture, flash, draw a
   row picture and `xstr` text over it, photograph the screen. Settles anti-aliasing and the real look. The user approves
   the photo (AskUserQuestion) before the rest.
2. Capture the task-list payloads (CLI and desktop).
3. Decor generator script and pictures; `.tft` with fonts and pictures.
4. Firmware: layout, top bar, panels, rows, bottom bar, detail view, standby, NTP, animation.
5. Model and plugin: longer fields, plan fields.
6. Docs: `ARCHITECTURE.md`, `CLAUDE.md` (fonts, picture ids), plugin README.

## Left to the builder

Exact pixel offsets inside panels, the label widths with arrows, the tiny sprite drawing, `ui_theme.h` names,
how the three draw regions map to the new zones, the touch hit map, and the "+N more" row wording.

## Decisions after review

- `agent-gadget-office-anim.tft` (untracked, root) is an old experiment: ignored. Animations are rebuilt in the new `.tft`.
- **Hardware spike (2026-11-11), fonts.** Three rounds on the real panel. f12 and f14 (Segoe UI, anti-aliased) were too
  small; fonts without anti-aliasing (Tahoma, Verdana) read worse than anti-aliased Segoe UI. Chosen: anti-aliased
  **Segoe UI Semibold 16 px** for every secondary line and **Segoe UI Semibold 20 px bold** for names, titles and the
  clock. Segoe UI renders proportional: budgets are pixel widths, measured with a width table generated from the font.
  Secondary text uses the lighter grey 200,208,216 (139,148,158 was unreadable); state green 90,220,110.
  Final font ids after cleanup: 0 `f24`, 1 `f16`, 2 `s16`, 3 `s20`.
- **Geometry change from the fonts.** Normal rows are 42 px tall (name 20 px + action 16 px): 1 to 4 sub-agents at
  y 58 + i*45. Compact rows (one line, 16 px font) are 22 px tall: 5 to 7 sub-agents at y 58 + i*24. With 8 or more,
  6 compact rows plus a "+N more" row. The team header takes y 38..56.
- **Sprites (2026-11-11).** The user picked the "small robots" style for every size (mockup
  `2026-11-11-screen-redesign-mockup-sprites.html`, option B): flat robot in the role color, dark visor with two light
  eyes, role accessory (crown, antenna, lamp, cap, glasses, white band, headphones, none), role icon on the chest.
  Same picture ids 27..50 (big, small, tiny); new ids 63..86 hold the same robots with closed eyes, for blinking.
  Role colors: lead 212,167,44; general 110,123,242; explore 47,181,165; plan 163,113,247; review 219,97,162;
  test 176,125,79; code 76,142,218; generic 139,148,158.
