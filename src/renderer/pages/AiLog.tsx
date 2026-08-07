import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AiLogEntry, AiPromptSegment } from '../../shared/types/ai';
import { useAiSettings } from '../context/AiSettingsContext';

const POLL_INTERVAL_MS = 4000;

/** Cycled by position so each piece of a prompt reads as a distinct, consistent color
 * both within one entry and across entries -- segment 0 is always this color, etc. */
const SEGMENT_COLORS = [
  { bg: 'rgba(37, 99, 235, 0.14)', border: '#2563eb' }, // blue
  { bg: 'rgba(22, 128, 60, 0.14)', border: '#16803c' }, // green
  { bg: 'rgba(217, 119, 6, 0.16)', border: '#d97706' }, // amber
  { bg: 'rgba(147, 51, 234, 0.14)', border: '#9333ea' }, // purple
  { bg: 'rgba(219, 39, 119, 0.14)', border: '#db2777' }, // pink
  { bg: 'rgba(8, 145, 178, 0.14)', border: '#0891b2' }, // cyan
];

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function preview(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** Renders a prompt's labeled segments stacked in the exact order sent to the model,
 * each colored and tagged -- the real structure captured at build time, not guessed
 * back out of the joined string afterward. */
function SegmentList({ segments }: { segments: AiPromptSegment[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {segments.map((segment, i) => {
        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        return (
          <div
            key={i}
            style={{
              background: color.bg,
              borderLeft: `3px solid ${color.border}`,
              borderRadius: 4,
              padding: '6px 10px',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: color.border }}>
              {segment.label}
            </div>
            <pre
              style={{
                margin: 0,
                marginTop: 2,
                fontFamily: 'inherit',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {segment.text}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function LogEntryCard({ entry }: { entry: AiLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [viewMode, setViewMode] = useState<'segments' | 'full'>('segments');

  async function handleCopy() {
    const text =
      `Timestamp: ${entry.timestamp}\n` +
      `Provider/Model: ${entry.provider} / ${entry.model}\n` +
      `Duration: ${formatDuration(entry.durationMs)}\n\n` +
      `--- System prompt ---\n${entry.systemPrompt}\n\n` +
      `--- User message ---\n${entry.userMessage}\n\n` +
      (entry.error ? `--- Error ---\n${entry.error}` : `--- Response ---\n${entry.response ?? ''}`);
    await navigator.clipboard.writeText(text);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy'), 1500);
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <button className="btn part-collapse-btn" title={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▼' : '▶'}
        </button>
        <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: entry.error ? 'var(--color-accent-red)' : 'var(--color-accent-green)',
          }}
        >
          {entry.error ? 'Error' : 'OK'}
        </span>
        <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {entry.provider} / {entry.model} · {formatDuration(entry.durationMs)}
        </span>
        <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview(entry.userMessage)}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn"
              onClick={() => setViewMode('segments')}
              style={
                viewMode === 'segments'
                  ? { background: 'var(--color-primary-action)', borderColor: 'var(--color-primary-action)', color: '#fff' }
                  : undefined
              }
            >
              Segments
            </button>
            <button
              className="btn"
              onClick={() => setViewMode('full')}
              title="The exact concatenated text sent to the model, with no color-coded breakdown"
              style={
                viewMode === 'full'
                  ? { background: 'var(--color-primary-action)', borderColor: 'var(--color-primary-action)', color: '#fff' }
                  : undefined
              }
            >
              Full Prompt
            </button>
          </div>

          {viewMode === 'segments' ? (
            <>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  System prompt
                </div>
                <SegmentList segments={entry.systemSegments} />
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  User message
                </div>
                <SegmentList segments={entry.userSegments} />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  System prompt (as sent)
                </div>
                <pre className="live-song-text" style={{ fontSize: 12 }}>
                  {entry.systemPrompt}
                </pre>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  User message (as sent)
                </div>
                <pre className="live-song-text" style={{ fontSize: 12 }}>
                  {entry.userMessage}
                </pre>
              </div>
            </>
          )}
          <div>
            <div
              className="text-muted"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: entry.error ? 'var(--color-accent-red)' : undefined,
              }}
            >
              {entry.error ? 'Error' : 'Response'}
            </div>
            <pre
              className="live-song-text"
              style={{ fontSize: 12, color: entry.error ? 'var(--color-accent-red)' : undefined }}
            >
              {entry.error ?? entry.response}
            </pre>
          </div>
          <button className="btn" onClick={handleCopy} style={{ alignSelf: 'flex-start' }}>
            {copyLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AiLog() {
  const { aiEnabled } = useAiSettings();
  const [entries, setEntries] = useState<AiLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    const log = await window.electronAPI.ai.getLog();
    setEntries(log);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    pollTimer.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function handleClear() {
    if (!confirm('Clear the AI call log?')) return;
    await window.electronAPI.ai.clearLog();
    await load();
  }

  // Reachable only via the nav link, which is already hidden when AI is off -- this
  // covers the edge case of landing here anyway (e.g. browser back/forward).
  if (!aiEnabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ flex: 1 }}>AI Log</h1>
        <button className="btn" onClick={load}>
          Refresh
        </button>
        <button className="btn btn-danger" onClick={handleClear} disabled={entries.length === 0}>
          Clear Log
        </button>
      </div>
      <p className="text-muted" style={{ marginTop: -12, marginBottom: 20, fontSize: 13 }}>
        Every call to the local or cloud model -- the exact system prompt, your message, and the response (or
        error) -- newest first. Nothing here is saved to disk; it clears when the app restarts.
      </p>

      {!loaded ? (
        <p className="text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted">No AI calls yet. Use Ask AI or AI-assisted Autoformat and they'll show up here.</p>
      ) : (
        entries.map((entry) => <LogEntryCard key={entry.id} entry={entry} />)
      )}
    </div>
  );
}
