import initSqlJs, { Database } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { getEffectiveDbPath } from '../dbLocation';

let dbInstance: Database | null = null;
let currentDbPath: string | null = null;

export async function initDatabase(dbPath?: string): Promise<Database> {
  const SQL = await initSqlJs();
  dbPath = dbPath ?? getEffectiveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  let db: Database;

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  dbInstance = db;
  currentDbPath = dbPath;

  // Harmless to set, but sql.js's bundled SQLite build doesn't actually enforce this --
  // PRAGMA foreign_keys reads back as 0 regardless -- so ON DELETE CASCADE never fires.
  // Every service that deletes a row with dependents cleans them up explicitly instead.
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // "parts" are content records (versioned lyric text); a song's visible arrangement is
  // the separate part_placements table below, so the same part can appear more than once
  // (a repeated chorus) without duplicating its content.
  db.run(`
    CREATE TABLE IF NOT EXISTS parts (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      part_type TEXT NOT NULL DEFAULT 'custom',
      label TEXT NOT NULL,
      no_lyrics INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
  `);

  // Migration: parts created before the no-lyrics (instrumental section) flag existed.
  try {
    db.run(`ALTER TABLE parts ADD COLUMN no_lyrics INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    // already exists
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS part_placements (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      part_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
    )
  `);

  // No migration path from the pre-part_type/part_placements shape (parts.order_index
  // NOT NULL, no default) -- this app has no released installs yet, so a database still on
  // that shape just needs resetting (Settings -> Database Location -> Reset to Default, or
  // delete the .db file) rather than an in-place migration.

  db.run(`
    CREATE TABLE IF NOT EXISTS part_versions (
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
    )
  `);

  // Enforces "one active version per part" at the DB level, not just in service code.
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_per_part
      ON part_versions(part_id) WHERE is_active = 1
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_parts_song ON parts(song_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_part_versions_part ON part_versions(part_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_placements_song ON part_placements(song_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_placements_part ON part_placements(part_id)`);

  saveDatabase(db, dbPath);

  console.log('Database initialized at:', dbPath);

  return db;
}

export function saveDatabase(db: Database, dbPath?: string): void {
  if (!dbPath) {
    dbPath = currentDbPath ?? getEffectiveDbPath();
  }
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function getDatabase(): Database | null {
  return dbInstance;
}
