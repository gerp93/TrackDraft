import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { closeDatabase, initDatabase } from './schema';
import {
  NODE_SQLITE_USER_VERSION,
  prepareSqlJsMigration,
  sqlJsBackupPath,
  verifySqlJsMigration,
} from './sqlJsMigration';
import { OLD_TABLES, columnsOf, createOldSqlJsDatabase, dumpTable } from './testing/oldSqlJsFixture';

let dir: string;
let dbFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackdraft-migration-'));
  dbFile = path.join(dir, 'RolePlay', 'trackdraft.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function scalar(db: DatabaseSync, sql: string): unknown {
  const row = db.prepare(sql).get() as Record<string, unknown>;
  return Object.values(row)[0];
}

function snapshot(file: string): Record<string, Record<string, unknown>[]> {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const table of OLD_TABLES) out[table] = dumpTable(db, table);
    return out;
  } finally {
    db.close();
  }
}

test('an sql.js database keeps every row and value, gains the new columns, and is backed up', () => {
  createOldSqlJsDatabase(dbFile);
  const originalBytes = fs.readFileSync(dbFile);
  const before = snapshot(dbFile);
  assert.ok(before.songs.length === 3 && before.part_placements.length === 6);

  const db = initDatabase(dbFile);
  try {
    // Every original column of every original row is identical.
    for (const table of OLD_TABLES) {
      const oldColumns = Object.keys(before[table][0] ?? {});
      const after = dumpTable(db, table, oldColumns);
      assert.deepEqual(after, before[table], `table ${table} changed`);
    }

    // New columns exist with their defaults.
    const songColumns = columnsOf(db, 'songs');
    for (const c of ['style_notes', 'vocal_gender', 'notes', 'is_hidden', 'bpm', 'key_scale', 'time_signature', 'reference_audio_path', 'cover_strength']) {
      assert.ok(songColumns.includes(c), `songs.${c} missing`);
    }
    assert.ok(columnsOf(db, 'parts').includes('direction'));
    for (const c of ['seed', 'favorite', 'name', 'notes']) assert.ok(columnsOf(db, 'song_takes').includes(c));
    const song = db.prepare(`SELECT * FROM songs WHERE id = 'song-1'`).get() as Record<string, unknown>;
    assert.equal(song.style_notes, '');
    assert.equal(song.is_hidden, 0);
    assert.equal(song.bpm, null);
    assert.equal(song.cover_strength, null);
    const take = db.prepare(`SELECT * FROM song_takes WHERE id = 'take-1'`).get() as Record<string, unknown>;
    assert.equal(take.favorite, 0);
    assert.equal(take.notes, '');
    assert.equal(take.seed, null);
    assert.equal(db.prepare(`SELECT direction FROM parts WHERE id = 'p-chorus'`).get()!.direction, '');

    assert.equal(scalar(db, 'PRAGMA user_version'), NODE_SQLITE_USER_VERSION);
    assert.equal(scalar(db, 'PRAGMA journal_mode'), 'wal');
    assert.equal(scalar(db, 'PRAGMA foreign_keys'), 1);
  } finally {
    closeDatabase(db);
  }

  // The backup is the original, byte for byte.
  assert.ok(fs.existsSync(sqlJsBackupPath(dbFile)));
  assert.ok(fs.readFileSync(sqlJsBackupPath(dbFile)).equals(originalBytes));
  assert.equal(fs.existsSync(`${sqlJsBackupPath(dbFile)}.tmp`), false);
});

test('opening twice does nothing the second time and never rewrites the backup', () => {
  createOldSqlJsDatabase(dbFile);
  closeDatabase(initDatabase(dbFile));
  const backup = sqlJsBackupPath(dbFile);
  const backupBytes = fs.readFileSync(backup);
  const backupMtime = fs.statSync(backup).mtimeMs;

  assert.deepEqual(prepareSqlJsMigration(dbFile), { status: 'already-migrated' });
  const db = initDatabase(dbFile);
  closeDatabase(db);

  assert.ok(fs.readFileSync(backup).equals(backupBytes));
  assert.equal(fs.statSync(backup).mtimeMs, backupMtime);
  assert.deepEqual(fs.readdirSync(path.dirname(dbFile)).filter((f) => f.includes('backup')), ['trackdraft.db.sqljs-backup']);
});

test('a file that is not SQLite throws and is left untouched, with no backup', () => {
  const junk = Buffer.from('this is not a database, it is a text file\n'.repeat(10));
  fs.writeFileSync(dbFile, junk);
  assert.throws(() => initDatabase(dbFile), /not a SQLite database/);
  assert.ok(fs.readFileSync(dbFile).equals(junk));
  assert.deepEqual(fs.readdirSync(path.dirname(dbFile)), ['trackdraft.db']);
});

