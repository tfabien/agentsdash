# Agent Gadget - live agent standup on an ESP32 + HMI screen (UI and data design)

Status: draft for approval. Written 2026-11-08. Language of the product: English (on-screen text, docs).

## 1. Intent and why

A small screen on the desk shows, at a glance, what the user's Claude Code sessions and their sub-agents are
doing, in the spirit of the "Agent Standup" app: each agent is a small **pixel-art character**. The user wants to see
**which agent is working and what it is doing, which one waits (for the user, or for its sub-agents), and the
hierarchy** (a lead that launches sub-agents and waits for their answers), across **several sessions** at once.

The user works with 1 to 5 sessions at the same time. Most are interactive with few sub-agents; a session that runs a
workflow such as superpowers, speckit or bmad can reach **10 to 12 sub-agents**. The point of the gadget is to answer,
without switching windows: "does anything need me, and what are the others doing?"

## 2. Goals, non-goals, anti-goals

Goals
- See every session and its sub-agents with their state and the link lead -> sub-agents.
- See at once which session needs the user (an approval or an answer).
- Tap an agent to see its current command (and the previous one).
- Work with 1-5 sessions and up to 12 sub-agents in one session.
- Keep working unattended: Wi-Fi setup portal, OTA updates (already built).

Non-goals (v1)
- No data source other than Claude Code hooks (reading session files, Codex, Mistral Vibe, Cowork: possible later).
- No cross-session dependencies ("session A waits on session B"): only lead <-> its sub-agents.
- No usage-limit / logged-out alerts, no "blocked" or "idle" detection (hooks do not provide them).
- No sound (the screen has a buzzer; not part of v1), no accents (ASCII only), no history beyond the previous command.
- The screen is read-only: it never controls Claude.

Anti-goals (would make it a failure even if it works)
- Slowing down or blocking Claude Code (hooks must stay fast and silent).
- A false "needs you" alert, or missing a real one.
- Visible flicker or a screen that lags far behind (the link is 9600 baud).
- Showing secrets: command text is shown on a desk screen and travels in clear over the LAN.

## 3. Constraints (facts)

Screen: TJC4827X243_011C, **480x272 landscape**, capacitive touch. Runs the `blank.tft` project (one black page, no
component; fonts `f24` = id 0 and `f16` = id 1, ASCII only). Controlled over UART at **9600 baud** with Nextion-style
commands (`cls`, `fill`, `cirs`, `xstr`, ...). A command is 40-70 bytes (about 5-8 ms/10 bytes), so redrawing one agent
row costs about 0.4 s and a full redraw several seconds. Images (`pic`) must be **baked into the .tft** (16 MB flash) and
are instant to draw; changing them means re-flashing the .tft (about 50 s through the editor and the ESP32 bridge, which
temporarily replaces the gadget firmware; USB needed to restore it). Drawing a sprite with per-pixel `fill` commands
(about 30 commands each) is too slow for a dozen agents.

