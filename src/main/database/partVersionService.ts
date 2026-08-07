import { Database } from 'sql.js';
import { PartVersion, CreatePartVersionInput } from '../../shared/types/partVersion';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase } from './schema';

function rowToPartVersion(columns: string[], row: any[]): PartVersion {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    partId: obj.partId,
    versionNumber: obj.versionNumber,
    lines: JSON.parse(obj.lines),
    rhymeScheme: obj.rhymeScheme ?? null,
    isActive: !!obj.isActive,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

const SELECT_COLUMNS = `
  id,
  part_id as partId,
  version_number as versionNumber,
  lines,
  rhyme_scheme as rhymeScheme,
  is_active as isActive,
  created_at as createdAt,
  updated_at as updatedAt
`;

export class PartVersionService {
  constructor(private db: Database) {}

  getVersionsByPart(partId: string): PartVersion[] {
    const stmt = this.db.prepare(
      `SELECT ${SELECT_COLUMNS} FROM part_versions WHERE part_id = ? ORDER BY version_number`
    );
    stmt.bind([partId]);
    const versions: PartVersion[] = [];
    while (stmt.step()) {
      versions.push(rowToPartVersion(stmt.getColumnNames(), stmt.get()));
    }
    stmt.free();
    return this.ensureLatestIsActive(partId, versions);
  }

  /** Self-heals rows written before active-always-tracks-latest was enforced at write time
   * (or any other drift) -- every read re-checks the invariant instead of trusting history. */
  private ensureLatestIsActive(partId: string, versions: PartVersion[]): PartVersion[] {
    if (versions.length === 0) return versions;
    const latest = versions.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a));
    if (latest.isActive) return versions;

    const now = new Date().toISOString();
    this.db.run(`UPDATE part_versions SET is_active = 0, updated_at = ? WHERE part_id = ? AND is_active = 1`, [
      now,
      partId,
    ]);
    this.db.run(`UPDATE part_versions SET is_active = 1, updated_at = ? WHERE id = ?`, [now, latest.id]);
    saveDatabase(this.db);

    return versions.map((v) => ({ ...v, isActive: v.id === latest.id }));
  }

  getVersionById(id: string): PartVersion | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM part_versions WHERE id = ?`);
    stmt.bind([id]);
    const version = stmt.step() ? rowToPartVersion(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return version;
  }

  getActiveVersionForPart(partId: string): PartVersion | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM part_versions WHERE part_id = ? AND is_active = 1`);
    stmt.bind([partId]);
    const version = stmt.step() ? rowToPartVersion(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return version;
  }

  /** One PartVersion per part in the song -- the shape a future AI-context assembler needs. */
  getActiveVersionsForSong(songId: string): PartVersion[] {
    const stmt = this.db.prepare(`
      SELECT pv.id, pv.part_id as partId, pv.version_number as versionNumber, pv.lines,
             pv.rhyme_scheme as rhymeScheme, pv.is_active as isActive,
             pv.created_at as createdAt, pv.updated_at as updatedAt
      FROM part_versions pv
      JOIN parts p ON p.id = pv.part_id
      WHERE p.song_id = ? AND pv.is_active = 1
      ORDER BY p.created_at
    `);
    stmt.bind([songId]);
    const versions: PartVersion[] = [];
    while (stmt.step()) {
      versions.push(rowToPartVersion(stmt.getColumnNames(), stmt.get()));
    }
    stmt.free();
    return versions;
  }

  /** One PartVersion per part in the song -- whichever has the highest version_number,
   * i.e. the one currently editable. Used for the live full-song preview. */
  getLatestVersionsForSong(songId: string): PartVersion[] {
    const stmt = this.db.prepare(`
      SELECT pv.id, pv.part_id as partId, pv.version_number as versionNumber, pv.lines,
             pv.rhyme_scheme as rhymeScheme, pv.is_active as isActive,
             pv.created_at as createdAt, pv.updated_at as updatedAt
      FROM part_versions pv
      JOIN parts p ON p.id = pv.part_id
      WHERE p.song_id = ?
      ORDER BY pv.part_id, pv.version_number DESC
    `);
    stmt.bind([songId]);
    const seenPartIds = new Set<string>();
    const versions: PartVersion[] = [];
    while (stmt.step()) {
      const version = rowToPartVersion(stmt.getColumnNames(), stmt.get());
      if (!seenPartIds.has(version.partId)) {
        seenPartIds.add(version.partId);
        versions.push(version);
      }
    }
    stmt.free();
    return versions;
  }

  /** Blank version; auto-activates only if it's the part's first version. */
  createVersion(input: CreatePartVersionInput): PartVersion {
    const id = uuidv4();
    const now = new Date().toISOString();
    const existing = this.getVersionsByPart(input.partId);
    const nextVersionNumber = existing.length === 0 ? 1 : Math.max(...existing.map((v) => v.versionNumber)) + 1;
    const isFirst = existing.length === 0;

    this.db.run(
      `INSERT INTO part_versions (id, part_id, version_number, lines, rhyme_scheme, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.partId,
        nextVersionNumber,
        JSON.stringify(input.lines ?? []),
        input.rhymeScheme ?? null,
        isFirst ? 1 : 0,
        now,
        now,
      ]
    );

    saveDatabase(this.db);

    return this.getVersionById(id)!;
  }

  /** "Duplicate as new version" -- copies lines+rhymeScheme into a new, always-active version.
   * Active and latest are the same concept in this app (only the latest is editable), so
   * whatever you just duplicated to becomes the one in effect immediately. */
  duplicateVersion(versionId: string): PartVersion {
    const source = this.getVersionById(versionId);
    if (!source) {
      throw new Error(`PartVersion with id ${versionId} not found`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const existing = this.getVersionsByPart(source.partId);
    const nextVersionNumber = Math.max(...existing.map((v) => v.versionNumber)) + 1;

    // Deactivate the current active row first -- the partial unique index on is_active=1
    // would reject inserting a second active row otherwise.
    this.db.run(`UPDATE part_versions SET is_active = 0, updated_at = ? WHERE part_id = ? AND is_active = 1`, [
      now,
      source.partId,
    ]);
    this.db.run(
      `INSERT INTO part_versions (id, part_id, version_number, lines, rhyme_scheme, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, source.partId, nextVersionNumber, JSON.stringify(source.lines), source.rhymeScheme, now, now]
    );

    saveDatabase(this.db);

    return this.getVersionById(id)!;
  }

  updateVersionText(id: string, lines: string[]): PartVersion {
    const existing = this.getVersionById(id);
    if (!existing) {
      throw new Error(`PartVersion with id ${id} not found`);
    }

    const now = new Date().toISOString();
    this.db.run(`UPDATE part_versions SET lines = ?, updated_at = ? WHERE id = ?`, [
      JSON.stringify(lines),
      now,
      id,
    ]);
    saveDatabase(this.db);

    return this.getVersionById(id)!;
  }

  updateVersionRhymeScheme(id: string, rhymeScheme: string | null): PartVersion {
    const existing = this.getVersionById(id);
    if (!existing) {
      throw new Error(`PartVersion with id ${id} not found`);
    }

    const now = new Date().toISOString();
    this.db.run(`UPDATE part_versions SET rhyme_scheme = ?, updated_at = ? WHERE id = ?`, [
      rhymeScheme,
      now,
      id,
    ]);
    saveDatabase(this.db);

    return this.getVersionById(id)!;
  }

  /** Blocked if it's the part's only version. If it was active, promotes the most recent remaining version. */
  deleteVersion(id: string): void {
    const existing = this.getVersionById(id);
    if (!existing) return;

    const siblings = this.getVersionsByPart(existing.partId);
    if (siblings.length <= 1) {
      throw new Error('Cannot delete a part\'s only version');
    }

    this.db.run(`DELETE FROM part_versions WHERE id = ?`, [id]);

    if (existing.isActive) {
      const remaining = siblings.filter((v) => v.id !== id);
      const mostRecent = remaining.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a));
      const now = new Date().toISOString();
      this.db.run(`UPDATE part_versions SET is_active = 1, updated_at = ? WHERE id = ?`, [now, mostRecent.id]);
    }

    saveDatabase(this.db);
  }
}
