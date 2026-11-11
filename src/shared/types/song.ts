/** Who sings: '' leaves it to the music model. */
export type VocalGender = '' | 'female' | 'male';

export interface Song {
  id: string;
  title: string;
  /** The sound description sent to the music model (genre, mood, instruments). */
  styleNotes: string;
  vocalGender: VocalGender;
  notes: string;
  /** Privacy screen only (not encryption): hidden songs are left out of the song list
   * until the topbar eye toggle reveals them. */
  isHidden: boolean;
  /** Tempo for generation, 30-300; null leaves it to the music model. */
  bpm: number | null;
  /** Key for generation, e.g. "C major" / "F# minor"; '' leaves it to the model. */
  keyScale: string;
  /** Beats per bar for generation: '2', '3', '4' or '6' (6/8); '' leaves it to the model. */
  timeSignature: string;
  /** Absolute path of a sound-alike reference recording on this device; '' for none. */
  referenceAudioPath: string;
  /** How closely a restyle (cover) follows the source take, 0-1; null = the app default
   * (DEFAULT_COVER_STRENGTH). Lower = bigger genre change. */
  coverStrength: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongInput {
  title: string;
}

export interface UpdateSongInput {
  title?: string;
  styleNotes?: string;
  vocalGender?: VocalGender;
  notes?: string;
  bpm?: number | null;
  keyScale?: string;
  timeSignature?: string;
  referenceAudioPath?: string;
  coverStrength?: number | null;
}

/** Restyle strength when a song hasn't picked one: ACE-Step's guide puts moderate genre
 * changes (pop -> jazz) at 0.5-0.7. The server's own default, 1.0, barely changes the
 * source, which defeats the point of a restyle. */
export const DEFAULT_COVER_STRENGTH = 0.6;
