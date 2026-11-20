# Themes on the hub side

How the hub finds, installs and serves themes, plus the project rules. The format of themes and icon packs (theme file, looks, accent, palette swaps, marketplace layout) is documented in the themes repository: https://github.com/tfabien/agentsdash-themes/blob/main/docs/format.md

The page has one global theme, chosen with the palette button of the bottom bar. The hub keeps the choice (`theme` in `hub-settings.json`), so every page follows without a restart. The physical screen is not affected. The hub reads the built-in themes from `hub/` (Robot Soft, with the legacy `line` identifier) and yours from `~/.agentsdash/` (the old `~/.claude/standup-bot/` is copied there once, at the first start), and publishes them as `catalog` in `GET /state`.

## Built-in theme and more themes

agentsdash ships one built-in theme, **Robot Soft** (`hub/themes/line.json` and `hub/icons/line/`). It keeps the `line` identifier and the `amber`, `mint`, `paper` variants so existing theme selections, looks, color edits and project rules continue to resolve to this pack. At the first launch of the hub, when the user folder holds no theme, it downloads the theme named by `"theme"` in `~/.agentsdash/config.json` or the env `AGENTSDASH_THEME` (default `robot`; else the first one listed) from the first marketplace source and applies it; it retries every 10 minutes while that fails (offline). Until then the page draws the built-in vector robots in the firmware colors. The themes live in https://github.com/tfabien/agentsdash-themes (cat, lemmings, office, pirates, spelunky and more). Install them with the `install-theme` skill of the plugin, or follow `install.md` of that repository, which also lists the constraints to create a theme.

## Drop-in folders

```
~/.agentsdash/themes/*.json
~/.agentsdash/icons/<pack>/<role>[-blink].svg
```

The user folder overrides the built-in one by name: a user theme called `cat` replaces the built-in `cat`, a user pack called `robot` replaces the built-in `robot`.

Reload without a restart: press **Reload** in the theme dialog of the page, or:

```sh
curl -X POST http://127.0.0.1:8765/reload
```

The hub rescans both folders and pushes the new catalog to every open page. The reply is `ok`.

## Project rules

A rule gives the sessions of some folders their own icon pack and badge color. Rules live in the hub setting `rules` (shared by all pages) and are edited in the page settings, section "Project rules". Each hook event carries the session's working directory (`cwd`), which the rules match.

```json
[
  { "match": "C:/work/prod-*", "badgeColor": "#e03131", "iconPack": "pirates" },
  { "match": "**/experiments" }
]
```

- `match`: a path or glob. `*` is any characters inside one folder, `**` crosses folders, `?` is one character. Case and `\` against `/` do not matter. A pattern also matches its sub-folders.
- `iconPack`: optional, a pack name. Blank keeps the theme's pack.
- `badgeColor`: optional, `#rrggbb`. It replaces the project badge background. The text is black or white, whichever contrasts more.
- First match wins. Put specific rules before general ones.
- A session with no `cwd` (events sent with `AGENTSDASH_MASK=1`) matches no rule. The `cwd` is never sent to devices.

Example: a `prod-*` folder shows a red badge and a distinct pack, so production work stands out in the grid.

## Security

The hub serves icons from `GET /icons/<pack>/<file>` only for files in the catalog, so path traversal and unlisted names return 404. Each reply carries `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`. The page loads icons as `Image`, which never runs scripts inside an SVG. Raster files cannot run code. Themes hold colors only. The hub binds `127.0.0.1`.

## Marketplace

The theme dialog has two tabs: **Installed** (the catalog, with a Remove button on themes that came from a marketplace) and **Marketplace** (themes of GitHub repositories, with search, Install, Update and Remove). The default source is `tfabien/agentsdash-themes`; add others with the "Add a source" field (`owner/repo` or a GitHub URL, at most 10). Sources are the hub setting `marketSources`, shared by all pages.

The hub does the work: it reads the repository from `api.github.com` and downloads from `raw.githubusercontent.com`, then writes `~/.agentsdash/themes/<name>.json` (with `iconPack` set to the theme name) and `icons/<name>/`; a theme with no icon files gets `iconPack` `robot` and no `icons/<name>/`. Removing a theme deletes `icons/<name>/` only, and keeps it while another user theme or a rule uses it. A download that fails, a file over the size limits (256 KB json and svg, 1 MB raster, 100 files, 20 MB total) or a theme named like a built-in one leaves everything as it was. `~/.agentsdash/market.json` records `{ source, version, installedAt }` for each installed theme; only those themes are updated or removable.

### Updates

The hub checks the sources of installed themes every 6 hours, starting at launch, and installs a newer `version`. A check runs only while a page is open or a session exists; a check skipped while the hub was idle (the one at launch included) runs when the next page opens or the next event arrives. Turn this off with the **Auto-update** switch (setting `themeAutoUpdate`). **Check for updates** installs every newer version now. A listing is cached for 24 hours, also across hub restarts (`~/.agentsdash/market-cache.json`); **Refresh** and **Check for updates** fetch it again, and **Install** reads the theme's source fresh. A listing in which only some themes failed is cached too; when the repository itself fails (offline, HTTP 403), the last listing is shown with the error; a check costs 2 GitHub calls per source (the anonymous limit is 60 calls per hour).

### Routes

`GET /market` (sources, installed log, themes with `installed`, `installedVersion`, `updatable`, errors, `lastCheck`), `POST /market/sources` `{add}` or `{remove}`, `POST /market/install` `{source, name}`, `POST /market/remove` `{name}`, `POST /market/update` `{}` or `{name}`. The Host and Origin checks of the hub apply.
