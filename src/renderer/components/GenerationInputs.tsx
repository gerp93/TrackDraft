import { useEffect, useState } from 'react';
import { DEFAULT_COVER_STRENGTH, Song, UpdateSongInput } from '../../shared/types/song';

/**
 * The musical inputs for the next generation: tempo, key, time signature, a sound-alike
 * reference track, and how far a restyle may stray from its source take. Every field is
 * optional -- blank leaves it to ACE-Step's language model, which plans these itself.
 *
 * Self-contained (loads and saves its own song fields by id) so the song page and the
 * audio panel don't have to thread five more props through; nothing else on the page
 * edits these columns.
 */

const BPM_MIN = 30;
const BPM_MAX = 300;

// One conventional spelling per pitch class. ACE-Step accepts note + '', '#' or 'b' +
// ' major'/' minor' (VALID_KEYSCALES in acestep/constants.py).
const KEY_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// The values the server takes are beats per bar; 6 means 6/8.
const TIME_SIGNATURES: { value: string; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: '2', label: '2/4' },
  { value: '3', label: '3/4' },
  { value: '4', label: '4/4' },
  { value: '6', label: '6/8' },
];

// Bands from ACE-Step's musicians guide: lower strays further from the source take.
const COVER_STRENGTHS: { value: number; label: string }[] = [
  { value: 0.8, label: 'Subtle' },
  { value: DEFAULT_COVER_STRENGTH, label: 'Balanced' },
  { value: 0.4, label: 'Dramatic' },
];

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

interface Props {
  songId: string;
  disabled: boolean;
}

export default function GenerationInputs({ songId, disabled }: Props) {
  const [song, setSong] = useState<Song | null>(null);
  const [bpmInput, setBpmInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSong(null);
    setError(null);
    window.electronAPI.songs.getById(songId).then((loaded: Song | null) => {
      if (cancelled || !loaded) return;
      setSong(loaded);
      setBpmInput(loaded.bpm ? String(loaded.bpm) : '');
    });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  if (!song) return null;

  async function save(input: UpdateSongInput) {
    setError(null);
    try {
      const updated: Song = await window.electronAPI.songs.update(songId, input);
      setSong(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function commitBpm() {
    const trimmed = bpmInput.trim();
    if (!trimmed) {
      if (song!.bpm !== null) save({ bpm: null });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setBpmInput(song!.bpm ? String(song!.bpm) : '');
      return;
    }
    // Clamp rather than reject: the server's own range, and an integer is all it takes.
    const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
    setBpmInput(String(bpm));
    if (bpm !== song!.bpm) save({ bpm });
  }

  async function chooseReference() {
    const chosen = await window.electronAPI.music.browseReferenceAudio();
    if (chosen) save({ referenceAudioPath: chosen });
  }

  const strength = song.coverStrength ?? DEFAULT_COVER_STRENGTH;

  return (
    <div className="gen-inputs">
      <div className="gen-inputs-row">
        <label className="gen-input">
          <span className="radio-group-label">Tempo</span>
          <input
            type="number"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            value={bpmInput}
            onChange={(e) => setBpmInput(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitBpm();
            }}
            placeholder="auto"
            disabled={disabled}
            className="gen-input-bpm"
          />
          bpm
        </label>

        <label className="gen-input">
          <span className="radio-group-label">Key</span>
          <select value={song.keyScale} onChange={(e) => save({ keyScale: e.target.value })} disabled={disabled}>
            <option value="">Auto</option>
            <optgroup label="Major">
              {KEY_NOTES.map((note) => (
                <option key={`${note} major`} value={`${note} major`}>
                  {note} major
                </option>
              ))}
            </optgroup>
            <optgroup label="Minor">
              {KEY_NOTES.map((note) => (
                <option key={`${note} minor`} value={`${note} minor`}>
                  {note} minor
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="gen-input">
          <span className="radio-group-label">Time</span>
          <select
            value={song.timeSignature}
            onChange={(e) => save({ timeSignature: e.target.value })}
            disabled={disabled}
          >
            {TIME_SIGNATURES.map((option) => (
              <option key={option.value || 'auto'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="gen-inputs-row">
        <span className="radio-group-label">Reference</span>
        {song.referenceAudioPath ? (
          <>
            <span className="gen-reference-name" title={song.referenceAudioPath}>
              {fileName(song.referenceAudioPath)}
            </span>
            <button className="btn gen-btn" onClick={chooseReference} disabled={disabled}>
              Change…
            </button>
            <button
              className="btn gen-btn"
              onClick={() => save({ referenceAudioPath: '' })}
              disabled={disabled}
              aria-label="Clear reference track"
            >
              Clear
            </button>
          </>
        ) : (
          <button
            className="btn gen-btn"
            onClick={chooseReference}
            disabled={disabled}
            title="A recording whose sound (timbre, production) new takes should resemble"
          >
            Choose track…
          </button>
        )}
      </div>

      <div className="gen-inputs-row">
        <label className="gen-input" title="How closely restyling a take keeps to that take">
          <span className="radio-group-label">Restyle</span>
          <select
            value={String(strength)}
            onChange={(e) => {
              const value = Number(e.target.value);
              save({ coverStrength: value === DEFAULT_COVER_STRENGTH ? null : value });
            }}
            disabled={disabled}
          >
            {COVER_STRENGTHS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="gen-inputs-error">{error}</p>}
    </div>
  );
}
