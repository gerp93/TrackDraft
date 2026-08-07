import { Database } from 'sql.js';
import { Part, CreatePartInput, UpdatePartInput } from '../../shared/types/part';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase } from './schema';

function rowToPart(columns: string[], row: any[]): Part {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    songId: obj.songId,
    partType: obj.partType,
    customLabel: obj.partType === 'custom' ? obj.label : null,
    noLyrics: !!obj.noLyrics,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

const SELECT_COLUMNS = `
  id,
  song_id as songId,
  part_type as partType,
  label,
  no_lyrics as noLyrics,
  created_at as createdAt,
  updated_at as updatedAt
`;

export class PartService {
  constructor(private db: Database) {}

  getPartsBySong(songId: string): Part[] {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM parts WHERE song_id = ?`);
    stmt.bind([songId]);
    const parts: Part[] = [];
    while (stmt.step()) {
      parts.push(rowToPart(stmt.getColumnNames(), stmt.get()));
    }
    stmt.free();
    return parts;
  }

  getPartById(id: string): Part | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM parts WHERE id = ?`);
    stmt.bind([id]);
    const part = stmt.step() ? rowToPart(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return part;
  }

  createPart(input: CreatePartInput): Part {
    const id = uuidv4();
    const now = new Date().toISOString();
    const label = input.partType === 'custom' ? input.customLabel?.trim() || 'Untitled' : '';

    this.db.run(
      `INSERT INTO parts (id, song_id, part_type, label, no_lyrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.songId, input.partType, label, input.noLyrics ? 1 : 0, now, now]
    );

    saveDatabase(this.db);

    return this.getPartById(id)!;
  }

  updatePart(id: string, input: UpdatePartInput): Part {
    const existing = this.getPartById(id);
    if (!existing) {
      throw new Error(`Part with id ${id} not found`);
    }

    const now = new Date().toISOString();

    // customLabel is only meaningful for custom-type parts -- preset types compute their
    // label from part_type.
    if (input.customLabel !== undefined) {
      const label = input.customLabel?.trim() || 'Untitled';
      this.db.run(`UPDATE parts SET label = ?, updated_at = ? WHERE id = ?`, [label, now, id]);
    }

    if (input.noLyrics !== undefined) {
      this.db.run(`UPDATE parts SET no_lyrics = ?, updated_at = ? WHERE id = ?`, [
        input.noLyrics ? 1 : 0,
        now,
        id,
      ]);
    }

    saveDatabase(this.db);

    return this.getPartById(id)!;
  }

  deletePart(id: string): void {
    // See songService.deleteSong -- sql.js doesn't enforce ON DELETE CASCADE, so children
    // are cleaned up explicitly.
    this.db.run(`DELETE FROM part_versions WHERE part_id = ?`, [id]);
    this.db.run(`DELETE FROM part_placements WHERE part_id = ?`, [id]);
    this.db.run(`DELETE FROM parts WHERE id = ?`, [id]);
    saveDatabase(this.db);
  }
}
