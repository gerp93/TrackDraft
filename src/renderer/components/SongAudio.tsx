import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VocalGender } from '../../shared/types/song';
import { SongGenerationStatus, SongTake } from '../../shared/types/songTake';
import { useAiSettings } from '../context/AiSettingsContext';
import AceStepServerControl from './AceStepServerControl';

/**
 * Song audio is split across two surfaces that share one state (useSongAudio):
 *
 * - AudioBar: a slim transport docked at the bottom of the Song tab -- Generate, the
 *   current take's player, and the button that opens the panel. Always in view, so a
 *   take can play while the lyrics are being read or edited.
 * - AudioPanel: the sound settings and the full takes list. A pinned third column on
 *   wide windows; a slide-out from the right on narrower ones (see index.css).
 */

const VOICE_OPTIONS: { value: VocalGender; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const AUDIO_MIME_TYPES: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  aac: 'audio/aac',
};

const STARTING_SERVER_STAGE = 'starting ACE-Step server';

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatTakeTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function takeMeta(take: SongTake): string {
  const length = take.durationSeconds ? ` · ${formatClock(take.durationSeconds * 1000)}` : '';
  return `${formatTakeTime(take.createdAt)}${length}`;
}

interface LoadedAudio {
  takeId: string;
  url: string;
}

export interface SongAudioState {
  aiEnabled: boolean;
  takes: SongTake[];
  /** Take number as shown to the user: 1 is the oldest. */
  takeNumber: (takeId: string) => number;
  currentTake: SongTake | null;
  selectTake: (takeId: string) => void;
  /** Loads (if needed) and plays a take in the bar's player. */
  playTake: (takeId: string) => Promise<void>;
  loaded: LoadedAudio | null;
  loadingTakeId: string | null;
  missingTakeIds: Set<string>;
  deleteTake: (take: SongTake) => Promise<void>;
  status: SongGenerationStatus | null;
  elapsedMs: number;
  error: string | null;
  durationInput: string;
  setDurationInput: (value: string) => void;
  canGenerate: boolean;
  generate: () => Promise<void>;
}

