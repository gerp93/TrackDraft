import { DatabaseSync } from 'node:sqlite';
import { Part, CreatePartInput, UpdatePartInput } from '../../shared/types/part';
import { v4 as uuidv4 } from 'uuid';
import { transaction } from './schema';
import { sanitizeDirection } from '../../shared/utils/partDirection';

function rowToPart(obj: Record<string, any>): Part {
  return {
    id: obj.id,
    songId: obj.songId,
    partType: obj.partType,
    customLabel: obj.partType === 'custom' ? obj.label : null,
    noLyrics: !!obj.noLyrics,
    direction: obj.direction ?? '',
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
  direction,
  created_at as createdAt,
  updated_at as updatedAt
`;

export class PartService {
  constructor(private db: DatabaseSync) {}

  getPartsBySong(songId: string): Part[] {
    const rows = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM parts WHERE song_id = ?`).all(songId);
    return rows.map((row) => rowToPart(row));
  }

  getPartById(id: string): Part | null {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM parts WHERE id = ?`).get(id);
    return row ? rowToPart(row) : null;
  }

  createPart(input: CreatePartInput): Part {
    const id = uuidv4();
    const now = new Date().toISOString();
    const label = input.partType === 'custom' ? input.customLabel?.trim() || 'Untitled' : '';

    this.db
      .prepare(
        `INSERT INTO parts (id, song_id, part_type, label, no_lyrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.songId, input.partType, label, input.noLyrics ? 1 : 0, now, now);

    return this.getPartById(id)!;
  }

  updatePart(id: string, input: UpdatePartInput): Part {
    const existing = this.getPartById(id);
    if (!existing) {
      throw new Error(`Part with id ${id} not found`);
    }

    const now = new Date().toISOString();

    transaction(this.db, () => {
      // customLabel is only meaningful for custom-type parts -- preset types compute their
      // label from part_type.
      if (input.customLabel !== undefined) {
        const label = input.customLabel?.trim() || 'Untitled';
        this.db.prepare(`UPDATE parts SET label = ?, updated_at = ? WHERE id = ?`).run(label, now, id);
      }

      if (input.noLyrics !== undefined) {
        this.db.prepare(`UPDATE parts SET no_lyrics = ?, updated_at = ? WHERE id = ?`).run(
          input.noLyrics ? 1 : 0,
          now,
          id
        );
      }

      if (input.direction !== undefined) {
        this.db.prepare(`UPDATE parts SET direction = ?, updated_at = ? WHERE id = ?`).run(
          sanitizeDirection(input.direction),
          now,
          id
        );
      }
    });

    return this.getPartById(id)!;
  }

  deletePart(id: string): void {
    // See songService.deleteSong -- children are deleted explicitly, in one transaction.
    transaction(this.db, () => {
      this.db.prepare(`DELETE FROM part_versions WHERE part_id = ?`).run(id);
      this.db.prepare(`DELETE FROM part_placements WHERE part_id = ?`).run(id);
      this.db.prepare(`DELETE FROM parts WHERE id = ?`).run(id);
    });
  }
}
