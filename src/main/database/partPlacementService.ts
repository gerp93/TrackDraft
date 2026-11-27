import { DatabaseSync } from 'node:sqlite';
import { PartPlacement, CreatePlacementInput } from '../../shared/types/partPlacement';
import { v4 as uuidv4 } from 'uuid';
import { transaction } from './schema';

function rowToPlacement(obj: Record<string, any>): PartPlacement {
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
  constructor(private db: DatabaseSync) {}

  getPlacementsBySong(songId: string): PartPlacement[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM part_placements WHERE song_id = ? ORDER BY order_index`)
      .all(songId);
    return rows.map((row) => rowToPlacement(row));
  }

  /** Inserts a placement referencing partId at atIndex, shifting later placements down.
   * partId may already have other placements elsewhere in the song -- that's a repeat. */
  createPlacement(input: CreatePlacementInput, atIndex: number): PartPlacement {
    const id = uuidv4();
    const now = new Date().toISOString();
    const existing = this.getPlacementsBySong(input.songId);
    const clampedIndex = Math.max(0, Math.min(atIndex, existing.length));

    transaction(this.db, () => {
      this.db
        .prepare(`INSERT INTO part_placements (id, song_id, part_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(id, input.songId, input.partId, clampedIndex, now);

      const orderedIds = existing.map((p) => p.id);
      orderedIds.splice(clampedIndex, 0, id);
      this.reorderPlacements(input.songId, orderedIds);
    });

    return this.getPlacementsBySong(input.songId).find((p) => p.id === id)!;
  }

  reorderPlacements(songId: string, orderedPlacementIds: string[]): PartPlacement[] {
    transaction(this.db, () => {
      const update = this.db.prepare(`UPDATE part_placements SET order_index = ? WHERE id = ? AND song_id = ?`);
      orderedPlacementIds.forEach((placementId, index) => {
        update.run(index, placementId, songId);
      });
    });

    return this.getPlacementsBySong(songId);
  }

  /** Removes this placement. If no other placement in the song still references its part,
   * the part (and its versions) is deleted too -- otherwise it's a repeat and stays live. */
  deletePlacement(id: string): void {
    const found = this.db.prepare(`SELECT part_id as partId FROM part_placements WHERE id = ?`).get(id);
    const partId = found ? (found.partId as string) : null;
    if (!partId) return;

    transaction(this.db, () => {
      this.db.prepare(`DELETE FROM part_placements WHERE id = ?`).run(id);

      const counted = this.db.prepare(`SELECT COUNT(*) AS n FROM part_placements WHERE part_id = ?`).get(partId);
      const remaining = Number(counted!.n);

      if (remaining === 0) {
        // Clean up the now-orphaned part's versions explicitly (see songService.deleteSong)
        // before dropping the part itself.
        this.db.prepare(`DELETE FROM part_versions WHERE part_id = ?`).run(partId);
        this.db.prepare(`DELETE FROM parts WHERE id = ?`).run(partId);
      }
    });
  }
}
