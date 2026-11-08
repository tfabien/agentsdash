# Idea: sprite themes (not specified, not in the execution plan)

Raised by the user on 2026-11-08. To brainstorm and specify before any plan: which themes, how they look, how one is picked.

First notes (draft, not validated):



**Files:** modify `agent-gadget/tools/make_sprites.py` (`--theme <name>`), `agent-gadget/tests/test_sprites.py`; generated `agent-gadget/assets/sprites/<theme>/*.png` and one contact sheet per theme.

**Interfaces:** every theme keeps the picture contract of Task 7 (ids 0..15, same role order, 36x42 and 24x28, black background), so a theme swap is only a re-export of the .tft and a flash (Task 11), with no firmware change. Themes: `people` (current full characters, default), `heads` (big faces, role shown by hair, hat or glasses), `cats` (one cat per role: fur color, ears, accessory), `bricks` (blocky toy figures: cylinder head, square body; generic style, no brand name or logo).

- **Step 1:** Tests: the Task 7 tests run for every theme (sizes, black corners, eight distinct looks, big = small at scale 3/2); themes differ from each other. Run: FAIL.
- **Step 2:** One pixel grid set per theme in `make_sprites.py`. Run: PASS; send the contact sheets to the user to pick a theme.
- **Step 3:** Commit. Optional: a theme picker on `/config` that only records the choice (the .tft still holds one theme at a time: 16 pictures).
