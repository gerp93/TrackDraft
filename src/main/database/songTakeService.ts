import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { SongTake, SongTakePatch } from '../../shared/types/songTake';
import { transaction } from './schema';

const SELECT_COLUMNS = `
  id,
  song_id as songId,
  file_name as fileName,
  prompt,
  lyrics,
  duration_seconds as durationSeconds,
  model,
  seed,
  favorite,
  name,
  notes,
  created_at as createdAt
`;

function rowToTake(obj: Record<string, any>): SongTake {
  return {
    id: obj.id,
    songId: obj.songId,
    fileName: obj.fileName,
    prompt: obj.prompt ?? '',
    lyrics: obj.lyrics ?? '',
    durationSeconds: obj.durationSeconds ?? null,
    model: obj.model ?? null,
    seed: obj.seed ?? null,
    favorite: !!obj.favorite,
    name: obj.name ?? null,
    notes: obj.notes ?? '',
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
  seed?: string | null;
}

export class SongTakeService {
  constructor(private db: DatabaseSync) {}

  getTakesBySong(songId: string): SongTake[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM song_takes WHERE song_id = ? ORDER BY created_at DESC`)
      .all(songId);
    return rows.map((row) => rowToTake(row));
  }

  getTakeById(id: string): SongTake | null {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM song_takes WHERE id = ?`).get(id);
    return row ? rowToTake(row) : null;
  }

  /** Reserves an id + file name; the caller writes the audio file before/after as it sees fit. */
  createTake(input: CreateSongTakeInput): SongTake {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO song_takes (id, song_id, file_name, prompt, lyrics, duration_seconds, model, seed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.songId,
        `${id}.${input.extension}`,
        input.prompt,
        input.lyrics,
        input.durationSeconds ?? null,
        input.model ?? null,
        input.seed ?? null,
        now
      );
    return this.getTakeById(id)!;
  }

  updateTake(id: string, patch: SongTakePatch): SongTake | null {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.favorite !== undefined) {
      sets.push('favorite = ?');
      values.push(patch.favorite ? 1 : 0);
    }
    if (patch.name !== undefined) {
      sets.push('name = ?');
      values.push(patch.name?.trim() ? patch.name.trim() : null);
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      values.push(patch.notes);
    }
    if (sets.length > 0) {
      this.db.prepare(`UPDATE song_takes SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }
    return this.getTakeById(id);
  }

  /** One transaction for the whole batch, so it is all or nothing. */
  setFavorite(ids: string[], favorite: boolean): void {
    transaction(this.db, () => {
      const update = this.db.prepare(`UPDATE song_takes SET favorite = ? WHERE id = ?`);
      for (const id of ids) update.run(favorite ? 1 : 0, id);
    });
  }

  deleteTake(id: string): void {
    this.db.prepare(`DELETE FROM song_takes WHERE id = ?`).run(id);
  }
}