Touch: the page has no component, so the screen reports nothing today. Whether the firmware can report **raw touch
coordinates** (Nextion's `sendxy`) is **untested**; otherwise touch zones (hotspot components) must be added to the screen
project with fixed geometry.

ESP32: 30-pin DevKit, Wi-Fi, 520 KB RAM, firmware split in a core (`model`, `net`) and a screen layer (`display.h`
interface, `display_hmi.cpp`, `ui_theme.h`, `hmi_uart`) - see `agent-gadget/ARCHITECTURE.md`. Today it keeps **5 agents**
flat (no parent), and exposes `POST /event {agent,state,task}`, `GET /state`, `POST /reset`, `/config`, `/update`.

Hooks (Claude Code): `SessionStart`, `UserPromptSubmit`, `PreToolUse` (`tool_name`, `tool_input`), `Notification`
(`message`), `Stop`, `SessionEnd`, `SubagentStart`, `SubagentStop` (`last_assistant_message`); every payload has
`session_id` and `cwd`; anything that happens **inside a sub-agent also carries `agent_id` and `agent_type`**. They run for
every session (the plugin is installed at user level, `claude-plugin/agent-gadget`, v0.1: one flat row per session or
sub-agent, no parent link). Hooks do not say whether a session is idle, nor give nested-sub-agent parents (unverified).

## 4. Approaches considered

Data source (decided: hooks)
1. Agent Standup's local server as the source: states and hierarchy already computed, but its API is undocumented, links
   are inferred from text in session files, it is bound to 127.0.0.1 (the gadget cannot call it, a PC bridge would be
   needed) and it is one more app to keep running.
2. **Hooks (chosen)**: live push, documented, already working, covers "a session launches sub-agents and waits".
3. Own reader of the session files: most complete (sessions without the plugin, idle/blocked), most work, fragile format.
   Possible later as an additional source: the gadget protocol must not depend on the source.

Layout (decided: D). Mockups: `.superpowers/brainstorm/29093-1794155025/content/layout-hybrids.html` (D and E) and
`layout-options-v2.html` (A, B, C).
- A desks grid (hierarchy only by color), B one band per session, C focus + summary list, E bands + command strip.
- **D, chosen: session tabs in the title bar + tree of the selected session + command strip at the bottom.**

Touch (open, to settle by a spike): (a) touch-zone components in the screen project (fixed positions: tabs and agent
slots; reported as component events) or (b) raw coordinates if `sendxy` works (flexible geometry). Try (b) first.

Sprites: (i) runtime `fill` commands (flexible colors, too slow) or (ii) baked images (instant, fixed set, re-flash to change).
**Chosen: baked images**, with dynamic elements (tab colors, link lines, state markers, text) drawn at runtime.

## 5. The design

Screen (480x272), top to bottom:
1. **Title bar with session tabs.** One tab per session (project folder name). Each tab has a dot with the session's most
   urgent state and an agent count. The selected tab is highlighted. Right side: global summary ("1 asks you").
2. **Tree of the selected session** (about 166 px): the lead on the left, its sub-agents to the right, joined by link
   lines. Each agent: character, state marker, name, one-line task. With up to 12 sub-agents they wrap on **two rows of
   six** at a smaller size. The selected agent has a dashed yellow frame.
3. **Command strip** (about 80 px) for the selected agent: name, state, elapsed time, **current command** (tool and
   summary), a detail line (file path or command text), and the **previous command with its age**.

States and colors: **needs you** (orange: blocked until the user answers, i.e. a permission or a question), **your turn**
(grey-blue: the turn is finished and the session waits for the next message, calm, no alert), working (green),
waiting on sub-agents (blue hourglass, leads only), done (grey), error (red).
Urgency order for tab dots and sorting: needs you > error > your turn > working > waiting on sub-agents > done.

Interaction: tap a tab to show that session; tap an agent to show its command. 

Decided by the user:
- Hooks as the source; layout D; tap an agent to see its command; hierarchy shown with links; 12 sub-agents on two rows.
- **Two attention levels** (decided after the review): orange "needs you" only when an agent is blocked on the user;
  a finished turn is the calm grey-blue "your turn". A session in "your turn" never raises an alert.
- **Default selected session**: first a session that is blocked on the user (orange); otherwise the session that most
  recently reached "your turn"; otherwise the most recently active one.

My calls (to check while reading):
1. Default selected agent in a session: the agent that needs the user, else the most recently active. It follows
   automatically until the user taps an agent; a manual choice holds for 30 s, then automatic mode resumes (same for tabs).
2. Characters are drawn **by agent role** (lead, and a few looks mapped from `agent_type`, with a generic one), not by
   session; the session is identified by tab and link-line color. Budget: about 8 looks, one pose each.
3. Finished or failed agents stay greyed for 2 min, then disappear (as today). When a lead ends, its sub-agents go with it
   after 2 min. Silence for 10 min removes a session.
4. Overflow: more than 12 sub-agents in a session shows the 12 most relevant (needing the user first) plus "+N"; more
   than 5 sessions shows the 5 most urgent plus "+N".
5. Nested sub-agents (a sub-agent launching others) are shown as direct children of the session lead in v1.
6. "Lead waits on sub-agents": derived in the gadget when the lead has at least one sub-agent not done and its last event
   was the Agent/Task tool call.
7. Privacy: the detail line shows tool name and file name or the first characters of a command; the plugin gets an option
   to mask details. Default: show (single-user LAN), with the risk written in the plugin README.
8. Protocol: richer event `{session, agent, parent, role, state, tool, detail}` plus the old `{agent, state, task}`
   accepted for compatibility; the gadget builds the tree and keeps the previous command per agent.

### Calls added after the independent review (mine, to check)

9. **Hook payloads first.** The plan starts with a spike that dumps real payloads of every hook. Until proven otherwise:
   the **lead is the event without `agent_id`**; a sub-agent is identified by `agent_id` (+ `agent_type` as its role);
   its parent is the session's lead (nested parents are not assumed known).
10. **Proposed hook -> state mapping** (to be confirmed against the spike, then documented in the plugin README):
    - `SessionStart`: session appears, lead in "your turn".
    - `UserPromptSubmit`: lead working.
    - `PreToolUse`: working, for the agent it carries (`agent_id`, else the lead); its summary becomes the current command and
      the previous command is kept.
    - `SubagentStart`: sub-agent appears, working; the lead shows "waiting on sub-agents" while any child is not done and
      its last event was the Agent/Task tool call. `SubagentStop`: sub-agent done; when no child is left working the lead
      goes back to working.
    - **`PermissionRequest`** (fires immediately when a permission dialog is shown) and `Notification` with
      `notification_type` `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` or `agent_needs_input` ->
      "needs you" on the agent that carries it (else on the lead). `Notification` `idle_prompt` -> "your turn".
      (Confirmed against real payloads in `docs/hook-payloads.md`; `Notification` alone arrives about 6 s late.)
    - "Needs you" clears on the same agent's `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `UserPromptSubmit`
      or `Stop`. There is no "approved" hook, so a long command run after an approval keeps the agent orange until it ends.
    - `Stop`: lead in "your turn" **unless it still has sub-agents not done**: then it stays "waiting on sub-agents"
      (`Stop` fires while background sub-agents run). A `UserPromptSubmit` starting with `<task-notification>` is a
      sub-agent report, not a user prompt: lead working. The `SubagentHandback` pseudo-tool is never shown as a command.
    - `SessionEnd`: session done, removed after 2 min.
11. **Fixed layout is acceptable.** At most 5 tabs (+N), one lead slot and 12 sub-agent slots (2 rows of 6) at fixed
    positions. So the plan is: spike touch first, then **one** flash holding the sprites and, if needed, the touch zones.
12. **Art.** v1 ships placeholder characters generated in the style of the mockups (colored body, one look per role,
    unknown `agent_type` -> generic), imported into the editor's picture tab by the user following annotated screenshots.
    Final art can replace them later with another flash. The first flash is not blocked by final art.
13. **Redraw budget.** Targets: the "needs you" indicator (tab dot and title bar) on screen within 1 s of the event;
    drawing order is title bar, then command strip, then tree; switching tab or agent within 3 s. The builder should first
    try to raise the screen's UART speed (e.g. `baud=115200` set by the screen project at boot; `bauds=115200` sent from
    outside was accepted but not applied) because a 12x faster link removes most of this problem.
