import { Database } from 'sql.js';
import { Song, CreateSongInput, UpdateSongInput } from '../../shared/types/song';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase } from './schema';

function rowToSong(columns: string[], row: any[]): Song {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    title: obj.title,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

const SELECT_COLUMNS = `
  id,
  title,
  created_at as createdAt,
  updated_at as updatedAt
`;

export class SongService {
  constructor(private db: Database) {}

  getAllSongs(): Song[] {
    const results = this.db.exec(`SELECT ${SELECT_COLUMNS} FROM songs ORDER BY title COLLATE NOCASE`);
    if (results.length === 0) return [];
    return results[0].values.map((row) => rowToSong(results[0].columns, row));
  }

  getSongById(id: string): Song | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM songs WHERE id = ?`);
    stmt.bind([id]);
    const song = stmt.step() ? rowToSong(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return song;
  }

  createSong(input: CreateSongInput): Song {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(`INSERT INTO songs (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`, [
      id,
      input.title,
      now,
      now,
    ]);

    saveDatabase(this.db);

    return this.getSongById(id)!;
  }

  updateSong(id: string, input: UpdateSongInput): Song {
    const existing = this.getSongById(id);
    if (!existing) {
      throw new Error(`Song with id ${id} not found`);
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }

    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);

    this.db.run(`UPDATE songs SET ${updates.join(', ')} WHERE id = ?`, params);
    saveDatabase(this.db);

    return this.getSongById(id)!;
  }

  deleteSong(id: string): void {
    // sql.js's SQLite build doesn't actually enforce "PRAGMA foreign_keys = ON" (it reports
    // 0/off regardless), so ON DELETE CASCADE never fires -- clean up children explicitly,
    // child tables first.
    this.db.run(`DELETE FROM part_versions WHERE part_id IN (SELECT id FROM parts WHERE song_id = ?)`, [id]);
    this.db.run(`DELETE FROM part_placements WHERE song_id = ?`, [id]);
    this.db.run(`DELETE FROM parts WHERE song_id = ?`, [id]);
    this.db.run(`DELETE FROM songs WHERE id = ?`, [id]);
    saveDatabase(this.db);
  }
}
