# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## What this is

TrackDraft is an Electron desktop app: a lyric-writing notepad where songs
are made of individually editable, versionable parts (verse, chorus,
bridge, etc.), with an optional AI assist (Claude API or local Ollama) for
rhyme-scheme suggestions and rewrites, and optional song audio generation
through a local [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) API
server. Data is stored locally in a SQLite file driven by Node's built-in `node:sqlite`
(`DatabaseSync`, WAL mode, foreign keys enforced).

## Commands

```bash
npm install
npm run dev        # renderer (Vite) + electron main, concurrently
npm run build       # build:renderer + build:electron
npm run package      # electron-builder, produces installers in release/
npm run typecheck    # tsc --noEmit for renderer and main
npm test             # node:test over src/**/*.test.ts (compiled to dist-test/ by tsconfig.test.json)
```

## Architecture

- `src/main/` — Electron main process: `main.ts` (window, IPC handlers,
  auto-updater wiring), `database/` (sql.js schema + per-entity services),
  `dbLocation.ts` (relocatable SQLite file), `ai/` (Claude/Ollama providers
  behind a shared `aiService`; `aceStepProvider` + `songGeneration` for
  audio "takes", whose files live in `userData/takes/`, not beside the
  database -- only their metadata is in SQLite).
- `src/main/database/` — the `node:sqlite` layer. `schema.ts` opens the file (`initDatabase(dbPath)`,
  sync, takes the path as an argument so tests need no Electron), runs the idempotent schema steps
  (`addColumnIfMissing` for the old ALTER migrations) and owns `transaction()` (re-entrant; use it for
  any method that does more than one write) and `closeDatabase()`. Writes go straight to disk; there is
  no save step. `PRAGMA foreign_keys = ON` is real now (sql.js never enforced it), so insert parents
  before children and delete in a safe order. `node:sqlite` refuses `undefined` and booleans as bound
  parameters: bind `null` and `1`/`0`.
- `src/renderer/` — React UI (Vite), `pages/` for routed screens,
  `components/` for the song/part editor pieces, `utils/themes.ts` for the
  VisualAssault theme switcher.
- `src/shared/` — types and pure utilities (rhyme scheme parsing, version
  diffing, autoformatting) used by both processes.

### sql.js -> node:sqlite migration

Earlier versions used `sql.js`, which rewrote the whole file on every save. Its `db.export()` output
is an ordinary SQLite file, so `node:sqlite` opens an existing `trackdraft.db` directly; nothing is
copied row by row. `database/sqlJsMigration.ts` (no electron import, so it is unit-tested under plain
node) wraps that first open: `PRAGMA user_version` 0 means "not yet opened by node:sqlite",
`NODE_SQLITE_USER_VERSION` (1) means done. For a pending file it runs `integrity_check`, makes a
verified backup `<db>.sqljs-backup` (temp file + rename; an existing matching backup from an
interrupted attempt is reused, a non-matching one is never overwritten), then the schema steps and a
per-table row-count comparison run in ONE transaction together with setting `user_version`, so any
failure rolls back and the next launch retries. If it throws, `main.ts` shows an error dialog and
quits; it must never fall through to creating an empty database. Anything that copies the database
file (`dbLocation:set` / `resetToDefault`) must `closeDatabase()` first, because recent commits live
in the `-wal` sidecar until the database is checkpointed. Keep the migration module for as long as
installs written by the sql.js build may still exist.

`src/renderer/themes.css` is vendored from
[VisualAssault](https://github.com/gerp93/VisualAssault)
`packages/css/themes.css` at a pinned tag — re-run
`scripts/update-visual-assault-css.sh <tag>` to bump it, never hand-edit.

## Release pipeline

`.github/workflows/ci.yml` typechecks, tests and builds every PR and push to `main`. Both `.github/workflows/auto-release.yml` (fires on every push to `main`)
and `cut-release.yml` (manual, explicit version) call
[`gerp93/KVG_Standards`](https://github.com/gerp93/KVG_Standards)'s
`release-electron.yml` reusable workflow (with `test_command: 'npm test'`, so a failing test stops a release), currently pinned `@main` (interim
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
