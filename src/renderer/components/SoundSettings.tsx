import { VocalGender } from '../../shared/types/song';
import type { SongAudioState } from './SongAudio';
import GenerationInputs from './GenerationInputs';

const VOICE_OPTIONS: { value: VocalGender; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

interface Props {
  audio: SongAudioState;
  songId: string;
  styleNotes: string;
  onStyleNotesChange: (value: string) => void;
  onStyleNotesCommit: () => Promise<void>;
  vocalGender: VocalGender;
  onVocalGenderChange: (value: VocalGender) => Promise<void>;
  soundInputRef: React.RefObject<HTMLTextAreaElement>;
}

/** The "what should it sound like" half of the audio panel: everything that shapes the
 * next generation. Rendered at the top of AudioPanel (see SongAudio.tsx). */
export default function SoundSettings({
  audio,
  songId,
  styleNotes,
  onStyleNotesChange,
  onStyleNotesCommit,
  vocalGender,
  onVocalGenderChange,
  soundInputRef,
}: Props) {
  const generating = audio.status !== null;

  return (
    <>
      <div className="field">
        <label htmlFor="song-sound">Sound</label>
        <textarea
          id="song-sound"
          ref={soundInputRef}
          rows={3}
          style={{ width: '100%', resize: 'vertical', lineHeight: 1.5 }}
          value={styleNotes}
          onChange={(e) => onStyleNotesChange(e.target.value)}
          onBlur={() => onStyleNotesCommit()}
          placeholder="Genre, mood, instruments, tempo -- e.g. moody indie rock, 95 bpm"
        />
      </div>

      <div className="song-audio-options">
        <div role="radiogroup" aria-label="Singing voice" className="radio-group">
          <span className="radio-group-label">Voice</span>
          {VOICE_OPTIONS.map((option) => (
            <label key={option.value || 'auto'}>
              <input
                type="radio"
                name={`voice-${songId}`}
                checked={vocalGender === option.value}
                onChange={() => onVocalGenderChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <label className="song-audio-length">
          <span className="radio-group-label">Length</span>
          <input
            type="number"
            min={0.5}
            max={8}
            step={0.5}
            value={audio.durationInput}
            onChange={(e) => audio.setDurationInput(e.target.value)}
            placeholder="auto"
            disabled={generating}
          />
          min
        </label>
      </div>

      <GenerationInputs songId={songId} disabled={generating} />
    </>
  );
}
