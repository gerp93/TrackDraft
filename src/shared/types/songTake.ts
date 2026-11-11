/** One generated audio rendition of a song. The row lives in the database; the audio
 * file itself lives in this device's app-data folder (see takeStorage.ts). */
export interface SongTake {
  id: string;
  songId: string;
  /** File name only (no directory) inside the takes folder. */
  fileName: string;
  /** The style description sent to the music model. */
  prompt: string;
  /** The exact lyrics text sent to the music model. */
  lyrics: string;
  /** Length the model reported, in seconds; null if it didn't say. */
  durationSeconds: number | null;
  model: string | null;
  /** The random seed the model used, when it reported one -- lets a take be regenerated
   * with the same starting point. */
  seed: string | null;
  /** Starred by the user. */
  favorite: boolean;
  /** Custom name; null means the take is shown as "Take N". */
  name: string | null;
  /** Free-form notes about this take. */
  notes: string;
  createdAt: string;
}

/** The user-editable fields of a take. */
export interface SongTakePatch {
  favorite?: boolean;
  /** Empty or whitespace-only clears the custom name. */
  name?: string | null;
  notes?: string;
}

/** Outcome of exporting takes' audio files. */
export interface TakeExportResult {
  /** False when the user cancelled the dialog. */
  chosen: boolean;
  /** Where the file (or folder, for several) went. */
  path: string | null;
  saved: number;
  /** Per-take failures, e.g. an audio file that isn't on this device. */
  errors: string[];
}

export interface GenerateSongOptions {
  /** Target length in seconds; null/undefined lets the model pick. */
  durationSeconds?: number | null;
  /** Use this exact seed instead of a random one (see SongTake.seed). */
  seed?: string | null;
  /** Restyle an existing take: keep its melody and structure, apply the song's current
   * sound settings (ACE-Step's "cover" task). The id of the take to use as the source. */
  coverOfTakeId?: string | null;
}

/** State of the local ACE-Step server, as far as this app can tell. */
export interface AceStepServerStatus {
  /** Something is answering at the configured URL. */
  reachable: boolean;
  /** This app is in the middle of starting it. */
  starting: boolean;
  /** The running server was started by this app (so this app may stop it). */
  managed: boolean;
  /** An install folder is set and the URL is local, so this app is able to start it. */
  canStart: boolean;
  /** Why the last start attempt failed, if it did. */
  lastError: string | null;
}

/** A generation that is still running, so the UI can show it after a remount. */
export interface SongGenerationStatus {
  songId: string;
  startedAt: string;
  /** 0..1 as reported by the music server (may stay 0 on servers that don't report it). */
  progress: number;
  stage: string;
}
