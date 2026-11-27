import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { CreateSoundPresetInput, SoundPreset } from '../../shared/types/soundPreset';
import { VocalGender } from '../../shared/types/song';

const SELECT_COLUMNS = `
  id,
  name,
  style_notes as styleNotes,
  vocal_gender as vocalGender,
  created_at as createdAt
`;

function rowToPreset(obj: Record<string, any>): SoundPreset {
  return {
    id: obj.id,
    name: obj.name,
    styleNotes: obj.styleNotes ?? '',
    vocalGender: (obj.vocalGender ?? '') as VocalGender,
    createdAt: obj.createdAt,
  };
}

export class SoundPresetService {
  constructor(private db: DatabaseSync) {}

  getAll(): SoundPreset[] {
    const rows = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM sound_presets ORDER BY name COLLATE NOCASE`).all();
    return rows.map((row) => rowToPreset(row));
  }

  getById(id: string): SoundPreset | null {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM sound_presets WHERE id = ?`).get(id);
    return row ? rowToPreset(row) : null;
  }

  /** Saves a preset; if one with the same name (case-insensitive) exists, its contents are replaced. */
  create(input: CreateSoundPresetInput): SoundPreset {
    const name = input.name.trim();
    const existing = this.db.prepare(`SELECT id FROM sound_presets WHERE name = ? COLLATE NOCASE`).get(name);
    const existingId = existing ? (existing.id as string) : null;

    if (existingId) {
      this.db
        .prepare(`UPDATE sound_presets SET name = ?, style_notes = ?, vocal_gender = ? WHERE id = ?`)
        .run(name, input.styleNotes ?? '', input.vocalGender ?? '', existingId);
      return this.getById(existingId)!;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO sound_presets (id, name, style_notes, vocal_gender, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, name, input.styleNotes ?? '', input.vocalGender ?? '', now);
    return this.getById(id)!;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM sound_presets WHERE id = ?`).run(id);
  }
}
