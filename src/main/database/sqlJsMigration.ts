import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';

/**
 * One-time carry-over of a database written by the old sql.js engine.
 *
 * sql.js's `db.export()` writes an ordinary SQLite file, so the existing `trackdraft.db` is
 * opened as-is by `node:sqlite` -- nothing is copied row by row. What this module adds is the
 * safety net around that first open: integrity check, a verified backup beside the file, and a
 * row-count comparison after the schema steps have run. `PRAGMA user_version` is the marker:
 * 0 (the default, which is what every sql.js file has) means "not yet opened by node:sqlite",
 * `NODE_SQLITE_USER_VERSION` means "done". No electron imports here, so it runs under plain node.
 */

/** Written to `PRAGMA user_version` once the node:sqlite engine has taken over a database. */
export const NODE_SQLITE_USER_VERSION = 1;

const SQLITE_HEADER = 'SQLite format 3\0';

export type SqlJsMigrationPlan =
  | { status: 'none' }
  | { status: 'already-migrated' }
  | {
      status: 'pending';
      /** The verified copy of the original made before anything touched it. */
      backupPath: string;
      /** Rows per table in the original (and the backup), to be matched after the schema runs. */
      tableCounts: Record<string, number>;
    };

export function sqlJsBackupPath(dbPath: string): string {
  return `${dbPath}.sqljs-backup`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function readHeader(dbPath: string): Buffer {
  const fd = fs.openSync(dbPath, 'r');
  try {
    const buf = Buffer.alloc(100);
    const n = fs.readSync(fd, buf, 0, 100, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function integrityIsOk(db: DatabaseSync): boolean {
  const rows = db.prepare('PRAGMA integrity_check').all() as unknown as { integrity_check: string }[];
  return rows.length === 1 && rows[0].integrity_check === 'ok';
}

export function tableRowCounts(db: DatabaseSync): Record<string, number> {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as unknown as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`).get() as unknown as { n: number };
    counts[name] = Number(row.n);
  }
  return counts;
}

function countsMatch(expected: Record<string, number>, actual: Record<string, number>): string | null {
  for (const [table, n] of Object.entries(expected)) {
    if (actual[table] !== n) {
      return `table "${table}" has ${actual[table] ?? 'no'} rows, expected ${n}`;
    }
  }
  return null;
}

/** Opens `file` read-only and returns why it is not a good copy of the original, or null if it is. */
function checkCopy(file: string, expected: Record<string, number>): string | null {
  let copy: DatabaseSync | null = null;
  try {
    copy = new DatabaseSync(file, { readOnly: true });
    if (!integrityIsOk(copy)) return 'its integrity check failed';
    return countsMatch(expected, tableRowCounts(copy));
  } catch (err) {
    return `it could not be opened (${err instanceof Error ? err.message : String(err)})`;
  } finally {
    try {
      copy?.close();
    } catch {
      // already closed
    }
  }
}

/**
 * Decides what the first open of `dbPath` has to do. Reads only (the file is opened read-only);
 * the one thing it writes is the backup copy, and only for a file that still needs migrating.
 * Throws -- leaving the original untouched -- if the file is not a healthy SQLite database.
 */
export function prepareSqlJsMigration(dbPath: string): SqlJsMigrationPlan {
  if (!fs.existsSync(dbPath)) return { status: 'none' };

  const size = fs.statSync(dbPath).size;
  // An empty file is what SQLite itself treats as a brand-new database.
  if (size === 0) return { status: 'none' };

  const header = readHeader(dbPath);
  if (header.length < 100 || header.toString('latin1', 0, 16) !== SQLITE_HEADER) {
    throw new Error(`${dbPath} is not a SQLite database file, so it was not opened or changed.`);
  }
  // Header bytes 18-19 are 2 in WAL mode. sql.js never wrote WAL, so this file was already
  // taken over by node:sqlite (even if a crash kept user_version from being checkpointed).
  if (header[18] === 2) return { status: 'already-migrated' };

  const original = new DatabaseSync(dbPath, { readOnly: true });
  let tableCounts: Record<string, number>;
  try {
    const row = original.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
    if (Number(row.user_version) >= NODE_SQLITE_USER_VERSION) return { status: 'already-migrated' };
    if (!integrityIsOk(original)) {
      throw new Error(`The integrity check of ${dbPath} failed, so it was not migrated or changed.`);
    }
    tableCounts = tableRowCounts(original);
  } finally {
    original.close();
  }

  // An earlier, interrupted attempt may have left its backup: keep it if it still matches the
  // original, otherwise never overwrite it -- write the new copy under a different name.
  let backupPath = sqlJsBackupPath(dbPath);
  if (fs.existsSync(backupPath)) {
    const problem = checkCopy(backupPath, tableCounts);
    if (!problem) {
      console.log('Reusing the existing sql.js backup at:', backupPath);
      return { status: 'pending', backupPath, tableCounts };
    }
    let n = Date.now();
    while (fs.existsSync((backupPath = `${sqlJsBackupPath(dbPath)}-${n}`))) n++;
    console.warn(`An existing backup was kept untouched (${problem}); the new one is ${backupPath}.`);
  }

  // Copy to a temp name and rename, so a half-written copy never looks like a backup.
  const tmpPath = `${backupPath}.tmp`;
  try {
    fs.copyFileSync(dbPath, tmpPath);
    const problem = checkCopy(tmpPath, tableCounts);
    if (problem) throw new Error(`The backup of ${dbPath} did not verify: ${problem}.`);
    fs.renameSync(tmpPath, backupPath);
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // nothing more to do
    }
    throw err;
  }
  console.log('Backed up the sql.js database to:', backupPath);
  return { status: 'pending', backupPath, tableCounts };
}

/**
 * Run after the schema steps, before they are committed: schema steps add columns and tables,
 * never rows, so every table's count must still match the original. Throws otherwise (the caller
 * rolls back and does not set user_version, so the next launch retries).
 */
export function verifySqlJsMigration(db: DatabaseSync, plan: SqlJsMigrationPlan): void {
  if (plan.status !== 'pending') return;
  const problem = countsMatch(plan.tableCounts, tableRowCounts(db));
  if (problem) {
    throw new Error(`The database changed during the update (${problem}). Its backup is at ${plan.backupPath}.`);
  }
  const fkProblems = db.prepare('PRAGMA foreign_key_check').all().length;
  console.log(
    `Migrated sql.js database: ${Object.keys(plan.tableCounts).length} tables, row counts unchanged; ` +
      `foreign_key_check reports ${fkProblems} row(s) (information only); backup at ${plan.backupPath}`
  );
}
