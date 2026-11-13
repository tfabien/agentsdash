# Prompt: migrate standup-bot-themes to the marketplace layout

Paste the text below into Claude Code, in an empty folder (it clones the repository itself).

---

Migrate the repository `tfabien/standup-bot-themes` (all its themes, currently 23) to the marketplace layout of standup-bot. Work in a fresh clone on a branch `feat/marketplace-layout`, open a PR to `main`, do not merge.

## Target layout

One folder per theme at the repository root. The folder name is the theme name.

```
<name>/theme.json
<name>/preview.png          (png, webp, jpg or gif; optional but wanted)
<name>/icons/<role>[-N][-blink].<png|webp|gif|jpg|svg>
```

## `theme.json` format

```json
{
  "name": "cat",
  "label": "Cat",
  "description": "Cats at their desks, warm brown frame.",
  "keywords": ["cat", "animals", "cozy"],
  "author": "tfabien",
  "version": "1.0.0",
  "colors": { "FRAME": "#6b4630", "TEXT": "#fbeedd" }
}
```

- `name`: equals the folder name, `^[a-z0-9-]{1,32}$`.
- `label`: the title shown in the marketplace.
- `description`: one sentence, 200 characters max.
- `keywords`: 3 to 8 lowercase words, 24 characters max each (subject, mood, style).
- `version`: dotted numbers. Start at `1.0.0`.
- `author`: keep the existing value.
- `colors`: copy unchanged. Remove the `iconPack` field: the pack is the theme's own `icons/` folder.

## Steps

1. Clone the repository. List the current themes (`themes/*.json`), the pack each one names in `iconPack` (`icons/<pack>/`) and the previews (`previews/`).
2. For each theme, create `<name>/`:
   - write `theme.json` as above. Look at the preview and the icons to write an accurate `description` and `keywords`;
   - copy the files of `icons/<pack>/` into `<name>/icons/` (keep file names). When several themes use the same pack, each gets its own copy;
   - move `previews/<name>.<ext>` to `<name>/preview.<ext>`. When a theme has no preview, say so in the PR and continue.
3. Remove the old `themes/`, `icons/` and `previews/` folders only after every check below passes.
4. Check every theme folder with a script you keep in `tools/check.mjs` (Node, stdlib only) and run it. It fails when:
   - `name` differs from the folder name, or `theme.json` is not valid JSON;
   - one of the 8 roles is missing (`lead general explore plan review test code generic`, each with at least one file);
   - a file name does not match `<role>[-2..-99][-blink].<ext>`;
   - an svg or `theme.json` is over 256 KB, a raster file over 1 MB, the theme has more than 100 files or more than 20 MB;
   - `description` is over 200 characters, `keywords` has more than 8 entries or an entry over 24 characters, `version` is not dotted numbers, `iconPack` is still present.
5. Update `README.md`: a table with one row per theme (preview image, label, description, keywords, version) generated from the `theme.json` files, and the layout section above for contributors.
6. Rewrite `install.md` for Claude Code: install by opening the standup-bot page, theme button, Marketplace tab (the default source is this repository), or call `POST http://127.0.0.1:8765/market/install` with `{"source":"tfabien/standup-bot-themes","name":"<name>"}`. Keep the "Create a theme" section, adapted to the new layout and the metadata fields.
7. Commit in two commits (the moves with their `theme.json`, then the README, `install.md` and `tools/check.mjs`). Push the branch and open the PR with the list of the 23 themes, the ones without preview, and any theme where the pack was duplicated.

Rules: do not change colors or icon files. Do not rename a theme. When a theme is ambiguous (missing pack, two packs), stop and report it instead of guessing.
