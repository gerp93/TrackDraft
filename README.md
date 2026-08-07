# TrackDraft

![TrackDraft logo](assets/logo.png)

TrackDraft is an Electron desktop app: a lyric-writing notepad where songs
are made of individually editable, versionable parts (verse, chorus,
bridge, etc.), with an optional AI assist (Claude API or local Ollama) for
rhyme-scheme suggestions and rewrites. Data is stored locally in a
`sql.js`-backed SQLite file.

## Development

```bash
npm install
npm run dev        # renderer (Vite) + electron main, concurrently
npm run build       # build:renderer + build:electron
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
