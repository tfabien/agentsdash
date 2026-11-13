# Token rate glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each working session tile on the hub page gets a green, orange or red glow and a "42k/min" readout that follow the session's token burn rate.

**Architecture:** `hub/model.mjs` keeps a 5 minute sample list of `stok` per session and a hub-wide tokens-per-quota-percent calibration, and publishes `rate` per session and `usage.tok_per_pct` in `/state`. A pure module `hub/web/rate_glow.js` turns those and the settings into a level. `hub_page.js` applies it as CSS classes on the tile box. Thresholds are hub settings edited in the settings panel.

**Tech Stack:** Node >= 18 standard library, `node:test`, plain ES modules in the page.

**Spec:** `docs/superpowers/specs/2026-11-13-token-rate-glow-design.md`

## Global Constraints

- Hub imports nothing from an adapter; no adapter change (the rate comes from `stok`, already sent).
- Standard library only, Node >= 18. Tests run with `node --test hub/test/*.test.mjs`.
- The device screen (`web/screen.js`, firmware) does not change; nothing new reaches `forDevice`.
- Every new `/state` field and setting is written in `docs/protocol.md` (a test fails otherwise).
- Code comments, docs and on-screen text in English.
- Window: 5 minutes (300000 ms). Defaults: tokens mode orange 20 k/min, red 60 k/min; quota mode orange 0.5 %/min, red 1.5 %/min.
- Only `working` sessions glow.

## Review Focus

- A session first seen with `stok` already at 500000 must not count as 500000 burned or as a huge rate.
- `stok` going down (new conversation, compaction) restarts the samples, never a negative rate.
- Quota mode with no calibration yet falls back to tokens thresholds and the readout shows tokens/min.
- h5 quota window reset (`h5_pct` drops) restarts the calibration baseline.
- A session with one sample, or silent for over 5 minutes, shows no glow rather than a stale one.

---

### Task 1: Rate and calibration in the model

**Files:**
- Modify: `hub/model.mjs` (`newSession` line 49, `applyLeadUsage` line 151, `applyUsage` line 196, `toState` line 437)
- Test: `hub/test/model.test.mjs`

**Interfaces:**
- Produces, in `toState(now).sessions[i]`: `rate: { tok_min: number } | null` (`null` when under 2 samples or no growth data).
- Produces, in `toState(now).usage` (when quotas known): `tok_per_pct: number | null`.
- Constants: `RATE_WINDOW_MS = 300000`, `RATE_MIN_SPAN_MS = 60000`.

