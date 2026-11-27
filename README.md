# TrackDraft

![TrackDraft logo](assets/logo.png)

TrackDraft is an Electron desktop app: a lyric-writing notepad where songs
are made of individually editable, versionable parts (verse, chorus,
bridge, etc.), with an optional AI assist (Claude API or local Ollama) for
rhyme-scheme suggestions and rewrites. Data is stored locally in a
SQLite file (Node's built-in `node:sqlite`, WAL mode). Databases written by
older versions (which used `sql.js`) are backed up and carried over
automatically on the first launch after updating.

## Development

```bash
npm install
npm run dev        # renderer (Vite) + electron main, concurrently
npm run build       # build:renderer + build:electron
npm run typecheck   # tsc over renderer and main
npm test            # node:test over src/**/*.test.ts (compiled to dist-test/); needs Node >= 22.13
npm run package      # electron-builder, produces installers in release/
```

## Standards

This repo follows [gerp93/KVG_Standards](https://github.com/gerp93/KVG_Standards)
for theming, release/CI, self-update, licensing, database location, release
notes, `VERSION_BUMP.md`, logo/branding, and `TODO.md` conventions. See that
repo's `README.md` and `REPO_SCOPE.md` for the current standards and this
repo's scope against them.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
