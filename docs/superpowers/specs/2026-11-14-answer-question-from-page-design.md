# Answer an AskUserQuestion from the hub page (agentsdash#75)

Decided without the user (unattended run, 2026-11-14). Every default below can change after a real session check.

## Channel

A `PreToolUse` hook on `AskUserQuestion` (`plugin/scripts/ask.mjs` in `agentsdash-claude`) returns
`permissionDecision: "allow"` with `updatedInput: { ...tool_input, answers }`. The hooks reference documents this
(`code.claude.com/docs/en/hooks`, "Tools that require user interaction"): `answers` maps each question text to the picked label,
multi-select labels joined with ", ". A `claude -p` spike could not run it: `-p` offers `AskUserQuestion` only with a permission host.
The check in an interactive terminal session and in the desktop app is still open.

## Flow

1. `notify.mjs` is unchanged: it still sends the first question and its options as `question` / `options` of the event.
2. `ask.mjs` posts `POST /question` with every question (text, header, option labels, multi) and waits.
3. The hub holds the response (`hub/questions.mjs`) and publishes `quest` on the session in the state.
4. The page draws one question at a time on the lead tile: option buttons, SEND for a multi choice, TERMINAL.
5. The page posts `POST /question/answer` with `picks` (option indexes per question) or `terminal: true`.
6. The hub answers the held request with `{picks}` or `{none: true}`. The hook maps the indexes back to its own labels and question texts.

The hub keeps indexes only, so a label or question text the hub cuts or cleans never changes an `answers` key.

## Defaults

- Wait: `question_wait_s` in `~/.agentsdash/config.json`, default 60 s, 0 turns it off, at most 300. The hook timeout in `hooks.json` is 310 s.
- The terminal shows nothing while the hook waits (`PreToolUse` runs before the dialog). TERMINAL on the tile ends the wait at once.
- One pending question per session and agent: a newer one replaces the older one.
- Cleared by `UserPromptSubmit`, `Stop`, `StopFailure`, `SessionEnd` of the same session and agent, `/dismiss`, `/reset`, the hook's
  connection closing. A `PostToolUse` does not clear it: a tool running in parallel in the same turn would.
- Subagent calls (`agent_id` set) are skipped: the terminal asks.
- Any failure (hub down, older core, 404, garbled answer, picks that do not fit) prints nothing, so the terminal asks.

## Out of scope

- Free text and "Other": a canvas tile has no text field. The terminal still offers them after TERMINAL.
- Phone page (a LAN client is read-only), device touch screen, Codex adapter.

## Versions

Core 0.7.0, protocol 2 (new routes only). The plugin needs core 0.7.0 for the routes; an older core answers 404 and the terminal asks.
