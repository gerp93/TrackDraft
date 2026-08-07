import { Database } from 'sql.js';
import { PartPlacement, CreatePlacementInput } from '../../shared/types/partPlacement';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase } from './schema';

function rowToPlacement(columns: string[], row: any[]): PartPlacement {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    songId: obj.songId,
    partId: obj.partId,
    orderIndex: obj.orderIndex,
    createdAt: obj.createdAt,
  };
}

const SELECT_COLUMNS = `
  id,
  song_id as songId,
  part_id as partId,
  order_index as orderIndex,
  created_at as createdAt
`;

export class PartPlacementService {
  constructor(private db: Database) {}

  getPlacementsBySong(songId: string): PartPlacement[] {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM part_placements WHERE song_id = ? ORDER BY order_index`);
    stmt.bind([songId]);
    const placements: PartPlacement[] = [];
    while (stmt.step()) {
      placements.push(rowToPlacement(stmt.getColumnNames(), stmt.get()));
    }
    stmt.free();
    return placements;
  }

  /** Inserts a placement referencing partId at atIndex, shifting later placements down.
   * partId may already have other placements elsewhere in the song -- that's a repeat. */
  createPlacement(input: CreatePlacementInput, atIndex: number): PartPlacement {
    const id = uuidv4();
    const now = new Date().toISOString();
    const existing = this.getPlacementsBySong(input.songId);
    const clampedIndex = Math.max(0, Math.min(atIndex, existing.length));

    this.db.run(`INSERT INTO part_placements (id, song_id, part_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)`, [
      id,
      input.songId,
      input.partId,
      clampedIndex,
      now,
    ]);

    const orderedIds = existing.map((p) => p.id);
    orderedIds.splice(clampedIndex, 0, id);
    this.reorderPlacements(input.songId, orderedIds);

    return this.getPlacementsBySong(input.songId).find((p) => p.id === id)!;
  }

  reorderPlacements(songId: string, orderedPlacementIds: string[]): PartPlacement[] {
    orderedPlacementIds.forEach((placementId, index) => {
      this.db.run(`UPDATE part_placements SET order_index = ? WHERE id = ? AND song_id = ?`, [
        index,
        placementId,
        songId,
      ]);
    });

    saveDatabase(this.db);

    return this.getPlacementsBySong(songId);
  }

  /** Removes this placement. If no other placement in the song still references its part,
   * the part (and its versions) is deleted too -- otherwise it's a repeat and stays live. */
  deletePlacement(id: string): void {
    const stmt = this.db.prepare(`SELECT part_id as partId FROM part_placements WHERE id = ?`);
    stmt.bind([id]);
    const found = stmt.step();
    const partId = found ? (stmt.get()[0] as string) : null;
    stmt.free();
    if (!partId) return;

    this.db.run(`DELETE FROM part_placements WHERE id = ?`, [id]);

    const countStmt = this.db.prepare(`SELECT COUNT(*) FROM part_placements WHERE part_id = ?`);
    countStmt.bind([partId]);
    countStmt.step();
    const remaining = countStmt.get()[0] as number;
    countStmt.free();

    if (remaining === 0) {
      // sql.js doesn't enforce ON DELETE CASCADE (see songService.deleteSong) -- clean up
      // the now-orphaned part's versions explicitly before dropping the part itself.
      this.db.run(`DELETE FROM part_versions WHERE part_id = ?`, [partId]);
      this.db.run(`DELETE FROM parts WHERE id = ?`, [partId]);
    }

    saveDatabase(this.db);
  }
}
