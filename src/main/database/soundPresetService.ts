import { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { CreateSoundPresetInput, SoundPreset } from '../../shared/types/soundPreset';
import { VocalGender } from '../../shared/types/song';
import { saveDatabase } from './schema';

const SELECT_COLUMNS = `
  id,
  name,
  style_notes as styleNotes,
  vocal_gender as vocalGender,
  created_at as createdAt
`;

function rowToPreset(columns: string[], row: any[]): SoundPreset {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    name: obj.name,
    styleNotes: obj.styleNotes ?? '',
    vocalGender: (obj.vocalGender ?? '') as VocalGender,
    createdAt: obj.createdAt,
  };
}

export class SoundPresetService {
  constructor(private db: Database) {}

  getAll(): SoundPreset[] {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM sound_presets ORDER BY name COLLATE NOCASE`);
    const presets: SoundPreset[] = [];
    while (stmt.step()) presets.push(rowToPreset(stmt.getColumnNames(), stmt.get()));
    stmt.free();
    return presets;
  }

  getById(id: string): SoundPreset | null {
    const stmt = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM sound_presets WHERE id = ?`);
    stmt.bind([id]);
    const preset = stmt.step() ? rowToPreset(stmt.getColumnNames(), stmt.get()) : null;
    stmt.free();
    return preset;
  }

  /** Saves a preset; if one with the same name (case-insensitive) exists, its contents are replaced. */
  create(input: CreateSoundPresetInput): SoundPreset {
    const name = input.name.trim();
    const stmt = this.db.prepare(`SELECT id FROM sound_presets WHERE name = ? COLLATE NOCASE`);
    stmt.bind([name]);
    const existingId = stmt.step() ? (stmt.get()[0] as string) : null;
    stmt.free();

    if (existingId) {
      this.db.run(`UPDATE sound_presets SET name = ?, style_notes = ?, vocal_gender = ? WHERE id = ?`, [
        name,
        input.styleNotes,
        input.vocalGender,
        existingId,
      ]);
      saveDatabase(this.db);
      return this.getById(existingId)!;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO sound_presets (id, name, style_notes, vocal_gender, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, input.styleNotes, input.vocalGender, now]
    );
    saveDatabase(this.db);
    return this.getById(id)!;
  }

  delete(id: string): void {
    this.db.run(`DELETE FROM sound_presets WHERE id = ?`, [id]);
    saveDatabase(this.db);
  }
}
