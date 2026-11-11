import { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { SongTake } from '../../shared/types/songTake';
import { saveDatabase } from './schema';

const SELECT_COLUMNS = `
  id,
  song_id as songId,
  file_name as fileName,
  prompt,
  lyrics,
  duration_seconds as durationSeconds,
  model,
  created_at as createdAt
`;

function rowToTake(columns: string[], row: any[]): SongTake {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    songId: obj.songId,
    fileName: obj.fileName,
    prompt: obj.prompt ?? '',
    lyrics: obj.lyrics ?? '',
    durationSeconds: obj.durationSeconds ?? null,
    model: obj.model ?? null,
    createdAt: obj.createdAt,
  };
}

export interface CreateSongTakeInput {
  songId: string;
  /** Extension without the dot, e.g. "mp3" -- the file name is derived from the new id. */
  extension: string;
  prompt: string;
  lyrics: string;
  durationSeconds: number | null;
  model: string | null;
}

export class SongTakeService {
  constructor(private db: Database) {}

  getTakesBySong(songId: string): SongTake[] {
    const stmt = this.db.prepare(
      `SELECT ${SELECT_COLUMNS} FROM song_takes WHERE song_id = ? ORDER BY created_at DESC`
    );
    stmt.bind([songId]);
    const takes: SongTake[] = [];
    while (stmt.step()) takes.push(rowToTake(stmt.getColumnNames(), stmt.get()));
    stmt.free();
    return takes;
  }

  getTakeById(id: string): SongTake | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM song_takes WHERE id = ?`);
    stmt.bind([id]);
    const take = stmt.step() ? rowToTake(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return take;
  }

  /** Reserves an id + file name; the caller writes the audio file before/after as it sees fit. */
  createTake(input: CreateSongTakeInput): SongTake {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO song_takes (id, song_id, file_name, prompt, lyrics, duration_seconds, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.songId, `${id}.${input.extension}`, input.prompt, input.lyrics, input.durationSeconds, input.model, now]
    );
    saveDatabase(this.db);
    return this.getTakeById(id)!;
  }

  deleteTake(id: string): void {
    this.db.run(`DELETE FROM song_takes WHERE id = ?`, [id]);
    saveDatabase(this.db);
  }
}
