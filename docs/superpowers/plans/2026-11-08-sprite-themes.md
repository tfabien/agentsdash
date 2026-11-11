# Sprite Themes Implementation Plan
> **Status: not started (checked 2026-11-11).** No `assets/sprites/` yet; the screen redesign changed the picture ids, so re-check the plan before starting.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three sprite themes (office, royalty, cats) of head-and-shoulders busts drawn at native 36x42 and 24x28, one `.tft` per theme, and a new role order with the agreed `agent_type` mapping in the firmware.

**Architecture:** `make_sprites.py` draws each theme with Pillow at 8x supersampling and writes 16 PNGs per theme. Each theme becomes a copy of the screen project with its 16 pictures replaced in the same id order, flashed through `hmi_bridge`. The firmware never knows the theme: only the role -> picture id mapping changes, moved into a small core module so it can be tested through a debug endpoint.

**Tech Stack:** Python 3 + Pillow 12.3 (generator only; tests stay stdlib with `tests/png_reader.py`), PlatformIO + Arduino-ESP32 (C++), TJC USART HMI 1.68.2 editor (manual, Chinese UI), `hmi_bridge`.

**Spec:** `docs/superpowers/specs/2026-11-08-sprite-themes-design.md`. Visual reference: `docs/superpowers/specs/2026-11-08-sprite-themes-mockup.html` (open in a browser; all shapes, positions and colors, in 36x42 coordinates).

## Global Constraints

