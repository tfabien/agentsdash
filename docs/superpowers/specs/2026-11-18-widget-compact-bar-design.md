# Compact bottom bar in the widget

Date: 2026-11-18. Status: awaiting approval. Small change: this document is also its plan.

## Intent and why

In the floating widget the bottom bar takes a full row of a small window, with a clock the user does not need. The user wants the quotas kept (they watch consumption), a thinner bar without the clock, and the buttons only when the mouse is over the bar.

## Goals

- In the widget the bar is one thin line with the quota bars only.
- The bar's buttons (beeps, theme, QR, settings) appear when the mouse is over the bar, in the place of the clock.
- The browser page is unchanged.

## Non-goals

- A setting to turn the compact bar on or off in the browser.
- Touch behaviour (the widget is a desktop window).

## Anti-goals

- The settings, theme and QR menus must stay reachable in the widget.
- The quotas must not shift or flicker when the buttons appear.

## Design

- The launcher marks the widget: `launch` (hub/widget/run.mjs) loads `<url>?widget=1`, so the button route and the command line both give the widget its page. The host's `/health` probe keeps working (a relative URL drops the query).
- Page: `hub.html` sets `document.documentElement.dataset.mode = 'widget'` in an inline script before the first paint when the query holds `widget`. The phone page already uses `data-mode="phone"`; the page code reads `dataset.mode` (hub_page.js), so the new mode must not be read as the phone mode.
- CSS in `settings.css`, selector `html[data-mode="widget"]`:
  - `#bar`: padding 3px 10px, gap 12px, quota text 11px, no clock (`.clock` hidden).
  - `#bar .tools`: positioned over the right end of the bar, opacity 0 and no pointer events, opacity 1 and pointer events on `#bar:hover`, 120 ms fade; chips 22 px high so the bar does not grow.
  - `.widgetbtn` hidden (opening the widget from itself does nothing useful).
- Menus opened from the tools keep the bar visible while open: `#bar:has(.open)` is not needed, the tools are only buttons; a menu opens in the stage, and the bar hides again when the mouse leaves.

## Approaches considered

1. Hide the bar completely in the widget: simplest, but no consumption display (user wants it).
2. Reduced bar with hover buttons (chosen): keeps quotas, thin, buttons one gesture away.
3. A separate widget page: no shared code with the browser page, duplicated tile logic.

## Steps

1. Test: `run.mjs` `launch` spawns with the URL plus `?widget=1` (extend `launch_spawns_detached_with_the_url_and_the_settings_file`); a hub test that `GET /?widget=1` still serves the page.
2. `run.mjs`: add the query in `launch`.
3. `hub.html` inline mode script, `settings.css` rules; check `hub_page.js` for code that reads `dataset.mode` and make sure only `'phone'` triggers phone behaviour (it compares to `'phone'` already).
4. Screenshot of the widget with the bar idle and hovered; docs line in `docs/widget.md`.
5. Full test suite, commit, PR.

## Left to the builder

- Exact paddings and sizes so the idle bar is about 22 px high.