test('a pre-existing identical backup is kept as is and reused', () => {
  createOldSqlJsDatabase(dbFile);
  const backup = sqlJsBackupPath(dbFile);
  fs.copyFileSync(dbFile, backup);
  const mtime = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(backup, mtime, mtime);

  closeDatabase(initDatabase(dbFile));

  assert.equal(fs.statSync(backup).mtimeMs, mtime.getTime());
  assert.deepEqual(fs.readdirSync(path.dirname(dbFile)).filter((f) => f.includes('backup')), ['trackdraft.db.sqljs-backup']);
});

test('a pre-existing backup that does not match is never overwritten; a new one is written beside it', () => {
  createOldSqlJsDatabase(dbFile);
  const originalBytes = fs.readFileSync(dbFile);
  const backup = sqlJsBackupPath(dbFile);
  const stale = Buffer.from('an old, unrelated backup');
  fs.writeFileSync(backup, stale);

  closeDatabase(initDatabase(dbFile));

  assert.ok(fs.readFileSync(backup).equals(stale));
  const extra = fs.readdirSync(path.dirname(dbFile)).filter((f) => f.startsWith('trackdraft.db.sqljs-backup-'));
  assert.equal(extra.length, 1);
  assert.ok(fs.readFileSync(path.join(path.dirname(dbFile), extra[0])).equals(originalBytes));
});

test('an interrupted run (backup made, schema applied, user_version still 0) completes on retry', () => {
  createOldSqlJsDatabase(dbFile);
  const before = snapshot(dbFile);
  closeDatabase(initDatabase(dbFile));
  const backup = sqlJsBackupPath(dbFile);
  const backupBytes = fs.readFileSync(backup);

  // Put the file back the way a crash after the schema steps but before the marker would
  // leave it: new columns present, user_version 0, journal mode back to the default.
  const crashed = new DatabaseSync(dbFile);
  crashed.exec('PRAGMA journal_mode = DELETE');
  crashed.exec('PRAGMA user_version = 0');
  crashed.close();
  assert.equal(prepareSqlJsMigration(dbFile).status, 'pending');

  const db = initDatabase(dbFile);
  try {
    assert.equal(scalar(db, 'PRAGMA user_version'), NODE_SQLITE_USER_VERSION);
    for (const table of OLD_TABLES) {
      assert.deepEqual(dumpTable(db, table, Object.keys(before[table][0] ?? {})), before[table]);
    }
  } finally {
    closeDatabase(db);
  }
  assert.ok(fs.readFileSync(backup).equals(backupBytes));
});

test('a brand-new path creates a fresh database with user_version 1 and no backup', () => {
  assert.deepEqual(prepareSqlJsMigration(dbFile), { status: 'none' });
  const db = initDatabase(dbFile);
  try {
    assert.equal(scalar(db, 'PRAGMA user_version'), NODE_SQLITE_USER_VERSION);
    assert.equal(scalar(db, 'SELECT COUNT(*) FROM songs'), 0);
    assert.ok(columnsOf(db, 'songs').includes('bpm'));
  } finally {
    closeDatabase(db);
  }
  assert.deepEqual(fs.readdirSync(path.dirname(dbFile)).filter((f) => f.includes('backup')), []);
});

test('a corrupt database is refused, untouched, with no backup', () => {
  createOldSqlJsDatabase(dbFile);
  const bytes = fs.readFileSync(dbFile);
  // Keep page 1 (header and schema), wreck every other page.
  for (let i = 4096; i < bytes.length; i++) bytes[i] = 0xff;
  fs.writeFileSync(dbFile, bytes);
  assert.throws(() => initDatabase(dbFile));
  assert.ok(fs.readFileSync(dbFile).equals(bytes));
  assert.deepEqual(fs.readdirSync(path.dirname(dbFile)).filter((f) => f.includes('backup')), []);
});

test('a row-count mismatch after the schema steps throws, rolls back and leaves user_version unset', () => {
  createOldSqlJsDatabase(dbFile);
  const plan = prepareSqlJsMigration(dbFile);
  assert.equal(plan.status, 'pending');
  if (plan.status !== 'pending') return;

  const db = new DatabaseSync(dbFile);
  try {
    db.prepare(`DELETE FROM sound_presets WHERE id = 'preset-2'`).run();
    assert.throws(() => verifySqlJsMigration(db, plan), /sound_presets/);
    // Same plan on an untouched copy is fine.
    const ok = new DatabaseSync(sqlJsBackupPath(dbFile), { readOnly: true });
    verifySqlJsMigration(ok, plan);
    ok.close();
  } finally {
    db.close();
  }
});
