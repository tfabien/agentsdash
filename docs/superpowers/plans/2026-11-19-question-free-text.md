# AskUserQuestion free text and phone answers (issue #75)

Decisions (user, 2026-11-19): scope = free text + phone; setting `question_free_text`, off by default; answer key = the typed text as is.
Out of scope: voice recognition, new prompt injection into a session, device (ESP32), Codex.

1. Hub store (`hub/questions.mjs`): a pick may be a string (1..500 chars) when free text is on; `view` carries `free_text`.
2. Hub (`hub/hub.mjs`): setting `question_free_text` (default false); `/question/answer` passes it to the store; `lan.mjs` lets a paired phone call `POST /question/answer` only.
3. Page (`screen.js`, `hub_page.js`, `confirm_dialog.js`): OTHER button in the question header when `quest.free_text`; tap opens a text dialog; the text answers that question. The phone page answers questions too (not permissions).
4. Settings menu toggle, `docs/protocol.md`, README, CLAUDE.md read-only rule.
5. Plugin (`ask.mjs`): a string pick becomes `answers[question] = text`; plugin 0.7.0, core 0.9.0.
6. Light tests: store, route, lan, questTap, answersFor.
Open: real session check that Claude Code accepts free text in `answers` (not verified here).
