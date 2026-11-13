# Theme looks: per-agent sprites and accents (design)

Date: 2026-11-13. Status: awaiting approval. Builds on `2026-11-13-theme-variants-design.md` (merged).

## Intent

Theme variants change the palette of the whole page, one at a time. Numbered sprite files (`lead-2.png`) already vary the drawing of an agent by a hash of its id, with no way to pick which ones. The user wants one idea for both: a theme offers several looks (a sprite set, an accent or a hue rotation), the user ticks the active ones, and each agent takes one of the active looks by hash.

## Goals

- A theme declares `looks`. The user ticks which are active. Each agent draws with one active look, stable for that agent.
- A look can pick a sprite number, an accent, or both.
- The theme author can set the looks active by default.
- A theme without `looks` behaves exactly as today.

## Non-goals

- No per-agent palette. Colors of the page (screen, frames, text) stay global and come from the palette variant.
- No new file layout for sprites: a look refers to the existing numbered files.
- No per-role looks (a look applies to every role).

## Anti-goals

- A tint-mode pack with a look accent must not recolor icons whose pack mode is `none`.
- Changing the active looks must not change the look of an agent that is still present, unless that look was unticked.

## Design

### Theme file

```json
{ "looks": {
    "classic": { "label": "Classic" },
    "ember":   { "label": "Ember", "accent": "#f2a33a" },
    "night":   { "label": "Night", "sprite": 2, "accent": "#6e7bf2" } },
  "defaultLooks": ["classic", "ember"] }
```

- `looks`: up to 12 entries (`a-z0-9-` keys), each with `label`, optional `accent` (`#rrggbb`), optional `sprite` (integer 1 to 99). `sprite` 1 is the unnumbered file (`lead.png`), `n` is `lead-n.png`. A role without that number falls back to its unnumbered file.
- `defaultLooks`: optional list of look keys active until the user chooses. Absent or empty: every look is active. Unknown keys are dropped.
- Invalid entries are dropped and named in `ignored`, like variants.

### Choice and storage

- Hub setting `themeLooks`: `{ "<theme>": ["lookKey", ...] }`. An absent key means the author default. A list of keys that no longer exist falls back to the default. Validation like `themeOverrides` (at most 64 keys, keys `a-z0-9-`, whole value refused when invalid).
- `POST /themes` (Save as theme) writes `looks` and `defaultLooks` (the active ones) into the saved theme.
- Deleting a theme removes its `themeLooks` entry.

### Picking a look per agent

- `lookFor(theme, active, agentId)`: the same FNV hash as `variantKey`, modulo the number of active looks (sorted by declaration order). An agent without id uses the first active look.
- The look gives the sprite number and the accent for that agent. `svgPack.draw` receives them: the sprite number replaces the hash choice of `variantKey`, the accent replaces the global accent for that draw (modes `svg` and `hue` as before, `none` ignores it).
- The global accent (theme or variant) is the accent of looks that declare none.

### Theme view

- The card of a theme with looks shows a checkbox per look under the palette swatches ("Looks"), one chip each with its label. Ticking posts `themeLooks`.
- The card preview draws the eight agents spread over the active looks.
- The color editor is unchanged.

## Approaches considered

- **Palette stays exclusive, looks are multiple (chosen by the user).** Matches what can vary per agent. Costs one new setting and a draw signature change.
- Everything as checkboxes: palette from the first ticked one. Simpler to explain, but the palette then depends on the order.
- Keep both systems apart. No work, but the sprite numbers stay unselectable.

## Left to the builder

- Exact signature change of `pack.draw` and `svgPack.draw` to carry sprite number and accent.
- Look of the checkboxes and the preview spreading.
- Whether the lead of a session keeps picking by session id as today (expected: yes).
- Docs, skill and migration prompt updates.
