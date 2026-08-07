# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## What this is

TrackDraft is an Electron desktop app: a lyric-writing notepad where songs
are made of individually editable, versionable parts (verse, chorus,
bridge, etc.), with an optional AI assist (Claude API or local Ollama) for
rhyme-scheme suggestions and rewrites. Data is stored locally in a
`sql.js`-backed SQLite file.

## Commands

```bash
npm install
npm run dev        # renderer (Vite) + electron main, concurrently
npm run build       # build:renderer + build:electron
npm run package      # electron-builder, produces installers in release/
```

## Architecture

- `src/main/` — Electron main process: `main.ts` (window, IPC handlers,
  auto-updater wiring), `database/` (sql.js schema + per-entity services),
  `dbLocation.ts` (relocatable SQLite file), `ai/` (Claude/Ollama providers
  behind a shared `aiService`).
- `src/renderer/` — React UI (Vite), `pages/` for routed screens,
  `components/` for the song/part editor pieces, `utils/themes.ts` for the
  VisualAssault theme switcher.
- `src/shared/` — types and pure utilities (rhyme scheme parsing, version
  diffing, autoformatting) used by both processes.

`src/renderer/themes.css` is vendored from
[VisualAssault](https://github.com/gerp93/VisualAssault)
`packages/css/themes.css` at a pinned tag — re-run
`scripts/update-visual-assault-css.sh <tag>` to bump it, never hand-edit.

## Release pipeline

Both `.github/workflows/auto-release.yml` (fires on every push to `main`)
and `cut-release.yml` (manual, explicit version) call
[`gerp93/KVG_Standards`](https://github.com/gerp93/KVG_Standards)'s
`release-electron.yml` reusable workflow, currently pinned `@main` (interim
exception — KVG_Standards has no tagged releases yet). To force a release
with no other code change, add a dated entry to `VERSION_BUMP.md` instead
of pushing an empty commit.

## Standards

This repo follows [gerp93/KVG_Standards](https://github.com/gerp93/KVG_Standards)
for theming, release/CI, self-update (via `electron-updater`, the
sanctioned Electron pattern), licensing, database location, release notes,
`VERSION_BUMP.md`, and `TODO.md` conventions. See that repo's `README.md`
and `REPO_SCOPE.md` for the current standards and this repo's scope against
them — don't assume this file has the full, current picture.
