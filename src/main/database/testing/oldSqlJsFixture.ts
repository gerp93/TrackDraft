import { DatabaseSync } from 'node:sqlite';

/**
 * Builds a database the way the old sql.js engine left one on disk: the original (oldest)
 * CREATE statements, before the ALTER TABLE columns were added; journal_mode left at the
 * default (DELETE), user_version 0. sql.js's `db.export()` is a plain SQLite file, so a file
 * made this way with node:sqlite is byte-format-compatible with a real one (sql.js itself
 * can't be installed here). Test-only -- excluded from the shipped build (tsconfig.main.json).
 */
export function createOldSqlJsDatabase(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE parts (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      part_type TEXT NOT NULL DEFAULT 'custom',
      label TEXT NOT NULL,
      no_lyrics INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );
    CREATE TABLE part_placements (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      part_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
    );
    CREATE TABLE part_versions (
      id TEXT PRIMARY KEY,
      part_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      lines TEXT NOT NULL,
      rhyme_scheme TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
      UNIQUE (part_id, version_number)
    );
    CREATE UNIQUE INDEX idx_one_active_per_part ON part_versions(part_id) WHERE is_active = 1;
    CREATE TABLE song_takes (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      lyrics TEXT NOT NULL DEFAULT '',
      duration_seconds REAL,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_song_takes_song ON song_takes(song_id);
    CREATE TABLE sound_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      style_notes TEXT NOT NULL,
      vocal_gender TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  const t = (n: number) => `2026-0${1 + (n % 9)}-1${n % 10}T12:00:00.000Z`;
  const song = db.prepare('INSERT INTO songs (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)');
  const part = db.prepare(
    'INSERT INTO parts (id, song_id, part_type, label, no_lyrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const placement = db.prepare(
    'INSERT INTO part_placements (id, song_id, part_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const version = db.prepare(
    `INSERT INTO part_versions (id, part_id, version_number, lines, rhyme_scheme, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const take = db.prepare(
    `INSERT INTO song_takes (id, song_id, file_name, prompt, lyrics, duration_seconds, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const preset = db.prepare(
    'INSERT INTO sound_presets (id, name, style_notes, vocal_gender, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  // Song 1: verse / chorus / verse / chorus (the chorus is one part placed twice), with
  // two versions of the chorus (the later one active), unicode lyrics, a NULL rhyme scheme.
  song.run('song-1', 'Café Lights — Nächte', t(1), t(2));
  part.run('p-verse-1', 'song-1', 'verse', '', 0, t(1), t(1));
  part.run('p-chorus', 'song-1', 'chorus', '', 0, t(1), t(3));
  part.run('p-verse-2', 'song-1', 'custom', 'Second verse ☕', 0, t(2), t(2));
  part.run('p-outro', 'song-1', 'outro', '', 1, t(2), t(2));
  placement.run('pl-1', 'song-1', 'p-verse-1', 0, t(1));
  placement.run('pl-2', 'song-1', 'p-chorus', 1, t(1));
  placement.run('pl-3', 'song-1', 'p-verse-2', 2, t(2));
  placement.run('pl-4', 'song-1', 'p-chorus', 3, t(2));
  placement.run('pl-5', 'song-1', 'p-outro', 4, t(2));
  version.run('v-verse-1', 'p-verse-1', 1, JSON.stringify(['Neon on the wet street', 'Ça va, ça va']), 'AB', 1, t(1), t(1));
  version.run('v-chorus-1', 'p-chorus', 1, JSON.stringify(['Sing it loud 🎤', 'Sing it proud']), 'AA', 0, t(1), t(1));
  version.run('v-chorus-2', 'p-chorus', 2, JSON.stringify(['Sing it loud 🎤', 'Sing it proud', '日本語の歌詞']), null, 1, t(3), t(3));
  version.run('v-verse-2', 'p-verse-2', 1, JSON.stringify([]), null, 1, t(2), t(2));
  version.run('v-outro', 'p-outro', 1, JSON.stringify([]), null, 1, t(2), t(2));
  take.run('take-1', 'song-1', 'take-1.flac', 'warm indie, female vocal', 'line one\nline two', 183.5, 'acestep-v1.5', t(4));
  take.run('take-2', 'song-1', 'take-2.flac', '', '', null, null, t(5));

  // Song 2: a single bare part, no takes.
  song.run('song-2', 'Untitled', t(3), t(3));
  part.run('p2-verse', 'song-2', 'verse', '', 0, t(3), t(3));
  placement.run('pl2-1', 'song-2', 'p2-verse', 0, t(3));
  version.run('v2-verse', 'p2-verse', 1, JSON.stringify(['just one line']), null, 1, t(3), t(3));

  // Song 3: nothing in it yet.
  song.run('song-3', 'Empty — "quoted" \'title\'', t(4), t(4));

  preset.run('preset-1', 'Dream pop', 'hazy synths, reverb-heavy', 'female', t(1));
  preset.run('preset-2', 'Bare folk', 'acoustic guitar only', '', t(2));
  db.exec('COMMIT');
  db.close();
}

/** Every row of a table as plain objects, in rowid order, restricted to `columns` when given. */
export function dumpTable(db: DatabaseSync, table: string, columns?: string[]): Record<string, unknown>[] {
  const cols = columns ? columns.map((c) => `"${c}"`).join(', ') : '*';
  return db.prepare(`SELECT ${cols} FROM "${table}" ORDER BY rowid`).all().map((r) => ({ ...r }));
}

export const OLD_TABLES = ['songs', 'parts', 'part_placements', 'part_versions', 'song_takes', 'sound_presets'];

/** The columns each table had in the old shape. */
export function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as unknown as { name: string }[]).map((c) => c.name);
}
