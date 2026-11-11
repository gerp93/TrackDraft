import { VocalGender } from './song';

/** A saved "Sound" description (plus singing voice) that can be reused on any song. */
export interface SoundPreset {
  id: string;
  name: string;
  styleNotes: string;
  vocalGender: VocalGender;
  createdAt: string;
}

export interface CreateSoundPresetInput {
  name: string;
  styleNotes: string;
  vocalGender: VocalGender;
}
