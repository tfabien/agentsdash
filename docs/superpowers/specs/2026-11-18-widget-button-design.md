# Widget button in the hub page

Date: 2026-11-18. Status: awaiting approval. Builds on `2026-11-18-floating-widget-design.md`.

## Intent and why

The widget is started with `node widget/run.mjs` from a terminal. The user wants a control on the hub page that opens it, so the widget is one click away from the page they already use.

## Goals

- A button on the hub page opens the floating widget.
- The widget ships with the hub release, so the button works outside a repository checkout (chosen by the user over a hub that only finds the widget next to `hub/`).
- Only a client on loopback can open it: a phone on the LAN never launches a program on the PC.

## Non-goals

- Building the host from the page (the build stays `node hub/widget/build.mjs`, run once).
- Closing the widget from the page (its own menu closes it).
- Autostart of the widget with the hub.
- Linux.

## Anti-goals

- No new dependency, no code outside `hub/` imported by the hub.
- The button must not look broken when the host is not built: it says what to run.

## Approaches considered

1. Hub route plus a settings button, hub finds the host next to `hub/`: smallest, but absent from the release archive.
2. Move `widget/` into `hub/widget/` (chosen): the sources ship with the release; the binary is still built per machine.
3. Custom URL protocol `agentsdash-widget://`: no launch code in the hub, but a registry entry (Windows) and a bundle (macOS) per machine.

## Design

- Move: `widget/` becomes `hub/widget/` (git mv). `run.mjs` and `build.mjs` keep `ROOT` as the folder above them, which is now `hub/`; imports of hub modules become `../config.mjs`, `../paths.mjs`, `../json_file.mjs`, `../run_as_main.mjs`. Commands become `node hub/widget/build.mjs` and `node hub/widget/run.mjs`. Tests and CI paths follow. `.gitignore` becomes `hub/widget/**/bin/`.
- `run.mjs` splits `main` into `widgetStatus(platform, root): {supported: boolean, built: boolean}` and `launch(url, env, platform, root): number` (the spawn); `main` keeps its exit codes and calls them.
- Hub routes, loopback only (absent from `REMOTE_ROUTES`, so a LAN client gets 403):
  - `GET /widget` answers `{supported, built}`.
  - `POST /widget` starts the host on the hub's own URL (`http://127.0.0.1:<bound port>/`) and answers `{ok: true}`; 409 `{error: "not built"}` when the host file is missing; 501 `{error: "unsupported"}` on another OS. A second call while a widget runs brings it to the front (the host's single-instance rule).
  - Both described in `docs/protocol.md`.
  - The hub takes an optional `widget` option (`{status, launch}`) so tests never spawn a process.
- Page: an icon button in the bottom bar (`web/footer.js`), left of the QR button (chosen by the user over a row in the settings dialog). Hidden when `supported` is false and on a phone page. Disabled, with the tooltip "Build it once: node hub/widget/build.mjs", when `built` is false. A failed POST shows its error text as a toast, the way the bar's other buttons report errors. The state is read once at page load and after a click.
- Docs: `docs/widget.md`, README widget section, `CLAUDE.md` layout line and test command mention the new paths and the button.

## Tests

- `widget_run` and `widget_build` tests move to the new import paths and keep passing.
- Hub tests with an injected `widget` option: `GET /widget` shape, `POST /widget` launches once with the hub URL, 409 when not built, 501 when unsupported, 403 for a client treated as remote.
- Protocol doc test passes with both routes documented.
- Manual: the button opens the widget on Windows; hint text when the host is missing.

## Left to the builder

- Exact markup and CSS of the row in the General tab, following the existing rows.
- Wording of error texts shown in the row.
