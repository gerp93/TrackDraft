import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SongGenerationStatus, SongTake } from '../../shared/types/songTake';
import { useAiSettings } from '../context/AiSettingsContext';

interface Props {
  songId: string;
  styleNotes: string;
  onStyleNotesChange: (value: string) => void;
  /** Persists the style notes; awaited before generating so the saved text is what's sent. */
  onStyleNotesCommit: () => Promise<void>;
}

const AUDIO_MIME_TYPES: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  aac: 'audio/aac',
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatDuration(seconds: number | null): string {
  return seconds ? formatElapsed(seconds * 1000) : '';
}

/** Loads a take's audio from the main process on first play rather than up front, so a
 * long takes list doesn't pull every file into memory. */
function TakePlayer({ take }: { take: SongTake }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle');
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function handleLoad() {
    setState('loading');
    const bytes = await window.electronAPI.music.getTakeAudio(take.id);
    if (!bytes) {
      setState('missing');
      return;
    }
    const extension = take.fileName.split('.').pop()?.toLowerCase() ?? '';
    const type = AUDIO_MIME_TYPES[extension] ?? 'audio/mpeg';
    const blobUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
    urlRef.current = blobUrl;
    setUrl(blobUrl);
    setState('idle');
  }

  if (url) return <audio controls autoPlay src={url} style={{ width: '100%' }} />;
  if (state === 'missing') {
    return (
      <span className="text-muted" style={{ fontSize: 13 }}>
        The audio file for this take isn't on this device.
      </span>
    );
  }
  return (
    <button className="btn" disabled={state === 'loading'} onClick={handleLoad}>
      {state === 'loading' ? 'Loading…' : 'Play'}
    </button>
  );
}

export default function SongAudioPanel({ songId, styleNotes, onStyleNotesChange, onStyleNotesCommit }: Props) {
  const { aiEnabled } = useAiSettings();
  const [takes, setTakes] = useState<SongTake[]>([]);
  const [status, setStatus] = useState<SongGenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState('');
  const [now, setNow] = useState(Date.now());

  async function loadTakes() {
    setTakes(await window.electronAPI.music.getTakes(songId));
  }

  useEffect(() => {
    setError(null);
    loadTakes();
    // A generation may already be running for this song (started before navigating away).
    window.electronAPI.music.getActive(songId).then(setStatus);
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

  async function handleGenerate() {
    setError(null);
    const minutes = Number(durationInput);
    const durationSeconds = durationInput.trim() && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
    await onStyleNotesCommit();
    setNow(Date.now());
    setStatus({ songId, startedAt: new Date().toISOString(), progress: 0, stage: 'queued' });
    try {
      await window.electronAPI.music.generate(songId, { durationSeconds });
    } catch (err) {
      // Electron prefixes errors thrown across IPC; keep only the message itself.
      const message = err instanceof Error ? err.message : String(err);
      setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setStatus(null);
      loadTakes();
    }
  }

  async function handleDelete(take: SongTake) {
    if (!confirm('Delete this take? Its audio file is removed from this device.')) return;
    await window.electronAPI.music.deleteTake(take.id);
    loadTakes();
  }

  const generating = status !== null;
  const canGenerate = aiEnabled && !generating && styleNotes.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div className="field">
        <label>Sound</label>
        <textarea
          className="notes-textarea"
          style={{ minHeight: 90 }}
          value={styleNotes}
          onChange={(e) => onStyleNotesChange(e.target.value)}
          onBlur={() => onStyleNotesCommit()}
          placeholder="Genre, mood, instruments, vocal style -- e.g. moody indie rock, female vocal, 95 bpm"
        />
        <span className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Same text as Style Notes on the Notes tab. The lyrics come from the song's parts, in order.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!canGenerate} onClick={handleGenerate}>
          {generating ? 'Generating…' : 'Generate Song'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Length
          <input
            type="number"
            min={0.5}
            max={8}
            step={0.5}
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="auto"
            disabled={generating}
            style={{ width: 80 }}
          />
          min
        </label>
        {generating && status && (
          <span className="text-muted" style={{ fontSize: 13 }}>
            {formatElapsed(now - new Date(status.startedAt).getTime())} elapsed
            {status.progress > 0 ? ` · ${Math.round(status.progress * 100)}%` : ''}
            {status.stage && status.stage !== 'queued' ? ` · ${status.stage}` : ''}
          </span>
        )}
      </div>

      {!aiEnabled && (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          AI features are off. Turn them on in <Link to="/settings">Settings</Link> to generate audio with a local
          ACE-Step server.
        </p>
      )}
      {error && <p style={{ color: 'var(--color-accent-red)', fontSize: 13, margin: 0 }}>{error}</p>}

      <div>
        <h2 style={{ fontSize: 15, margin: '8px 0' }}>Takes</h2>
        {takes.length === 0 && (
          <div className="text-muted" style={{ fontSize: 13 }}>
            No takes yet.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {takes.map((take, i) => (
            <div key={take.id} className="card" style={{ padding: 12 }}>
              <div
                style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}
              >
                <div style={{ fontSize: 13 }}>
                  <strong>Take {takes.length - i}</strong>
                  <span className="text-muted">
                    {' · '}
                    {new Date(take.createdAt).toLocaleString()}
                    {take.durationSeconds ? ` · ${formatDuration(take.durationSeconds)}` : ''}
                  </span>
                </div>
                <button className="btn btn-danger" onClick={() => handleDelete(take)}>
                  Delete
                </button>
              </div>
              <TakePlayer take={take} />
              <details style={{ marginTop: 8, fontSize: 12 }}>
                <summary className="text-muted" style={{ cursor: 'pointer' }}>
                  What was sent
                </summary>
                <pre className="live-song-text" style={{ marginTop: 6 }}>{`${take.prompt}\n\n${take.lyrics}`}</pre>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
