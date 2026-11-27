import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { closeDatabase, initDatabase, transaction } from './schema';
import { SongService } from './songService';
import { PartService } from './partService';
import { PartPlacementService } from './partPlacementService';
import { PartVersionService } from './partVersionService';
import { SongTakeService } from './songTakeService';
import { SoundPresetService } from './soundPresetService';
import { importSong } from './songImportService';
import { createOldSqlJsDatabase } from './testing/oldSqlJsFixture';

// These need `uuid` from node_modules (npm ci), unlike sqlJsMigration.test.ts.

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackdraft-services-'));
  db = initDatabase(path.join(dir, 'trackdraft.db'));
});

afterEach(() => {
  closeDatabase(db);
  fs.rmSync(dir, { recursive: true, force: true });
});

function count(table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

test('song, part, version, activation, reorder and delete round trip with foreign keys enforced', () => {
  const songs = new SongService(db);
  const parts = new PartService(db);
  const placements = new PartPlacementService(db);
  const versions = new PartVersionService(db);

  const song = songs.createSong({ title: 'Round trip' });
  const updated = songs.updateSong(song.id, { styleNotes: 'dreamy', bpm: 96, coverStrength: null });
  assert.equal(updated.styleNotes, 'dreamy');
  assert.equal(updated.bpm, 96);
  assert.equal(songs.setSongHidden(song.id, true).isHidden, true);

  const verse = parts.createPart({ songId: song.id, partType: 'verse' });
  const chorus = parts.createPart({ songId: song.id, partType: 'chorus', noLyrics: false });
  const v1 = versions.createVersion({ partId: chorus.id, lines: ['la la'] });
  assert.equal(v1.isActive, true);
  const v2 = versions.duplicateVersion(v1.id);
  assert.equal(v2.versionNumber, 2);
  assert.equal(versions.getActiveVersionForPart(chorus.id)!.id, v2.id);
  assert.equal(versions.getVersionById(v1.id)!.isActive, false);
  assert.equal(versions.updateVersionRhymeScheme(v2.id, undefined as unknown as null).rhymeScheme, null);
  versions.updateVersionText(v2.id, ['la la', 'la']);

  const p1 = placements.createPlacement({ songId: song.id, partId: verse.id }, 0);
  const p2 = placements.createPlacement({ songId: song.id, partId: chorus.id }, 1);
  const p3 = placements.createPlacement({ songId: song.id, partId: chorus.id }, 2); // repeated chorus
  assert.deepEqual(placements.getPlacementsBySong(song.id).map((p) => p.id), [p1.id, p2.id, p3.id]);
  const reordered = placements.reorderPlacements(song.id, [p3.id, p1.id, p2.id]);
  assert.deepEqual(reordered.map((p) => p.id), [p3.id, p1.id, p2.id]);

  // Deleting one of two chorus placements keeps the part; deleting the last drops it.
  placements.deletePlacement(p2.id);
  assert.ok(parts.getPartById(chorus.id));
  placements.deletePlacement(p3.id);
  assert.equal(parts.getPartById(chorus.id), null);
  assert.equal(count('part_versions'), 0);

  versions.createVersion({ partId: verse.id, lines: ['x'] });
  new SongTakeService(db).createTake({
    songId: song.id,
    extension: 'flac',
    prompt: '',
    lyrics: '',
    durationSeconds: undefined as unknown as null,
    model: undefined as unknown as null,
  });
  songs.deleteSong(song.id);
  for (const t of ['songs', 'parts', 'part_placements', 'part_versions', 'song_takes']) assert.equal(count(t), 0, t);
});

test('foreign keys are enforced: a child of a missing parent is refused', () => {
  const parts = new PartService(db);
  assert.throws(() => parts.createPart({ songId: 'no-such-song', partType: 'verse' }), /FOREIGN KEY/);
  assert.equal(count('parts'), 0);
});

test('a failed multi-step write rolls back completely', () => {
  const songs = new SongService(db);
  const song = songs.createSong({ title: 'Keep me' });
  assert.throws(() =>
    transaction(db, () => {
      songs.updateSong(song.id, { title: 'Changed' });
      transaction(db, () => songs.createSong({ title: 'Nested' }));
      throw new Error('boom');
    })
  );
  assert.equal(songs.getSongById(song.id)!.title, 'Keep me');
  assert.equal(songs.getAllSongs().length, 1);
});

test('importSong is all or nothing', () => {
  const services = {
    db,
    songService: new SongService(db),
    partService: new PartService(db),
    partPlacementService: new PartPlacementService(db),
    partVersionService: new PartVersionService(db),
  };
  const song = importSong(services, {
    title: 'Imported',
    sections: [
      { partType: 'verse', customLabel: null, noLyrics: false, lines: ['a', 'b'], repeatOf: null },
      { partType: 'chorus', customLabel: null, noLyrics: false, lines: ['c'], repeatOf: null },
      { partType: 'chorus', customLabel: null, noLyrics: false, lines: ['c'], repeatOf: 1 },
    ],
  } as never);
  assert.equal(services.partPlacementService.getPlacementsBySong(song.id).length, 3);
  assert.equal(count('parts'), 2);

  assert.throws(() =>
    importSong(services, {
      title: 'Broken',
      sections: [
        { partType: 'verse', customLabel: null, noLyrics: false, lines: ['a'], repeatOf: null },
        { partType: {}, customLabel: null, noLyrics: false, lines: ['a'], repeatOf: null },
      ],
    } as never)
  );
  assert.equal(services.songService.getAllSongs().length, 1);
  assert.equal(count('parts'), 2);
});

test('takes and sound presets round trip', () => {
  const song = new SongService(db).createSong({ title: 'T' });
  const takes = new SongTakeService(db);
  const take = takes.createTake({ songId: song.id, extension: 'mp3', prompt: 'p', lyrics: 'l', durationSeconds: 12.5, model: 'm', seed: '7' });
  assert.equal(take.favorite, false);
  assert.equal(takes.updateTake(take.id, { favorite: true, name: '  Best  ', notes: 'n' })!.name, 'Best');
  takes.setFavorite([take.id], false);
  assert.equal(takes.getTakeById(take.id)!.favorite, false);

  const presets = new SoundPresetService(db);
  const a = presets.create({ name: 'Dream', styleNotes: 'x', vocalGender: 'female' });
  const b = presets.create({ name: 'dream', styleNotes: 'y', vocalGender: '' });
  assert.equal(a.id, b.id);
  assert.equal(presets.getAll().length, 1);
  presets.delete(a.id);
  assert.equal(presets.getAll().length, 0);
});

test('a migrated sql.js database works through the services', () => {
  closeDatabase(db);
  const file = path.join(dir, 'old.db');
  createOldSqlJsDatabase(file);
  db = initDatabase(file);
  const songs = new SongService(db);
  const versions = new PartVersionService(db);
  assert.deepEqual(songs.getAllSongs().map((s) => s.id).sort(), ['song-1', 'song-2', 'song-3']);
  assert.equal(versions.getActiveVersionForPart('p-chorus')!.id, 'v-chorus-2');
  assert.equal(new PartPlacementService(db).getPlacementsBySong('song-1').length, 5);
  songs.deleteSong('song-1');
  assert.equal(count('part_versions'), 1);
});
