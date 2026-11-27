import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import {
  NODE_SQLITE_USER_VERSION,
  prepareSqlJsMigration,
  verifySqlJsMigration,
} from './sqlJsMigration';

let dbInstance: DatabaseSync | null = null;

/**
 * Opens (creating if needed) the database at dbPath and brings its schema up to date.
 * Changes are written in place as they happen (WAL journal) -- there is no save step.
 * A database last written by the old sql.js engine is backed up, checked and carried over
 * first; see sqlJsMigration.ts. Throws, leaving the file untouched or rolled back, if
 * anything about that fails.
 */
export function initDatabase(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const plan = prepareSqlJsMigration(dbPath);

  const db = new DatabaseSync(dbPath);
  try {
    // Enforced for real now (sql.js's build never did): deleting a parent cascades to its
    // children, and inserting a child with a missing parent is refused.
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');

    // All schema steps, the migration's row-count check and the user_version marker commit
    // together -- if any of it fails the database is left exactly as it was.
    transaction(db, () => {
      applySchema(db);
      verifySqlJsMigration(db, plan);
      db.exec(`PRAGMA user_version = ${NODE_SQLITE_USER_VERSION}`);
    });
    // Only after that commit: the WAL header is itself read as "already migrated" by
    // prepareSqlJsMigration, so switching earlier would make a rolled-back attempt look done
    // and the next launch would skip the retry (and the backup check) it is promised.
    db.exec('PRAGMA journal_mode = WAL');
  } catch (err) {
    try {
      db.close();
    } catch {
      // already closed
    }
    throw err;
  }

  dbInstance = db;
  console.log('Database initialized at:', dbPath);
  return db;
}

function applySchema(db: DatabaseSync): void {
  db.exec(`
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
  db.exec(`
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
  addColumnIfMissing(db, 'parts', `no_lyrics INTEGER NOT NULL DEFAULT 0`);
  // Migration: parts created before per-section audio direction existed.
  addColumnIfMissing(db, 'parts', `direction TEXT NOT NULL DEFAULT ''`);

  // Migration: songs created before the style notes / notes fields existed.
  addColumnIfMissing(db, 'songs', `style_notes TEXT NOT NULL DEFAULT ''`);
  // Migration: songs created before the singing-voice choice existed.
  addColumnIfMissing(db, 'songs', `vocal_gender TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'songs', `notes TEXT NOT NULL DEFAULT ''`);
  // Migration: songs created before the privacy-screen (hide from song list) flag existed.
  addColumnIfMissing(db, 'songs', `is_hidden INTEGER NOT NULL DEFAULT 0`);
  // Migration: songs created before the generation inputs (tempo, key, time signature,
  // reference track) existed. NULL / '' mean "let the music model decide".
  addColumnIfMissing(db, 'songs', `bpm INTEGER`);
  addColumnIfMissing(db, 'songs', `key_scale TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'songs', `time_signature TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'songs', `reference_audio_path TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'songs', `cover_strength REAL`);

  db.exec(`
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

  db.exec(`
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
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_per_part
      ON part_versions(part_id) WHERE is_active = 1
  `);

  // Generated audio renditions of a song. Only metadata lives here -- the audio file is
  // in this device's app-data folder (see ai/takeStorage.ts), keyed by file_name.
  db.exec(`
    CREATE TABLE IF NOT EXISTS song_takes (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      lyrics TEXT NOT NULL DEFAULT '',
      duration_seconds REAL,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_song_takes_song ON song_takes(song_id)`);

  // Named "Sound" descriptions (style notes + voice) that can be reapplied to any song.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sound_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      style_notes TEXT NOT NULL,
      vocal_gender TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  // Migration: takes created before the model's seed was recorded.
  addColumnIfMissing(db, 'song_takes', `seed TEXT`);

  // Migration: take management (star, rename, notes).
  addColumnIfMissing(db, 'song_takes', `favorite INTEGER NOT NULL DEFAULT 0`);
  addColumnIfMissing(db, 'song_takes', `name TEXT`);
  addColumnIfMissing(db, 'song_takes', `notes TEXT NOT NULL DEFAULT ''`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_parts_song ON parts(song_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_part_versions_part ON part_versions(part_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_placements_song ON part_placements(song_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_placements_part ON part_placements(part_id)`);
}

/** ALTER TABLE ... ADD COLUMN errors if the column exists, so check first. columnDef is the
 * full definition ("name TYPE ..."); its first word is the column name. */
function addColumnIfMissing(db: DatabaseSync, table: string, columnDef: string): void {
  const name = columnDef.trim().split(/\s+/)[0];
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (columns.some((c) => c.name === name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
}

const transactionDepth = new WeakMap<DatabaseSync, number>();

/** Runs fn as one all-or-nothing write. Re-entrant: a call inside another transaction just
 * joins it (some read paths write, e.g. PartVersionService.getVersionsByPart's self-heal),
 * so only the outermost call begins, commits or rolls back. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const depth = transactionDepth.get(db) ?? 0;
  if (depth > 0) {
    transactionDepth.set(db, depth + 1);
    try {
      return fn();
    } finally {
      transactionDepth.set(db, depth);
    }
  }

  db.exec('BEGIN');
  transactionDepth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // the failure may already have ended the transaction
    }
    throw err;
  } finally {
    transactionDepth.set(db, 0);
  }
}

export function getDatabase(): DatabaseSync | null {
  return dbInstance;
}

/** Folds the WAL back into the main file and closes. Must run before anything copies the
 * database file (recent commits live in the -wal sidecar until then) and when the app quits. */
export function closeDatabase(db: DatabaseSync | null = dbInstance): void {
  if (!db) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.error('wal_checkpoint failed before close:', err);
  }
  try {
    db.close();
  } catch {
    // already closed
  }
  if (db === dbInstance) dbInstance = null;
}
