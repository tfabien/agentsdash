# Handoff - agent gadget UI (paused 2026-11-08)

Resume with: *"continue the plan `docs/superpowers/plans/2026-11-08-agent-gadget-ui.md`"* (skill
`superpowers:executing-plans`). The ledger is the memory: `.superpowers/sdd/2026-11-08-agent-gadget-ui/progress.md`
(git-ignored; `Task N: complete` lines, plus every `Ruling:`). Branch `agent-gadget-ui`, run BASE `726ac50`.

## Done (tasks 0-4, committed, tests green)

- T0 test harness (`agent-gadget/tests/gadget_client.py`), T1 hook payload spike (`docs/hook-payloads.md`, spec call 10 corrected),
  T2 plugin v0.2 (v2 events, needs-you markers), T3 core model (sessions, sub-agents, derived states, selection,
  `/select`, `/debug/config`), T4 HTTP robustness (escapes, 400/404, plugin now sends v2 by default).
- Test suites (all OK): `python -m unittest discover -s agent-gadget/tests` (23, needs the gadget flashed with `esp32dev_test`)
  and `python -m unittest discover -s claude-plugin/agent-gadget/tests` (21, no hardware).

## In progress

- T6 (layout geometry): `agent-gadget/tests/test_layout.py` is written and **RED** (404 on `/debug/layout` and `/debug/hit`);
  nothing implemented yet. Next: create `layout.h/.cpp` (Rect, `layoutTab/TabsMore/Lead/Subs/Strip`, `hitTest`), add the two
  `GADGET_DEBUG` endpoints in `net.cpp`, flash `esp32dev_test` by USB, run the tests. Geometry used in the tests: title bar 20 px,
  tabs 74 px wide at x = 4 + 78*i (max 5, "+N" marker after the last), tree area y 22..188, lead rect left, 1-4 sub-agents big
  (70 px pitch), 5-6 small in one row (46 px pitch), 7-12 small on two rows of six, strip y 190..272.

## Not started (order decided in the ledger)

T5 touch spike and T7 sprites **need the user** (taps on the screen; importing 16 pictures in the USART HMI editor, then flashing the
.tft through `hmi_bridge`). Also ask the user to capture one real permission prompt with `CLAUDE_GADGET_DUMP=<file> claude`
(Notification / PermissionRequest field names are from the docs, not captured). Then T8 UI + touch (create `scenario.py` first),
T9 draw queue + latency budget (also try 115200 baud via the screen project), T10 scenario, install, docs, acceptance,
then the final whole-branch review (`executing-plans`, "Final Review").

## State of the real device (important)

- The gadget runs the **normal build** (`esp32dev`, flat list on the screen, **no `/debug` endpoints**). Before running the API tests,
  flash the test build by USB: `pio run -e esp32dev_test -t upload` (from `agent-gadget/esp32_agent_gadget`, no screen drawing,
  isolation mode). Afterwards flash `esp32dev` again to get the screen back. OTA of test builds is unreliable while live sessions post.
- The user-level plugin is read **live from this working tree** and sends v2 events: do not leave `notify.py` broken on the branch.
  A gadget still on the old firmware needs `CLAUDE_GADGET_PROTOCOL=1`.
- Known limits recorded as rulings: blocking 9600-baud redraws starve HTTP/OTA (fixed in T9), "needs you" stays on after a long approved
  command (no "approved" hook), `more`/`more_sessions` counters are approximations.
