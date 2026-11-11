import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

/**
 * Generated audio lives in this device's app-data folder, not next to the database:
 * the database can be pointed at a synced folder, and multi-megabyte audio files
 * (rewritten on every regenerate) don't belong in one by default. The database only
 * stores each take's file name; a take whose file isn't on this device shows as missing.
 */
export function getTakesDir(): string {
  return path.join(app.getPath('userData'), 'takes');
}

/** Resolves a stored file name to a path, refusing anything that isn't a bare file name. */
export function getTakePath(fileName: string): string {
  if (path.basename(fileName) !== fileName) {
    throw new Error('Invalid take file name.');
  }
  return path.join(getTakesDir(), fileName);
}

export function writeTakeFile(fileName: string, data: Buffer): void {
  fs.mkdirSync(getTakesDir(), { recursive: true });
  fs.writeFileSync(getTakePath(fileName), data);
}

export function readTakeFile(fileName: string): Buffer | null {
  const filePath = getTakePath(fileName);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

export function deleteTakeFile(fileName: string): void {
  const filePath = getTakePath(fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