export function useSongAudio(
  songId: string,
  styleNotes: string,
  commitStyleNotes: () => Promise<void>
): SongAudioState {
  const { aiEnabled } = useAiSettings();
  const [takes, setTakes] = useState<SongTake[]>([]);
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedAudio | null>(null);
  const [loadingTakeId, setLoadingTakeId] = useState<string | null>(null);
  const [missingTakeIds, setMissingTakeIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SongGenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState('');
  const [now, setNow] = useState(Date.now());
  const loadedUrlRef = useRef<string | null>(null);

  function releaseAudio() {
    if (loadedUrlRef.current) URL.revokeObjectURL(loadedUrlRef.current);
    loadedUrlRef.current = null;
    setLoaded(null);
  }

  async function loadTakes(): Promise<SongTake[]> {
    const next = await window.electronAPI.music.getTakes(songId);
    setTakes(next);
    return next;
  }

  useEffect(() => {
    setError(null);
    setCurrentTakeId(null);
    setMissingTakeIds(new Set());
    releaseAudio();
    loadTakes();
    // A generation may already be running for this song (started before navigating away).
    window.electronAPI.music.getActive(songId).then(setStatus);
    return releaseAudio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // While a generation runs: tick the elapsed clock and follow the server's progress.
  // When it disappears from the main process, it finished (or failed) -- reload takes.
  useEffect(() => {
    if (!status) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const next = await window.electronAPI.music.getActive(songId);
      if (!next) {
        setStatus(null);
        loadTakes();
      } else {
        setStatus(next);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status !== null, songId]);

  // Newest first from the main process; the current take defaults to the newest.
  const currentTake = takes.find((t) => t.id === currentTakeId) ?? takes[0] ?? null;

  function selectTake(takeId: string) {
    if (takeId === currentTake?.id) return;
    setCurrentTakeId(takeId);
    releaseAudio();
  }

  async function playTake(takeId: string) {
    setCurrentTakeId(takeId);
    if (loaded?.takeId === takeId) return;
    releaseAudio();
    setLoadingTakeId(takeId);
    const bytes = await window.electronAPI.music.getTakeAudio(takeId);
    setLoadingTakeId(null);
    if (!bytes) {
      setMissingTakeIds((prev) => new Set(prev).add(takeId));
      return;
    }
    const take = takes.find((t) => t.id === takeId);
    const extension = take?.fileName.split('.').pop()?.toLowerCase() ?? '';
    const type = AUDIO_MIME_TYPES[extension] ?? 'audio/mpeg';
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
    loadedUrlRef.current = url;
    setLoaded({ takeId, url });
  }

  async function deleteTake(take: SongTake) {
    if (!confirm(`Delete take ${takeNumber(take.id)}? Its audio file is removed from this device.`)) return;
    if (loaded?.takeId === take.id) releaseAudio();
    if (currentTakeId === take.id) setCurrentTakeId(null);
    await window.electronAPI.music.deleteTake(take.id);
    loadTakes();
  }

  function takeNumber(takeId: string): number {
    const index = takes.findIndex((t) => t.id === takeId);
    return index === -1 ? 0 : takes.length - index;
  }

  async function generate() {
    setError(null);
    const minutes = Number(durationInput);
    const durationSeconds =
      durationInput.trim() && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
    await commitStyleNotes();
    setNow(Date.now());
    setStatus({ songId, startedAt: new Date().toISOString(), progress: 0, stage: 'queued' });
    try {
      const created = await window.electronAPI.music.generate(songId, { durationSeconds });
      // Put the new take in the player, ready to play -- without cutting off whatever
      // the user is listening to if they started another take while waiting.
      if (created[0] && !loaded) setCurrentTakeId(created[0].id);
    } catch (err) {
      // Electron prefixes errors thrown across IPC; keep only the message itself.
      const message = err instanceof Error ? err.message : String(err);
      setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setStatus(null);
      loadTakes();
    }
  }

  return {
    aiEnabled,
    takes,
    takeNumber,
    currentTake,
    selectTake,
    playTake,
    loaded,
    loadingTakeId,
    missingTakeIds,
    deleteTake,
    status,
    elapsedMs: status ? now - new Date(status.startedAt).getTime() : 0,
    error,
    durationInput,
    setDurationInput,
    canGenerate: aiEnabled && status === null && styleNotes.trim().length > 0,
    generate,
  };
}

function GenerateStatus({ audio }: { audio: SongAudioState }) {
  if (!audio.status) return null;
  const { progress, stage } = audio.status;
  return (
    <span className="text-muted audio-status" title={stage}>
      {formatClock(audio.elapsedMs)}
      {progress > 0 ? ` · ${Math.round(progress * 100)}%` : ''}
      {stage === STARTING_SERVER_STAGE ? ' · starting server' : ''}
    </span>
  );
}

interface BarProps {
  audio: SongAudioState;
  hasSound: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Called when Generate is pressed with no sound described yet. */
  onNeedSound: () => void;
}

export function AudioBar({ audio, hasSound, panelOpen, onTogglePanel, onNeedSound }: BarProps) {
  const { takes, currentTake, loaded, loadingTakeId, missingTakeIds } = audio;
  // Nothing to offer: AI is off and there are no earlier takes to play.
  if (!audio.aiEnabled && takes.length === 0) return null;

  const generating = audio.status !== null;
  const isLoaded = currentTake !== null && loaded?.takeId === currentTake.id;

  return (
    <div className="audio-bar">
      <div className="audio-bar-section">
        <button
          className="btn btn-primary"
          disabled={!audio.aiEnabled || generating}
          onClick={() => (hasSound ? audio.generate() : onNeedSound())}
          title={audio.aiEnabled ? undefined : 'Enable AI features in Settings to generate audio'}
        >
          {generating ? 'Generating…' : 'Generate Song'}
        </button>
        <GenerateStatus audio={audio} />
        {audio.error && !generating && (
          <span className="audio-bar-error" title={audio.error}>
            {audio.error}
          </span>
        )}
      </div>

      <div className="audio-bar-player">
        {currentTake ? (
          <>
            <select
              value={currentTake.id}
              onChange={(e) => audio.selectTake(e.target.value)}
              aria-label="Take to play"
              className="audio-bar-take-select"
            >
              {takes.map((take) => (
                <option key={take.id} value={take.id}>
                  Take {audio.takeNumber(take.id)} · {takeMeta(take)}
                </option>
              ))}
            </select>
            {isLoaded ? (
              <audio controls autoPlay src={loaded!.url} className="audio-bar-audio" />
            ) : missingTakeIds.has(currentTake.id) ? (
              <span className="text-muted" style={{ fontSize: 13 }}>
                This take's audio file isn't on this device.
              </span>
            ) : (
              <button
                className="btn"
                disabled={loadingTakeId === currentTake.id}
                onClick={() => audio.playTake(currentTake.id)}
              >
                {loadingTakeId === currentTake.id ? 'Loading…' : '▶ Play'}
              </button>
            )}
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 13 }}>
            {hasSound ? 'No takes yet.' : 'Describe the sound, then generate a take.'}
          </span>
        )}
      </div>

      <button className="btn audio-bar-panel-toggle" aria-expanded={panelOpen} onClick={onTogglePanel}>
        Sound &amp; Takes{takes.length ? ` (${takes.length})` : ''}
      </button>
    </div>
  );
}

interface PanelProps {
  audio: SongAudioState;
  songId: string;
  open: boolean;
  onClose: () => void;
  styleNotes: string;
  onStyleNotesChange: (value: string) => void;
  onStyleNotesCommit: () => Promise<void>;
  vocalGender: VocalGender;
  onVocalGenderChange: (value: VocalGender) => Promise<void>;
  soundInputRef: React.RefObject<HTMLTextAreaElement>;
}

export function AudioPanel({
  audio,
  songId,
  open,
  onClose,
  styleNotes,
  onStyleNotesChange,
  onStyleNotesCommit,
  vocalGender,
  onVocalGenderChange,
  soundInputRef,
}: PanelProps) {
  const { takes, currentTake, loaded } = audio;
  const generating = audio.status !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!audio.aiEnabled && takes.length === 0) return null;

  return (
    <aside className={`audio-panel${open ? ' open' : ''}`} aria-label="Song audio">
      <div className="audio-panel-header">
        <h2 style={{ fontSize: 15, margin: 0 }}>Audio</h2>
        <button className="btn audio-panel-close" onClick={onClose} aria-label="Close audio panel">
          ✕
        </button>
      </div>

      <div className="audio-panel-body">
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

        {audio.aiEnabled ? (
          <>
            {/* Generate itself lives in the player bar, which is always in view just below. */}
            {audio.status && (
              <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                Generating… {formatClock(audio.elapsedMs)}
                {audio.status.stage !== 'queued' ? ` · ${audio.status.stage}` : ''}
              </p>
            )}
            {audio.error && (
              <p style={{ color: 'var(--color-accent-red)', fontSize: 13, margin: '8px 0 0' }}>{audio.error}</p>
            )}
            <div style={{ marginTop: 10 }}>
              <AceStepServerControl
                refreshKey={generating}
                startingHint={audio.status?.stage === STARTING_SERVER_STAGE}
                noFolderHint={
                  <>
                    Set the ACE-Step folder in <Link to="/settings">Settings</Link> to start it from here.
                  </>
                }
              />
            </div>
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
            To generate new takes on your own GPU, enable AI features in <Link to="/settings">Settings</Link>.
          </p>
        )}

        <h3 className="audio-panel-subhead">Takes{takes.length ? ` (${takes.length})` : ''}</h3>
        {takes.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            Each generation is kept here so you can compare them.
          </p>
        )}
        <ul className="take-list">
          {takes.map((take) => {
            const isCurrent = currentTake?.id === take.id;
            const isPlaying = loaded?.takeId === take.id;
            return (
              <li key={take.id} className={`take-row${isCurrent ? ' current' : ''}`}>
                <div className="take-row-header">
                  <button
                    className="btn take-play"
                    disabled={audio.loadingTakeId === take.id || isPlaying}
                    onClick={() => audio.playTake(take.id)}
                    aria-label={`Play take ${audio.takeNumber(take.id)}`}
                    title={isPlaying ? 'In the player' : 'Play in the player bar'}
                  >
                    {isPlaying ? '♪' : '▶'}
                  </button>
                  <span className="take-row-title">
                    <strong>Take {audio.takeNumber(take.id)}</strong>
                    <span className="text-muted"> · {takeMeta(take)}</span>
                  </span>
                  <button
                    className="btn btn-danger"
                    onClick={() => audio.deleteTake(take)}
                    aria-label={`Delete take ${audio.takeNumber(take.id)}`}
                  >
                    Delete
                  </button>
                </div>
                {audio.missingTakeIds.has(take.id) && (
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    The audio file for this take isn't on this device.
                  </div>
                )}
                <details style={{ marginTop: 4, fontSize: 12 }}>
                  <summary className="text-muted" style={{ cursor: 'pointer' }}>
                    What was sent
                  </summary>
                  <pre className="live-song-text" style={{ marginTop: 6, fontSize: 12 }}>
                    {`${take.prompt}\n\n${take.lyrics}`}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