- [ ] **Step 1: Write failing tests** in `model.test.mjs` (use the file's existing helpers to send lead events with `stok`):
  - `rate is tokens per minute over the window`: events at t=0 (`stok` 1000), t=60000 (`stok` 21000) then `toState(60000)` gives `rate.tok_min === 20000`.
  - `first seen stok is a baseline, not burn`: one event with `stok` 500000, `toState` gives `rate === null`.
  - `stok going down restarts the samples`: 1000, 21000, then 500: `rate === null`.
  - `silent for the span: rate decays`: samples (0, 1000), (60000, 21000), `toState(300000)` still uses a span of `now - firstT` so `tok_min` is below 20000.
  - `samples older than 5 minutes are dropped`: after 10 minutes of a flat session, `rate.tok_min === 0`.
  - `calibration`: two sessions burn 30000 tokens in total while `/usage` goes `h5_pct` 10 to 12: `usage.tok_per_pct === 15000`. `h5_pct` dropping 12 to 1 resets it to `null`.
- [ ] **Step 2: Run** `node --test hub/test/model.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `model.mjs`: session field `samples: []` of `{t, stok}`; in `applyLeadUsage` push a sample when `stok` changes (first value only sets the baseline sample, `burned` unchanged; a lower value clears `samples` and starts one new sample; a higher value adds `delta` to the model-level `burned`); trim samples older than `RATE_WINDOW_MS`. Calibration baseline `{burned0, pct0}` set at the first `h5_pct` seen and re-set when `h5_pct` decreases; `tok_per_pct = (burned - burned0) / (pct - pct0)` when `pct - pct0 >= 1`, else `null`. `rate.tok_min = (lastStok - firstStok) / max(now - firstT, RATE_MIN_SPAN_MS) * 60000`, rounded, `null` with under 2 samples. `toState` must not bump `rev` for the rate (it is derived at read time; the 1 second tick already pushes the state).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add hub/model.mjs hub/test/model.test.mjs && git commit -m "Hub: token rate per session and quota calibration in the state"`

### Task 2: Settings and protocol doc

**Files:**
- Modify: `hub/hub.mjs` (`SETTING_RULES` line 35, `SETTING_DEFAULTS` line 50, 400 message line 345)
- Modify: `docs/protocol.md` (state fields line 90, `POST /settings` line 76)
- Test: `hub/test/hub.test.mjs` (near line 187)

**Interfaces:**
- Produces settings: `rate_mode: 'off' | 'tokens' | 'quota'` (default `'tokens'`), `rate_orange_k`, `rate_red_k` (integers 1 to 1000, k tokens/min, defaults 20 and 60), `rate_orange_pct`, `rate_red_pct` (numbers above 0 and up to 100, % of quota per minute, defaults 0.5 and 1.5).

- [ ] **Step 1: Write failing test** `rate settings validate and default`: defaults as above; `POST /settings {rate_mode:'quota'}` 200; `{rate_mode:'x'}` 400; `{rate_red_k: 0}` 400; `{rate_red_pct: 2.5}` 200 and read back as `2.5`.
- [ ] **Step 2: Run** `node --test hub/test/hub.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** rules and defaults in `hub.mjs`; extend the 400 message. In `docs/protocol.md` document the five settings, the session field `rate` (`{ tok_min }` or `null`) and `usage.tok_per_pct`.
- [ ] **Step 4: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS (this includes the protocol doc test).
- [ ] **Step 5: Commit** `git add hub/hub.mjs docs/protocol.md hub/test/hub.test.mjs && git commit -m "Hub: rate glow settings and protocol docs"`

### Task 3: Level calculation

**Files:**
- Create: `hub/web/rate_glow.js`
- Test: `hub/test/rate_glow.test.mjs`

**Interfaces:**
- Consumes: session `rate`, `usage.tok_per_pct` and the settings from Tasks 1 and 2.
- Produces: `export function rateLevel(session, usage, settings): { level: 0 | 1 | 2, label: string } | null`. `level` 0 green, 1 orange, 2 red. `label` like `42k/min` or `0.8%/min`. `null` means no glow and no readout.

- [ ] **Step 1: Write failing tests**:
  - `null` when `rate_mode` is `off`, when `session.dot !== 'working'`, or when `session.rate` is `null`.
  - tokens mode: 19999 gives level 0 and `20k/min`, 20000 gives 1, 60000 gives 2.
  - quota mode with `tok_per_pct` 15000: 15000 tok/min is 1 %/min, between 0.5 and 1.5, level 1, label `1.0%/min`.
  - quota mode with `tok_per_pct` `null`: falls back to the tokens thresholds and a tokens label.
- [ ] **Step 2: Run** `node --test hub/test/rate_glow.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `rateLevel` as above. Label: under 1000 shows the plain number plus `/min`, from 1000 shows `Nk/min` rounded.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add hub/web/rate_glow.js hub/test/rate_glow.test.mjs && git commit -m "Hub page: rate level from tokens or quota thresholds"`

### Task 4: Glow, readout and settings panel

**Files:**
- Modify: `hub/web/hub_page.js` (`draw()` line 170, tile creation line 76)
- Modify: `hub/web/hub.css`
- Modify: `hub/web/settings.js` (`OPTIONS` line 17; the stepper gets optional `step` and `decimals`, defaults 1 and 0)
- Modify: `hub/README.md` (one paragraph under the settings list)
- Test: `hub/test/web.test.mjs` (settings options keys exist)

**Interfaces:**
- Consumes: `rateLevel` from Task 3.
- Produces: tile box classes `rate-0`, `rate-1`, `rate-2` and a child `div.rate` holding the label; none when `rateLevel` is `null`.

- [ ] **Step 1: Write failing test** in `web.test.mjs`: `OPTIONS` contains `rate_mode`, `rate_orange_k`, `rate_red_k`, `rate_orange_pct`, `rate_red_pct`.
- [ ] **Step 2: Run** `node --test hub/test/web.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the options (a `choice` for `rate_mode` with Off, Tokens, Quota; four steppers, `k` steppers step 5 and `pct` steppers step 0.1 with 1 decimal). In `draw()` call `rateLevel(s, state.usage, state.settings)` per session, toggle the classes on the lead tile box only (team tile excluded) and fill `div.rate`. In `hub.css` the three classes set a `box-shadow` halo in theme variables (green, orange, red) with a `@keyframes` pulse; the animation duration is 3 s for level 0, 1.6 s for level 1, 0.8 s for level 2; `prefers-reduced-motion` keeps the halo static. `div.rate` sits at the tile's top right, small, readable on the theme background.
- [ ] **Step 4: Run** `node --test hub/test/*.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Check by eye** with the demo hub (`hub/tools/demo_seed.mjs`): post events with rising `stok` and confirm the three colors, the readout and the settings panel. Report what was seen.
- [ ] **Step 6: Commit** `git add hub/web hub/README.md hub/test/web.test.mjs && git commit -m "Hub page: glow and readout by token rate, thresholds in settings"`
