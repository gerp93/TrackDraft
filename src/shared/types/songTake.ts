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
  createdAt: string;
}

export interface GenerateSongOptions {
  /** Target length in seconds; null/undefined lets the model pick. */
  durationSeconds?: number | null;
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
