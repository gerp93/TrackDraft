import * as fs from 'fs';
import * as path from 'path';
import { SongTake } from '../../shared/types/songTake';
import { getTakePath } from './takeStorage';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MISSING_FILE = "The audio file for this take isn't on this device.";

/** Makes a string safe as a Windows file name (and harmless elsewhere). */
export function sanitizeFileName(name: string): string {
  let clean = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently drops trailing dots and spaces, which would change the name.
    .replace(/[. ]+$/, '');
  if (!clean || WINDOWS_RESERVED.test(clean)) clean = `_${clean}`;
  return clean.slice(0, 120);
}

export function takeExtension(take: SongTake): string {
  return path.extname(take.fileName).replace(/^\./, '') || 'flac';
}

/** "<song title> - <take name or Take N>.<ext>". `takeNumber` is 1 for the oldest take. */
export function exportFileName(songTitle: string, take: SongTake, takeNumber: number): string {
  const label = take.name?.trim() || `Take ${takeNumber}`;
  const base = sanitizeFileName(`${songTitle.trim() || 'Untitled'} - ${label}`);
  return `${base}.${takeExtension(take)}`;
}

/** Copies a take's file into `dir` without overwriting: a taken name gets " (2)", " (3)"... */
export function copyTakeIntoFolder(take: SongTake, dir: string, fileName: string): string {
  const source = getTakePath(take.fileName);
  if (!fs.existsSync(source)) throw new Error(MISSING_FILE);
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (let n = 1; ; n++) {
    const target = path.join(dir, n === 1 ? fileName : `${stem} (${n})${ext}`);
    try {
      // COPYFILE_EXCL makes the existence check and the copy one atomic step.
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      return target;
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
    }
  }
}

/** Copies to an exact path the user already confirmed in the save dialog (which asks
 * about overwriting itself). */
export function copyTakeTo(take: SongTake, target: string): void {
  const source = getTakePath(take.fileName);
  if (!fs.existsSync(source)) throw new Error(MISSING_FILE);
  fs.copyFileSync(source, target);
}
