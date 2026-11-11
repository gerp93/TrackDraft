import { useEffect, useState } from 'react';
import { AceStepServerStatus } from '../../shared/types/songTake';

const POLL_MS = 4000;

function cleanIpcError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

interface Props {
  /** Shown when no ACE-Step folder is configured, in place of the Start button. */
  noFolderHint: React.ReactNode;
  /** Bump to force an immediate re-check (e.g. after the folder setting changes). */
  refreshKey?: unknown;
}

/** Status line plus Start/Stop for the local ACE-Step server. Stop is only offered for
 * a server TrackDraft started itself -- one launched by hand is left alone. */
export default function AceStepServerControl({ noFolderHint, refreshKey }: Props) {
  const [status, setStatus] = useState<AceStepServerStatus | null>(null);
  const [busy, setBusy] = useState<'starting' | 'stopping' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      window.electronAPI.music.serverStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);

  async function handleStart() {
    setBusy('starting');
    setError(null);
    try {
      setStatus(await window.electronAPI.music.startServer());
    } catch (err) {
      setError(cleanIpcError(err));
      setStatus(await window.electronAPI.music.serverStatus());
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy('stopping');
    setError(null);
    setStatus(await window.electronAPI.music.stopServer());
    setBusy(null);
  }

  if (!status) return null;

  const isStarting = busy === 'starting' || status.starting;
  let label: string;
  let color = 'var(--color-text-muted)';
  if (isStarting) {
    label = 'ACE-Step server is starting… (can take a minute)';
  } else if (status.reachable) {
    label = status.managed ? 'ACE-Step server is running (started by TrackDraft).' : 'ACE-Step server is running.';
    color = 'var(--color-accent-green)';
  } else {
    label = 'ACE-Step server is not running.';
  }
  const shownError = error ?? (!status.reachable && !isStarting ? status.lastError : null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {!status.reachable && status.canStart && (
          <button className="btn" disabled={isStarting} onClick={handleStart}>
            {isStarting ? 'Starting…' : 'Start Server'}
          </button>
        )}
        {status.reachable && status.managed && (
          <button className="btn" disabled={busy !== null} onClick={handleStop}>
            {busy === 'stopping' ? 'Stopping…' : 'Stop Server'}
          </button>
        )}
        <span style={{ fontSize: 13, color }}>{label}</span>
        {!status.reachable && !status.canStart && !isStarting && (
          <span className="text-muted" style={{ fontSize: 13 }}>
            {noFolderHint}
          </span>
        )}
      </div>
      {shownError && (
        <p style={{ color: 'var(--color-accent-red)', fontSize: 13, margin: '6px 0 0' }}>{shownError}</p>
      )}
    </div>
  );
}
