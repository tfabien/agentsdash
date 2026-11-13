# Theme marketplace

## Intent

The theme dialog of the page lists the installed themes and opens a marketplace of GitHub repositories where the user browses and installs themes with one click. `tfabien/standup-bot-themes` is the default source. Today installing a theme needs Claude Code and the `install-theme` skill.

## Goals

- Dialog with two tabs: Installed (today's list, plus Remove for user-installed themes) and Marketplace.
- Marketplace lists the themes of every source, with preview, title, description, keywords, author, and an Install, Update or Remove button.
- A field accepts `owner/repo` to add a source. Sources are a hub setting (`marketSources`), shared by all pages, default `["tfabien/standup-bot-themes"]`.
- Search box filters by title, description and keywords.

## Non-goals

- No GitHub login, no private repositories, no non-GitHub hosts.
- No automatic update checks. Update is a button the user presses.
- The physical screen is unchanged.

## Source layout (convention of folders)

One folder per theme at the repository root:

```
<name>/theme.json
<name>/preview.png        (optional; png, webp, jpg or gif)
<name>/icons/<role>[-N][-blink].<ext>
```

- The icon pack of a theme has the theme's name. `iconPack` is absent in the source `theme.json`.
- `theme.json` keeps today's fields (`name`, `label`, `author`, `version`, `colors`) and gains metadata: `description` (text, 200 characters max) and `keywords` (array of at most 8 strings, 24 characters max each). `label` is the title. All metadata is optional.
- `name` must equal the folder name.
- The hub lists a repository with two GitHub calls: default branch, then `git/trees/<branch>?recursive=1`. Every folder holding a `theme.json` is a theme. A listing is cached for 10 minutes.

## Local layout (unchanged)

The installer writes `~/.claude/standup-bot/themes/<name>.json` with `iconPack` set to `<name>`, and the files of `icons/` into `~/.claude/standup-bot/icons/<name>/`. The loader and the installed themes do not change. `description` and `keywords` pass through `validateTheme` and appear in the catalog, so the Installed tab shows them too.

## Hub API

- `GET /market` returns `{sources, themes: [{source, name, label, description, keywords, author, version, preview, installed, installedVersion}], errors}`.
- `POST /market/sources` body `{add: "owner/repo"}` or `{remove: "owner/repo"}`.
- `POST /market/install` body `{source, name}`; `POST /market/remove` body `{name}`.
- Install downloads from `raw.githubusercontent.com` into a temporary folder, validates with the loader rules (file types, 256 KB svg and 1 MB raster caps, at most 100 files, 20 MB total), then moves the folder in and rescans the catalog. A failed install leaves the previous version in place.
- The hub talks only to `api.github.com` and `raw.githubusercontent.com`. `owner/repo` must match `[\w.-]+/[\w.-]+`. Existing Host and Origin checks cover the new routes. Remove only touches themes whose JSON sits in the user folder.

## Versions and updates

- `version` of `theme.json` is a required field for a marketplace theme (text, dotted numbers such as `1.2.0`). A theme without one counts as `0`.
- The hub records each install in `~/.claude/standup-bot/market.json`: `{ "<name>": { "source", "version", "installedAt" } }`. Only themes listed there are updated. A theme the user wrote or edited by hand is never touched.
- The hub checks the sources of installed themes at start and then every 6 hours, while at least one page is open or a session exists. Setting `themeAutoUpdate` (default on) turns the check off. A check costs 2 GitHub calls per source.
- A theme is newer when its version is greater in dotted-number order. A non-numeric version counts as newer when the text differs.
- An automatic update installs like a manual one (temporary folder, validation, atomic move), then rescans the catalog. A failure keeps the old version and shows in `errors`.
- Buttons: "Check for updates" in the Marketplace tab runs the check now and installs every newer version (forced update). The card of one theme has Update. The cards show `installedVersion` next to the available version.
- `POST /market/update` body `{}` updates all, or `{name}` updates one. `GET /market` adds `updatable` per theme and `lastCheck` at the top.
- The Installed tab shows an "update available" mark when auto-update is off.

## Approaches considered

1. Hub installs, page calls the hub (chosen). One code path, works offline for installed themes, the page never reaches GitHub.
2. Page fetches GitHub directly. Needs CORS on the hub and breaks the hub's no-CORS rule.
3. Marketplace button asks Claude Code to run the skill. No new code, but needs a running session and is slow.

## Decisions taken

- Convention of folders, no `index.json` (user choice). GitHub's anonymous limit is 60 calls per hour, two per source per 10 minutes.
- `theme.json` moves into the theme folder (user choice), and metadata is added (user choice).
- Pack shared between themes is not supported in the source layout. A theme that shares images duplicates them.

## Left to the builder

Card and tab styling, empty and error states (offline, rate limit, unknown repository), the order of the list, a progress state on Install.

## Also changes

- `standup-bot-themes` is restructured to the new layout (separate repository, separate PR).
- `install.md` of that repository and `plugin/skills/install-theme/SKILL.md` follow the new layout.
- `docs/themes.md` documents the marketplace and the source layout.