- Picture ids: `0..7` at 36x42, `8..15` at 24x28, role order `lead, plan, review, test, senior, junior, explore, generic`.
- Black background, black corner pixels, no transparency (the editor's pictures have none).
- Role colors (RGB): lead 200,160,40; plan 150,90,210; review 220,100,170; test 170,110,60; senior 60,140,230; junior 90,200,235; explore 30,170,160; generic 140,140,150.
- Busts only. Crowns only in the royalty theme.
- Theme names in files and flags: `office`, `royalty`, `cats`. Office is the default and stays in `agent-gadget.HMI/.tft`; the others are `agent-gadget-royalty.*` and `agent-gadget-cats.*` in the repo root.
- Themes are flashed by USB through `hmi_bridge` only. The Wi-Fi `.tft` upload (`tft_upload.cpp`, `POST /tft`) is out of scope.
- Code comments, docs and on-screen text in English.

## Review Focus

1. Empty or missing `agent_type` (the plugin sends `agent`): generic look. Pinned in Task 4 (`test_unknown_and_empty_roles_are_generic`).
2. Claude Code's mixed-case built-ins (`Explore`, `Plan`, `general-purpose`): explore, plan, senior. Pinned in Task 4.
3. Names holding two keywords (`code-reviewer`, `test-runner`, `junior-reviewer`, `senior-tester`): the function keyword wins over seniority. Pinned in Task 4.
4. A keyword after the 12th character (`documentation-junior` arrives as `documentatio`): generic, as the spec documents. Pinned in Task 4.
5. A 24x28 sprite whose role object vanishes (calendar, clipboard, mug) or a corner pixel tinted by edge smoothing: caught by the corner test (Task 1) and by the user's contact-sheet check in Tasks 1 to 3.

## File Structure

- `agent-gadget/tools/make_sprites.py` (rewrite): drawing primitives, the three themes, PNG and contact sheet output.
- `agent-gadget/tests/test_sprites.py` (rewrite): per-theme checks, stdlib only.
- `agent-gadget/assets/sprites/<theme>/NN_<role>_<big|small>.png` and `agent-gadget/assets/sprites/<theme>_contact_sheet.png` (generated); the flat `assets/sprites/*.png` and `assets/sprites_contact_sheet.png` are deleted.
- `agent-gadget/esp32_agent_gadget/roles.h/.cpp` (create): `rolePicture()`. `display_hmi.cpp` (modify: `pictureFor()` calls it). `net.cpp` (modify: `GET /debug/role`).
- `agent-gadget/tests/test_roles.py` (create). `agent-gadget/scenario.py` (modify role list).
- `agent-gadget-royalty.HMI/.tft`, `agent-gadget-cats.HMI/.tft` (create in the editor); `agent-gadget.HMI/.tft` (office pictures).
- `CLAUDE.md`, `agent-gadget/ARCHITECTURE.md` (docs).

### Task 1: Generator and the office theme

**Files:** Rewrite `agent-gadget/tools/make_sprites.py`, `agent-gadget/tests/test_sprites.py`; generate `agent-gadget/assets/sprites/office/`; delete the flat sprite PNGs and the old contact sheet.

**Interfaces:**
- Produces in `make_sprites.py`: `ROLES = ["lead","plan","review","test","senior","junior","explore","generic"]`, `THEMES = ["office","royalty","cats"]`, `COLORS: dict[str, tuple]` (Global Constraints), `draw(theme: str, role: str, w: int, h: int) -> PIL.Image.Image` (RGB, w x h), `write_theme(theme: str, out_dir: str) -> list[str]` (16 paths), CLI `python agent-gadget/tools/make_sprites.py --theme office|royalty|cats|all`.
- A theme is a dict `role -> callable(canvas, color)` registered in `THEME_DRAW[theme]`; Tasks 2 and 3 only add entries.
- Produces in `test_sprites.py`: `THEMES_DONE = ["office"]` (Tasks 2 and 3 append), `expected_files(theme) -> dict[int, (path, w, h)]`.

- [ ] **Step 1: Write the failing tests** in `test_sprites.py`, looping over `THEMES_DONE`:
  - `test_files_and_sizes`: 16 files `f"{i:02d}_{role}_big.png"` (36x42) for ids 0..7 and `f"{i+8:02d}_{role}_small.png"` (24x28) under `assets/sprites/<theme>/`.
  - `test_black_corners`: the 4 corner pixels of every file equal `(0, 0, 0)`.
  - `test_eight_distinct_looks`: the 8 big images of a theme are pairwise different.
  - `test_big_and_small_same_look`: mean RGB of non-black pixels, big vs small of the same role, differs by at most 24 per channel.
- [ ] **Step 2: Run** `python -m unittest agent-gadget.tests.test_sprites -v`. Expected: FAIL (no `office/` folder).
- [ ] **Step 3: Implement the generator.** Draw on an RGBA canvas of `w*8 x h*8` scaled from the 36x42 space (factor `8*w/36`), with helpers matching the mockup's `E`, `Rc`, `Po`, `Ln`, a quadratic curve sampled as a 16-point polyline, and translucent fills through `Image.alpha_composite`. Composite on black, then `resize((w, h), Image.BOX)` (BOX averages coverage and does not ring into the corners). Port the office looks and the shared human base from the mockup. Delete `assets/sprites/*.png` and `assets/sprites_contact_sheet.png`. Contact sheet: big row at x2 nearest-neighbor, then the real sizes, black background.
- [ ] **Step 4: Run** `python agent-gadget/tools/make_sprites.py --theme office`, then the tests. Expected: PASS.
- [ ] **Step 5: User check.** Send `assets/sprites/office_contact_sheet.png` next to the mockup; adjust shapes the user rejects (small-size details are the builder's call).
- [ ] **Step 6: Commit**

```bash
git add agent-gadget/tools/make_sprites.py agent-gadget/tests/test_sprites.py agent-gadget/assets
git commit -m "feat(sprites): native-resolution generator, office theme"
```

### Task 2: Royalty theme

**Files:** Modify `make_sprites.py` (royalty entries), `test_sprites.py` (`THEMES_DONE` += `"royalty"`); generate `assets/sprites/royalty/`.

**Interfaces:** Consumes Task 1 (`THEME_DRAW`, human base, helpers). Hood with a face hole: draw the outer ellipse on a mask, cut the inner one, paste the hood color through the mask.

- [ ] **Step 1:** Add `"royalty"` to `THEMES_DONE` and add `test_themes_differ`: for each picture id, office and royalty files differ. Run: FAIL.
- [ ] **Step 2:** Port the royalty looks from the mockup (king, chancellor, judge, guard, craftsman, page, scout, jester). Run `--theme royalty` and the tests: PASS.
- [ ] **Step 3:** User check of `royalty_contact_sheet.png`; adjust.
- [ ] **Step 4:** Commit: `git commit -m "feat(sprites): royalty theme"` with the changed files.

### Task 3: Cats theme

**Files:** Modify `make_sprites.py` (cat base, cat entries reuse the office accessories with the cat eye positions), `test_sprites.py` (`THEMES_DONE` += `"cats"`); generate `assets/sprites/cats/`.

**Interfaces:** Consumes Task 1's office accessories with an anchor argument: human eyes at x 14.5 / 21.5, y 18; cat eyes at x 13.5 / 22.5, y 16.5. The kitten (junior) head is scaled 0.84 around (18, 24), eyes 1.3x, no whiskers. Fur: senior 180,180,185; junior 235,190,140; review 95,95,108; test 240,240,235; others 230,150,60.

- [ ] **Step 1:** Add `"cats"` to `THEMES_DONE`; `test_themes_differ` now covers three themes. Run: FAIL.
- [ ] **Step 2:** Port the cat base and looks from the mockup. Run `--theme all` and the tests: PASS.
- [ ] **Step 3:** User check of `cats_contact_sheet.png`; the anti-goal is "cats that do not read as cats" (triangular ears, slit pupils, light muzzle, whiskers).
- [ ] **Step 4:** Commit: `git commit -m "feat(sprites): cats theme"`.

### Task 4: Role mapping in the firmware

**Precondition:** the uncommitted Wi-Fi upload work also edits `display_hmi.cpp` and `net.cpp`. Before starting, ask the user whether that work is committed; do not commit or revert it. Touch only the `pictureFor()` block and one route.

**Files:** Create `agent-gadget/esp32_agent_gadget/roles.h`, `roles.cpp`, `agent-gadget/tests/test_roles.py`; modify `display_hmi.cpp` (`pictureFor()`), `net.cpp` (`/debug/role`, debug builds only), `agent-gadget/scenario.py`.

**Interfaces:**
- Produces `int rolePicture(const char* role)` in `roles.h`: returns the big picture id 0..7 (the small id is `+ PIC_SMALL_OFFSET`, unchanged). Case-insensitive. Checks in this order: exactly `lead` -> 0; contains `plan` -> 1; `review` -> 2; `test` -> 3; `explor` -> 6; `junior` -> 5; contains `senior`, `code` or `dev`, or starts with `general` -> 4; else 7.
- Produces `GET /debug/role?name=<role>` -> `{"name":"<role>","pic":N}` (only with `-DGADGET_DEBUG`).
- `pictureFor(role)` in `display_hmi.cpp` becomes `return rolePicture(role);`.

- [ ] **Step 1: Write the failing tests** in `test_roles.py` with `Gadget().debug(f"/debug/role?name={name}")["pic"]` (skip when the gadget is unreachable, as the other API tests):
  - `test_agreed_mapping`: `lead`->0, `Plan`->1, `code-reviewer`->2, `test-runner`->3, `general-purpose`->4, `senior-dev`->4, `coder`->4, `junior-dev`->5, `Explore`->6.
  - `test_function_keyword_beats_seniority`: `junior-reviewer`->2, `senior-tester`->3.
  - `test_unknown_and_empty_roles_are_generic`: `agent`->7, `statusline-se`->7, empty name ->7.
  - `test_keyword_after_12_chars_is_lost`: `documentatio` (the plugin's cut of `documentation-junior`) ->7.
- [ ] **Step 2: Run** `python -m unittest agent-gadget.tests.test_roles -v` against the current `esp32dev_test` build. Expected: FAIL (404 on `/debug/role`).
- [ ] **Step 3: Implement** `roles.h/.cpp`, the route, and the `pictureFor()` change. In `scenario.py`, set `ROLES = ["general-purpose", "Explore", "Plan", "code-reviewer", "test-runner", "junior-dev"]` (same length, so `test_scenario` counts do not move).
- [ ] **Step 4: Build and flash** from `agent-gadget/esp32_agent_gadget/`: `pio run -e esp32dev_noscreen` (compiles), then `pio run -e esp32dev_test -t upload`. Run `test_roles`, `test_state`, `test_scenario`. Expected: PASS.
- [ ] **Step 5: Commit** only this task's files:

```bash
git add agent-gadget/esp32_agent_gadget/roles.h agent-gadget/esp32_agent_gadget/roles.cpp agent-gadget/tests/test_roles.py agent-gadget/scenario.py
git add -p agent-gadget/esp32_agent_gadget/display_hmi.cpp agent-gadget/esp32_agent_gadget/net.cpp
git commit -m "feat(roles): new role order (senior/junior), agent_type mapping in roles.cpp, /debug/role"
```

`git add -p` keeps the Wi-Fi upload hunks out of this commit when they are still uncommitted.

### Task 5: One screen project per theme, flash and check

**Files:** Modify `agent-gadget.HMI/.tft` (office pictures); create `agent-gadget-royalty.HMI/.tft`, `agent-gadget-cats.HMI/.tft`; modify `CLAUDE.md`, `agent-gadget/ARCHITECTURE.md`.

**Interfaces:** Consumes the 48 PNGs of Tasks 1 to 3 and the role order of Task 4. The editor steps are done by the user; the agent gives the click path with screenshots from `guide/` and adds new annotated screenshots there when a step is missing.

- [ ] **Step 1: Office project.** The user opens `agent-gadget.HMI`, replaces pictures 0..15 in the picture panel with `assets/sprites/office/00..15_*.png` in id order, saves, exports with **文件 -> 输出生产文件**. Check: 16 pictures, sizes 36x42 and 24x28, ids unchanged.
- [ ] **Step 2: Royalty and cats projects.** Same steps from a copy saved as `agent-gadget-royalty.HMI` and `agent-gadget-cats.HMI`, with the matching folders.
- [ ] **Step 3: Flash and check each theme.** Follow the `hmi_bridge` procedure of `CLAUDE.md` (flash `hmi_bridge`, set the screen to 115200, 下载 on COM3). Run `python agent-gadget/hmi_pic_check.py` (escape for 9600 first); the user confirms the 16 pictures. Restore the gadget firmware (`pio run -t upload`), run `scenario.py`, and the user checks the roles in the tree at 24x28. Finish on the theme the user wants installed.
- [ ] **Step 4: Docs.** `CLAUDE.md`: repo layout (three `.HMI/.tft`, `assets/sprites/<theme>/`), the `pic` id line (new role order), how to switch theme (flash another `.tft`), the role mapping rule and the 12-character limit. `ARCHITECTURE.md`: `roles.cpp` in the core and `/debug/role` in the debug endpoints.
- [ ] **Step 5: Commit**

```bash
git add agent-gadget.HMI agent-gadget.tft agent-gadget-royalty.HMI agent-gadget-royalty.tft agent-gadget-cats.HMI agent-gadget-cats.tft guide CLAUDE.md agent-gadget/ARCHITECTURE.md
git commit -m "feat(screen): office, royalty and cats screen projects; docs for theme switching"
```
