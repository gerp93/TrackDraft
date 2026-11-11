import { PartPlacementService } from '../database/partPlacementService';
import { PartService } from '../database/partService';
import { PartVersionService } from '../database/partVersionService';
import { SongService } from '../database/songService';
import { SongTakeService } from '../database/songTakeService';
import { AiTestConnectionResult } from '../../shared/types/ai';
import { GenerateSongOptions, SongGenerationStatus, SongTake } from '../../shared/types/songTake';
import { buildMusicLyrics } from '../../shared/utils/musicLyrics';
import { getAiSettings } from './aiConfig';
import { aceStepDownload, aceStepHealth, aceStepPoll, aceStepSubmit } from './aceStepProvider';
import { deleteTakeFile, readTakeFile, writeTakeFile } from './takeStorage';

interface Services {
  songService: SongService;
  partPlacementService: PartPlacementService;
  partService: PartService;
  partVersionService: PartVersionService;
  songTakeService: SongTakeService;
}

const POLL_INTERVAL_MS = 2000;
/** A long song on a busy GPU can take several minutes; this only catches a hung server. */
const MAX_WAIT_MS = 30 * 60 * 1000;

/** Generations in flight, keyed by song -- kept in the main process so the song page
 * can pick a running one back up after the user navigates away and returns. */
const active = new Map<string, SongGenerationStatus>();

export function getActiveGeneration(songId: string): SongGenerationStatus | null {
  return active.get(songId) ?? null;
}

export async function testMusicConnection(): Promise<AiTestConnectionResult> {
  const { aceStepBaseUrl } = getAiSettings();
  try {
    await aceStepHealth(aceStepBaseUrl);
    return { ok: true, message: 'ACE-Step reachable.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateSong(
  services: Services,
  songId: string,
  options: GenerateSongOptions = {}
): Promise<SongTake[]> {
  const settings = getAiSettings();
  if (!settings.aiEnabled) {
    throw new Error('AI features are turned off -- enable them in Settings first.');
  }
  if (active.has(songId)) {
    throw new Error('This song is already being generated.');
  }

  const song = services.songService.getSongById(songId);
  if (!song) throw new Error('Song not found.');

  const prompt = song.styleNotes.trim();
  if (!prompt) {
    throw new Error('Describe the sound first -- genre, mood, instruments, vocal style.');
  }

  const placements = services.partPlacementService.getPlacementsBySong(songId);
  const parts = services.partService.getPartsBySong(songId);
  const latestByPartId: Record<string, ReturnType<PartVersionService['getLatestVersionsForSong']>[number]> = {};
  for (const v of services.partVersionService.getLatestVersionsForSong(songId)) latestByPartId[v.partId] = v;
  // No sections at all is a legitimate request for an instrumental.
  const lyrics = buildMusicLyrics(placements, parts, latestByPartId) || '[Instrumental]';

  const baseUrl = settings.aceStepBaseUrl;
  const status: SongGenerationStatus = {
    songId,
    startedAt: new Date().toISOString(),
    progress: 0,
    stage: 'queued',
  };
  active.set(songId, status);

  try {
    const taskId = await aceStepSubmit(baseUrl, { prompt, lyrics, durationSeconds: options.durationSeconds });

    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const poll = await aceStepPoll(baseUrl, taskId);
      if (poll.state === 'failed') throw new Error(poll.error ?? 'Generation failed.');
      if (poll.state === 'succeeded') {
        if (poll.results.length === 0) {
          throw new Error(`ACE-Step finished but returned no audio${poll.error ? `: ${poll.error}` : '.'}`);
        }
        const takes: SongTake[] = [];
        for (const result of poll.results) {
          const audio = await aceStepDownload(baseUrl, result.fileUrl);
          const extension = /\.([a-z0-9]{2,5})(?:$|[?&#])/i.exec(decodeURIComponent(result.fileUrl))?.[1] ?? 'flac';
          const take = services.songTakeService.createTake({
            songId,
            extension: extension.toLowerCase(),
            prompt,
            lyrics,
            durationSeconds: result.durationSeconds,
            model: result.model,
          });
          try {
            writeTakeFile(take.fileName, audio);
          } catch (err) {
            services.songTakeService.deleteTake(take.id);
            throw err;
          }
          takes.push(take);
        }
        return takes;
      }
      status.progress = poll.progress;
      status.stage = poll.stage;
      if (Date.now() > deadline) {
        throw new Error('Gave up waiting for ACE-Step after 30 minutes.');
      }
    }
  } finally {
    active.delete(songId);
  }
}

export function getTakeAudio(services: Pick<Services, 'songTakeService'>, takeId: string): Buffer | null {
  const take = services.songTakeService.getTakeById(takeId);
  return take ? readTakeFile(take.fileName) : null;
}

export function deleteTake(services: Pick<Services, 'songTakeService'>, takeId: string): void {
  const take = services.songTakeService.getTakeById(takeId);
  if (!take) return;
  deleteTakeFile(take.fileName);
  services.songTakeService.deleteTake(takeId);
}

/** Removes every take (rows and files) for a song that is about to be deleted. */
export function deleteTakesForSong(services: Pick<Services, 'songTakeService'>, songId: string): void {
  for (const take of services.songTakeService.getTakesBySong(songId)) {
    deleteTakeFile(take.fileName);
    services.songTakeService.deleteTake(take.id);
  }
}
