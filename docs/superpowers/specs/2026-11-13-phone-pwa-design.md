# Phone PWA (agentsdash-device-phone), first version

Status: draft for approval. Tracks [agentsdash-device-phone#1](https://github.com/tfabien/agentsdash-device-phone/issues/1).

## Intent

A phone (iPhone or Android) shows the hub page full screen, so the user sees which agent needs them while away from the desk.
The phone is a viewer only. It never changes anything on the hub.

A PWA is a web page with a manifest (name, icon, colors, "standalone" display). The phone adds it to the home screen and opens it without browser bars, like an app. No native code, no store.

## Goals

- The phone opens `http://<pc-ip>:8765/phone` on the home Wi-Fi and shows the live hub page (tiles, states, questions).
- One QR code pairs the phone: it carries the address and a secret token. The user scans it once.
- The page can be added to the home screen and opens full screen.
- The screen stays on while the page is open (Screen Wake Lock API, where supported).
- When the hub is unreachable (PC asleep, Wi-Fi lost) the page says so and reconnects by itself.

## Non-goals (first version)

- HTTPS, service worker, offline cache, push notifications. iOS and Android need HTTPS for these. They come with a later step (Tailscale `serve` or a local certificate).
- Controlling the hub from the phone (dismiss, settings, themes, marketplace).
- Use outside the home network, mDNS discovery (`agentsdash.local`), company network support.
- Any change to the wire protocol or the device relay.

## Anti-goals

- The LAN must never expose the hub by default. A fresh install binds `127.0.0.1` exactly as today.
- A device on the same Wi-Fi without the token must learn nothing (no state, no session titles, no commands).
- No remote client may call a route that writes (`POST /event`, `/usage`, `/settings`, `/relay`, `/themes`, `/market*`, `/shutdown`, `/reload`...).

## Constraints

- The hub imports nothing from a device and runs from a copy of its own folder (test `core_standalone`). Node standard library only.
- Chosen with the user: Wi-Fi at home, plain `http`, first version.
- `docs/protocol.md` lists every route and a test fails when one is missing there.
- The hub page is `web/hub.html` + `web/hub_page.js`; `serveStatic` serves any file of `hub/web/`.

## Approaches

1. PWA in the core: manifest, icons, `phone.html` and route in `hub/web/`; the phone repository keeps README, pairing guide and end-to-end checks. Chosen (the user left the choice to the builder). The LAN bind and token touch `hub.mjs` anyway, so the page that depends on them stays beside it.
2. PWA in the phone repository, served by the hub from `~/.agentsdash/devices/phone/`. Rejected: a loading mechanism, versions and updates for one page.
3. PWA hosted elsewhere (GitHub Pages) calling the hub. Rejected: the hub forbids CORS, and an `https` page cannot call an `http` hub.

## Design (the builder's calls are marked)

### Config

`config.json`: `"lan": { "enabled": true, "bind": "0.0.0.0" }`; env `AGENTSDASH_LAN=1`. Default: absent, hub stays on `127.0.0.1`. `bind` defaults to `0.0.0.0` (your call: the builder may restrict it to the private interface addresses). `loadConfig` returns `lan` normalised (`{enabled:false}` by default).

### Token

A random 128-bit token, created on first use and stored in `~/.agentsdash/lan-token` (mode 600 where the OS allows). It is never in `GET /state`, `/health` or logs.

### Request rules when `lan.enabled`

- A request from a loopback address (`127.0.0.1`, `::1`) follows today's rules, no token.
- A request from any other address must carry the token as the cookie `agentsdash_token` (HttpOnly, SameSite=Lax (Strict drops the cookie after a QR scan, which is a cross-site navigation), long life). Without it: `401`, no body detail.
- `GET /pair?t=<token>`: if the token matches, set the cookie and redirect to `/phone`; else `401`. The token appears in a URL only here (your call: it will show in browser history of that one URL; the page after the redirect has none).
- Remote clients may use only: `GET /phone`, `/phone.html`, `/manifest.webmanifest`, `/state`, `/events`, `/health` and the static files and icons the page loads. Any other route answers `403`.
- Host allow-list: the loopback names plus each private IPv4 address of the machine (`os.networkInterfaces()`) and `os.hostname()`, each with the port. Origin follows the same set. A request naming another host gets `403` (DNS rebinding protection stays).
- Token compare with `crypto.timingSafeEqual`.

### Pairing QR

`GET /pair-info` (loopback only) returns `{ url }` with the LAN address and the token: `http://<ip>:<port>/pair?t=<token>`. The hub page of the PC shows a "Phone" entry in its settings that draws the QR. QR drawing: a small generator in `hub/web/` with no dependency (your call: vendor a minimal MIT QR encoder as one file, noted in its header). The terminal view prints the URL under the logo when LAN is enabled (your call: no terminal QR in v1).

### The phone page

`/phone` serves `web/phone.html`: the same tiles as `hub.html` (reuses `hub_page.js` and `hub.css`), read-only (no settings, no theme editor, no sound controls), plus:

- `<link rel="manifest">`, `theme-color`, and the Apple tags (`apple-mobile-web-app-capable`, status bar style, touch icon) so iOS opens it full screen.
- `manifest.webmanifest`: name "Agents Dash", `display: standalone`, `start_url: /phone`, icons 192 and 512 PNG (your call: generated from the existing theme art, committed).
- Wake Lock: requested after the first touch, requested again when the page becomes visible. Silent when unsupported.
- State banner: "Hub unreachable, retrying" when the event stream drops; the stream reconnects with a growing delay (1 s to 10 s).
- Layout: one column of tiles in portrait. The builder checks the existing responsive rules and fixes what overflows at 390 px width.

### Docs and tests

- `docs/protocol.md`: new routes (`/phone`, `/pair`, `/pair-info`, `/manifest.webmanifest`) and the LAN rules.
- `hub/README.md` or the main README: how to turn LAN on and pair.
- Core tests: loopback unchanged; remote without token gets `401`; with token gets state; remote `POST /event` gets `403`; foreign Host gets `403`; token not in `/state`; default config stays loopback.
- Phone repository: README rewritten from "idea" to the pairing steps, state set to "first version". `devices/README.md` and the main README row updated.
- Release: raise `version` in `hub/package.json` (the protocol stays 2).

## Left to the builder

File split inside `hub.mjs` (a new `lan.mjs` is welcome to keep it small), QR encoder choice, icon generation, exact reconnect delays, how `hub_page.js` switches to read-only (query flag or a separate entry).

## Risks

- A token in a QR shown on screen: anyone who sees the QR can pair. The token can be rotated by deleting the file (document it; a rotate button is a later step).
- Plain `http` on Wi-Fi: the token and page content cross the network unencrypted. Acceptable on a home network, stated in the README; HTTPS is the next step.
- iOS may drop the Wake Lock when the PWA is backgrounded; the page re-requests on return.
