import * as fs from 'fs';
import * as path from 'path';
import { PartPlacementService } from '../database/partPlacementService';
import { PartService } from '../database/partService';
import { PartVersionService } from '../database/partVersionService';
import { SongService } from '../database/songService';
import { SongTakeService } from '../database/songTakeService';
import { AiTestConnectionResult } from '../../shared/types/ai';
import { GenerateSongOptions, SongGenerationStatus, SongTake } from '../../shared/types/songTake';
import { buildMusicLyrics } from '../../shared/utils/musicLyrics';
import { DEFAULT_COVER_STRENGTH } from '../../shared/types/song';
import { getAiSettings } from './aiConfig';
import {
  AceStepAudioUpload,
  AceStepTaskInput,
  aceStepDownload,
  aceStepHealth,
  aceStepPoll,
  aceStepSubmit,
} from './aceStepProvider';
import { ensureAceStepServer, getAceStepServerStatus } from './aceStepServer';
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

/** The song's reference track, read from wherever the user picked it. It's a path on
 * this device (not a copy), so it can go missing if the file is moved or deleted. */
function readReferenceTrack(filePath: string): AceStepAudioUpload {
  try {
    return { fileName: path.basename(filePath), data: fs.readFileSync(filePath) };
  } catch {
    throw new Error(
      `The reference track "${path.basename(filePath)}" can't be read (moved or deleted?). Choose it again or clear it under Sound.`
    );
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

  const sound = song.styleNotes.trim();
  if (!sound) {
    throw new Error('Describe the sound first -- genre, mood, instruments, tempo.');
  }

  const placements = services.partPlacementService.getPlacementsBySong(songId);
  const parts = services.partService.getPartsBySong(songId);
  const latestByPartId: Record<string, ReturnType<PartVersionService['getLatestVersionsForSong']>[number]> = {};
  for (const v of services.partVersionService.getLatestVersionsForSong(songId)) latestByPartId[v.partId] = v;
  // No sections at all is a legitimate request for an instrumental.
  const lyrics = buildMusicLyrics(placements, parts, latestByPartId) || '[Instrumental]';
  // The voice choice only means something when there are words to sing.
  const hasWords = lyrics.split('\n').some((line) => line.trim() && !/^\[.+\]$/.test(line.trim()));
  const prompt = song.vocalGender && hasWords ? `${sound}, ${song.vocalGender} vocals` : sound;

  // Files are read up front so a missing one fails before anything is queued.
  const referenceAudio = song.referenceAudioPath ? readReferenceTrack(song.referenceAudioPath) : null;
  let cover: AceStepTaskInput['cover'] = null;
  // The server reports no metas (not even duration) for a cover; it keeps the source's length.
  let coverSourceDuration: number | null = null;
  if (options.coverOfTakeId) {
    const sourceTake = services.songTakeService.getTakeById(options.coverOfTakeId);
    if (!sourceTake || sourceTake.songId !== songId) throw new Error('The take to restyle no longer exists.');
    const data = readTakeFile(sourceTake.fileName);
    if (!data) throw new Error("The take to restyle has no audio file on this device, so it can't be restyled.");
    cover = {
      source: { fileName: sourceTake.fileName, data },
      strength: song.coverStrength ?? DEFAULT_COVER_STRENGTH,
    };
    coverSourceDuration = sourceTake.durationSeconds;
  }

  const baseUrl = settings.aceStepBaseUrl;
  const status: SongGenerationStatus = {
    songId,
    startedAt: new Date().toISOString(),
    progress: 0,
    stage: 'queued',
  };
  active.set(songId, status);

  try {
    // Start the server ourselves when it isn't running and we know where it lives;
    // otherwise fall through and let the submit report that it can't be reached.
    const server = await getAceStepServerStatus();
    if (!server.reachable && server.canStart) {
      status.stage = 'starting ACE-Step server';
      await ensureAceStepServer();
      status.stage = 'queued';
    }

    // A seeded run skips the server's planning step (see aceStepProvider), which is also
    // what would have chosen a length. Without one asked for, keep the length of the take
    // the seed came from so "same seed" doesn't quietly become a different-length song.
    const seedSourceDuration = options.seed
      ? services.songTakeService.getTakesBySong(songId).find((t) => t.seed === options.seed)?.durationSeconds ?? null
      : null;

    const taskId = await aceStepSubmit(baseUrl, {
      prompt,
      lyrics,
      // A restyle keeps the source take's length; asking for another one would cut or
      // pad it rather than restyle it.
      durationSeconds: cover ? null : options.durationSeconds ?? seedSourceDuration,
      seed: options.seed ?? null,
      bpm: song.bpm,
      keyScale: song.keyScale || null,
      timeSignature: song.timeSignature || null,
      referenceAudio,
      cover,
    });

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
            durationSeconds: result.durationSeconds ?? coverSourceDuration,
            model: result.model,
            seed: result.seed,
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
