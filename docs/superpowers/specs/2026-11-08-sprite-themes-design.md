# Sprite themes: design

Date: 2026-11-08. Status: approved looks (mockup), written up for planning.
Replaces the idea note `docs/superpowers/ideas/sprite-themes.md`.

## Intent

The gadget shows each Claude Code agent as a small character. The user wants to tell each agent's role at a glance
(coordinator, planner, reviewer, tester, senior dev, junior dev) and to pick the look from several themes.
Today the screen uses one placeholder set: full-body figures on a 12x14 grid upscaled x3 and x2 (`make_sprites.py`).

## Goals

- A role reads in under a second at the small size (24x28), from one object or garment per role plus one body color per role.
- Three themes: **office**, **royalty**, **cats** (office cats). Each is a complete set of 16 pictures.
- Sprites drawn at native resolution (36x42 and 24x28 real pixels), with smoothed edges. No upscaled pixel grid.
- Head-and-shoulders busts. The head takes most of the picture.

## Non-goals

- Switching theme at runtime. A theme is changed by flashing its `.tft` (decision below).
- Per-state sprite variants or animation. State stays shown by text color, as today.
- More than 8 roles, or new picture slots.

## Anti-goals (rejected during the mockups)

- Full-body figures: the head gets too few pixels.
- Crowns outside the royalty theme.
- A toy-brick theme and an RPG theme (the RPG one duplicated royalty).
- Cats that do not read as cats: they need triangular ears, slit pupils, a light muzzle and whiskers.
- Blocky upscaled grids.

## Roles and picture ids

New role list and order. Picture id = index for the 36x42 sprite, index + 8 for the 24x28 sprite.

| Id | Role | Color (RGB) | Office | Royalty | Cats |
|---|---|---|---|---|---|
| 0 | lead (coordinator) | 200,160,40 | dark suit, gold tie, headset with mic | king: crown, ermine collar | office lead on an orange cat |
| 1 | plan (planner) | 150,90,210 | calendar held in front | chancellor: black velvet cap, parchment with seal | office planner on a cat |
| 2 | review (reviewer) | 220,100,170 | glasses, clipboard | judge: white curled wig | office reviewer on a dark grey cat |
| 3 | test (tester) | 170,110,60 | white lab coat, goggles on forehead | guard: closed steel helm, plume | office tester on a white cat |
| 4 | senior (senior dev) | 60,140,230 | grey hair, grey beard, hoodie, mug | master craftsman: long white beard | grey cat, white chin tuft, hoodie, mug |
| 5 | junior (junior dev) | 90,200,235 | backwards cap, hoodie, lanyard badge | page: beret with white feather | kitten (smaller head, big eyes, no whiskers), badge |
| 6 | explore (explorer) | 30,170,160 | binoculars | scout: hood, lantern | office explorer on a cat |
| 7 | generic | 140,140,150 | plain shirt collar | jester: two-pointed hat with bells | plain collar on a cat |

The exact shapes, positions and colors are in the approved mockup:
`docs/superpowers/specs/2026-11-08-sprite-themes-mockup.html` (open it in a browser). Its coordinates use the 36x42
space; the 24x28 sprite is the same drawing scaled by 2/3. It is the visual reference, not production code.

## Role mapping (`agent_type` -> role)

Agreed with the user: keyword match on the agent type, case-insensitive.

| `agent_type` contains | Role |
|---|---|
| (main session, role `lead`) | lead |
| `plan` | plan |
| `review` | review |
| `test` | test |
| `junior` | junior |
| `senior`, `code`, `dev`, or starts with `general` | senior |
| `explor` | explore |
| anything else | generic |

Order of the checks (builder's call, documented here): lead, plan, review, test, explore, junior, senior keywords, generic.
So `junior-dev` is junior, `code-reviewer` is review, `general-purpose` is senior.
A junior only appears when an agent's name contains "junior", for example `.claude/agents/junior-dev.md`.
The plugin cuts `agent_type` to 12 characters (`notify.py`): the keyword must be in the first 12.
The mapping lives in `pictureFor()` in `agent-gadget/esp32_agent_gadget/display_hmi.cpp`.

## Approaches considered

| Approach | Theme change | Cost | Verdict |
|---|---|---|---|
| A. All themes in one `.tft` (48 pictures), picked on `/config` | instant, no cable | firmware adds a picture id offset; setting stored in flash | not chosen |
| **B. One `.tft` per theme, 16 pictures each** | reflash the screen through `hmi_bridge` (USB, about 49 s) | no firmware change for the theme itself | **chosen by the user** |
| C. Draw sprites at runtime with `fill` | instant | too slow (ruled out in the UI spec) | rejected |

## Decided parts of the how

- One `.tft` per theme. The firmware does not know which theme is flashed. All themes keep the same 16 picture ids.
- Flashing a theme in this work: USB through `hmi_bridge` (decided by the user). The Wi-Fi `.tft` upload being built
  separately (`tft_upload.cpp`, `POST /tft`) is meant for themes the user adds later. It is out of scope here; this work
  does not depend on it. The 16-picture contract is what lets such a user theme work with no firmware change.
- The 16-picture contract of the UI plan stays: ids 0..7 at 36x42, ids 8..15 at 24x28, same role order, black background,
  black corner pixels.
- The firmware change is only the new role order and mapping in `pictureFor()`.

## Builder's calls (decided while writing, can be changed)

- Generator: `agent-gadget/tools/make_sprites.py --theme office|royalty|cats`, using Pillow (12.3 is installed here).
  Draw each sprite at 8x supersampling, then downscale to 36x42 and 24x28 with a smooth filter. The 24x28 sprite is drawn
  from the same shapes, not downscaled from the 36x42 PNG.
- Output: `agent-gadget/assets/sprites/<theme>/NN_<role>_<big|small>.png` and one contact sheet per theme.
  The current flat `assets/sprites/*.png` set is removed.
- Screen projects: `agent-gadget-office.HMI/.tft`, `agent-gadget-royalty.HMI/.tft`, `agent-gadget-cats.HMI/.tft`, each made
  from `agent-gadget.HMI` by replacing its 16 pictures in the same order. Office becomes the default
  (`agent-gadget.HMI/.tft` keeps the office set or is replaced by `agent-gadget-office.*`).
  The editor steps (Chinese UI, picture replace, 文件 -> 输出生产文件) are done by the user; the plan gives the click path.
- Tests: `agent-gadget/tests/test_sprites.py` checks, for each theme: 16 files, sizes, black corners, 8 distinct looks,
  big and small of the same role are close in average color. The old "small = big at scale 2/3 on the grid" test is dropped.
- `scenario.py` gets a `junior-dev` agent and a `senior-dev` agent so all 8 looks appear in a demo run.

## Left to the builder

- Fine-tuning shapes at 24x28 when a detail vanishes (planner's calendar, reviewer's clipboard, mug).
- Contact sheet layout.
- Whether the colors are quantized to RGB565 before writing the PNG (the screen stores 16-bit color).

## Done when

- The three contact sheets match the mockup closely enough that the user approves them.
- Each theme's `.tft` is flashed once and the user checks the roles on the real screen at 24x28.
- `pictureFor()` follows the mapping table; firmware and Python tests pass.