14. **Plugin robustness.** Fire and forget with a timeout of about 1.5 s; events are dropped if the gadget is unreachable.
    Every event carries the full state of its agent, so the next event repairs a gadget that rebooted. No resync needed.
15. **Old API.** `{agent, state, task}` is treated as a one-agent session named after `agent` (a lead without children).
    `mock_agents.py` and the v0.1 plugin keep working unchanged.

## 6. What is left to the builder

- **First step: dump real hook payloads** (spike) and confirm calls 9 and 10 before building the tree model.
- Draw the pixel-art characters and state markers, and add them (and touch zones if needed) to the `blank.HMI` project;
  re-flash the .tft (see `CLAUDE.md`).
- Spike touch (`sendxy`), then pick (a) or (b); exact geometry, fonts and redraw scheduling (draw only what changed,
  stay within the 9600-baud budget).
- Gadget: tree model with parent links, capacity for about 5 sessions x 13 agents, tabs, selection logic, command strip;
  keep the screen layer separated from the core as in `ARCHITECTURE.md`.
- Plugin v0.2: send the richer event, derive nothing it cannot know, keep it silent and fast; update its README.
- A mock scenario script (5 sessions, 12 sub-agents, needs-you in a background tab) to test without real sessions.
- Wi-Fi/OTA/config already exist and stay as they are.

Success: with the mock scenario and with real sessions, the user can tell in a glance which session needs them, sees a
lead's sub-agents with their states, and can read any agent's current command with one tap, without visible flicker.
