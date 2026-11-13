# Token rate glow on session tiles (short design)

## Intent
See from across the room which sessions burn many tokens per minute. A halo around the tile changes color and pulse speed with the rate.

## Goals
- The hub computes a tokens/min rate per session from `stok` (cumulative session tokens), over a sliding 5 minute window. No adapter change.
- The page draws a CSS glow around each tile: green below the low threshold, orange between, red above the high threshold. The pulse speeds up with the rate. A small readout ("42k/min") sits on the tile.
- Two threshold units, chosen in the settings: tokens/min, or % of quota per minute. Low and high thresholds are editable. A third mode, "off", hides the glow.

## Non-goals
- No change to the device screen (`screen.js`, firmware). Option B (glow on the device too) was declined.
- No per-session quota from adapters: `/usage` quota fields stay account-wide.

## Anti-goals
- A glow that flickers on short bursts: the 5 minute window smooths them.
- A glow on idle or done sessions: only `working` sessions glow.

## Approaches considered
- A (chosen): glow on the page tiles plus a rate readout.
- B: A plus the device screen (two repositories to keep in step).
- C: badge only, no halo (less visible from afar).

## Decisions (my calls, to correct)
- Window: 5 minutes, samples taken at each event carrying `stok`.
- "% of quota per minute": rate divided by a calibration the hub measures (tokens summed over all sessions divided by the change in `h5_pct` since the window started). With no calibration yet, the hub uses tokens/min and the readout says so.
- Settings go in the existing settings store (`settings` in the state), with defaults: orange 20k tokens/min, red 60k tokens/min; % mode defaults to orange 0.5 %/min, red 1.5 %/min.
- The rate is published per session in `/state` (new field, documented in `docs/protocol.md`; the doc test requires it).

## Left to the builder
Exact easing and colors (use theme variables), where the readout sits on the tile, tests for the rate window and the calibration.
