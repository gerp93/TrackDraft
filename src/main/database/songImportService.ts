import { Song } from '../../shared/types/song';
import { ImportSongInput } from '../../shared/utils/songImport';
import { PartPlacementService } from './partPlacementService';
import { PartService } from './partService';
import { PartVersionService } from './partVersionService';
import { SongService } from './songService';

interface Services {
  songService: SongService;
  partService: PartService;
  partPlacementService: PartPlacementService;
  partVersionService: PartVersionService;
}

/** Creates a song from imported sections: each section becomes a Part with one version
 * holding its lines, placed in order; a section with `repeatOf` is placed again pointing
 * at the earlier section's Part instead (a repeated chorus). If anything fails partway,
 * the half-built song is deleted so no partial import is left behind. */
export function importSong(services: Services, input: ImportSongInput): Song {
  const title = input.title.trim() || 'Imported song';
  if (!input.sections.length) {
    throw new Error('Nothing to import -- no sections were found.');
  }

  const song = services.songService.createSong({ title });
  try {
    const partIdBySection: string[] = [];
    input.sections.forEach((section, i) => {
      const earlier = section.repeatOf !== null && section.repeatOf < i ? partIdBySection[section.repeatOf] : undefined;
      let partId = earlier;
      if (!partId) {
        const part = services.partService.createPart({
          songId: song.id,
          partType: section.partType,
          customLabel: section.partType === 'custom' ? section.customLabel : null,
          noLyrics: section.noLyrics,
        });
        services.partVersionService.createVersion({
          partId: part.id,
          lines: section.noLyrics ? [] : section.lines,
        });
        partId = part.id;
      }
      partIdBySection.push(partId);
      services.partPlacementService.createPlacement({ songId: song.id, partId }, i);
    });
  } catch (err) {
    services.songService.deleteSong(song.id);
    throw err;
  }
  return song;
}
