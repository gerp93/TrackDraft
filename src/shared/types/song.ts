/** Who sings: '' leaves it to the music model. */
export type VocalGender = '' | 'female' | 'male';

export interface Song {
  id: string;
  title: string;
  /** The sound description sent to the music model (genre, mood, instruments). */
  styleNotes: string;
  vocalGender: VocalGender;
  notes: string;
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
}
