import { useEffect, useRef, useState } from 'react';
import { SongTake } from '../../shared/types/songTake';
import type { SongAudioState } from './SongAudio';
import TakeLyricsDiff, { lyricsDiffer } from './TakeLyricsDiff';
import { takeMeta } from './audioFormat';

interface Props {
  audio: SongAudioState;
  /** The lyrics a generation started now would send; null while loading. */
  currentLyrics: string | null;
}

/** The takes half of the audio panel: every generated rendition of this song, newest
 * first. Playing a take loads it into the docked player bar. Rendered at the bottom of
 * AudioPanel (see SongAudio.tsx).
 *
 * One compact row per take (select, play, name + meta, star, expand); renaming, notes,
 * lyrics changes, export and the per-take generation actions live in the expanded area. */
export default function TakeList({ audio, currentLyrics }: Props) {
  const { takes } = audio;
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const visible = favoritesOnly ? takes.filter((t) => t.favorite) : takes;
  // Only what is on screen counts as selected: a take hidden by the filter or deleted
  // elsewhere must not be hit by a bulk action.
  const selected = visible.filter((t) => selectedIds.has(t.id));
  const allSelected = visible.length > 0 && selected.length === visible.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);

  function toggleIn(setter: typeof setSelectedIds, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visible.map((t) => t.id)));
  }

  async function bulkFavorite(favorite: boolean) {
    await audio.setFavorite(selected.map((t) => t.id), favorite);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (await audio.deleteTakes(selected)) setSelectedIds(new Set());
  }

  async function bulkExport() {
    const result = await window.electronAPI.takes.exportMany(selected.map((t) => t.id));
    if (!result.chosen) return;
    const problems = result.errors.length ? ` ${result.errors.join(' ')}` : '';
    setFeedback({
      text: `Exported ${result.saved} of ${selected.length} to ${result.path}.${problems}`,
      isError: result.errors.length > 0,
    });
    setSelectedIds(new Set());
  }

  async function exportOne(take: SongTake) {
    const result = await window.electronAPI.takes.export(take.id);
    if (!result.chosen) return;
    setFeedback(
      result.saved
        ? { text: `Saved ${audio.takeLabel(take)} to ${result.path}.`, isError: false }
        : { text: result.errors.join(' ') || 'Export failed.', isError: true }
    );
  }

  const busy = audio.status !== null;
  const generateBlocked = busy || !audio.aiEnabled;
  const blockedReason = !audio.aiEnabled
    ? 'Enable AI features in Settings to generate audio'
    : busy
      ? 'Wait for the current generation to finish'
      : undefined;

  return (
    <>
      <h3 className="audio-panel-subhead">Takes{takes.length ? ` (${takes.length})` : ''}</h3>
      {takes.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Each generation is kept here so you can compare them.
        </p>
      )}

      {takes.length > 0 && (
        <div className="take-toolbar">
          <label>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              disabled={visible.length === 0}
              onChange={toggleAll}
            />
            Select all
          </label>
          <label>
            <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
            Favourites only
          </label>
        </div>
      )}

      {selected.length > 0 && (
        <div className="take-bulk-bar" role="toolbar" aria-label="Actions for selected takes">
          <strong>{selected.length} selected</strong>
          <button className="btn" onClick={() => bulkFavorite(true)}>
            Favourite
          </button>
          <button className="btn" onClick={() => bulkFavorite(false)}>
            Unfavourite
          </button>
          <button className="btn" onClick={bulkExport}>
            Export…
          </button>
          <button className="btn btn-danger" onClick={bulkDelete}>
            Delete
          </button>
          <button className="btn" onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div aria-live="polite">
        {feedback && (
          <p
            className="take-feedback"
            style={feedback.isError ? { color: 'var(--color-accent-red)' } : { color: 'var(--color-text-muted)' }}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {takes.length > 0 && visible.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          No favourites yet. Star a take to find it here.
        </p>
      )}

      <ul className="take-list">
        {visible.map((take) => (
          <TakeRow
            key={take.id}
            take={take}
            audio={audio}
            currentLyrics={currentLyrics}
            isSelected={selectedIds.has(take.id)}
            isExpanded={expandedIds.has(take.id)}
            onToggleSelect={() => toggleIn(setSelectedIds, take.id)}
            onToggleExpand={() => toggleIn(setExpandedIds, take.id)}
            onExport={() => exportOne(take)}
            generateBlocked={generateBlocked}
            blockedReason={blockedReason}
          />
        ))}
      </ul>
    </>
  );
}

interface RowProps {
  take: SongTake;
  audio: SongAudioState;
  currentLyrics: string | null;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onExport: () => void;
  generateBlocked: boolean;
  blockedReason: string | undefined;
}

function TakeRow({
  take,
  audio,
  currentLyrics,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onExport,
  generateBlocked,
  blockedReason,
}: RowProps) {
  // Drafts commit on blur, so typing doesn't write to the database on every keystroke.
  const [nameDraft, setNameDraft] = useState(take.name ?? '');
  const [notesDraft, setNotesDraft] = useState(take.notes);
  useEffect(() => setNameDraft(take.name ?? ''), [take.name]);
  useEffect(() => setNotesDraft(take.notes), [take.notes]);

  const label = audio.takeLabel(take);
  const number = audio.takeNumber(take.id);
  const isCurrent = audio.currentTake?.id === take.id;
  const isPlaying = audio.loaded?.takeId === take.id;
  const lyricsChanged = currentLyrics !== null && lyricsDiffer(take.lyrics, currentLyrics);
  const bodyId = `take-body-${take.id}`;

  function commitName() {
    if (nameDraft.trim() !== (take.name ?? '')) audio.updateTake(take.id, { name: nameDraft });
  }

  function commitNotes() {
    if (notesDraft !== take.notes) audio.updateTake(take.id, { notes: notesDraft });
  }

  const seedTitle = !take.seed
    ? 'This take has no recorded seed, so it can’t be reproduced'
    : (blockedReason ?? 'Generate again from the same seed, with the current lyrics and sound');

  return (
    <li className={`take-row${isCurrent ? ' current' : ''}`}>
      <div className="take-row-header">
        <input
          type="checkbox"
          className="take-check"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${label}`}
        />
        <button
          className="btn take-play"
          disabled={audio.loadingTakeId === take.id || isPlaying}
          onClick={() => audio.playTake(take.id)}
          aria-label={`Play ${label}`}
          title={isPlaying ? 'In the player' : 'Play in the player bar'}
        >
          {isPlaying ? '♪' : '▶'}
        </button>
        <span className="take-row-title">
          <strong title={label}>{label}</strong>
          <span className="text-muted take-row-meta">
            {take.name ? `Take ${number} · ` : ''}
            {takeMeta(take)}
            {lyricsChanged && (
              <span className="take-changed-dot" title="Lyrics changed since this take">
                {' '}
                ● lyrics changed
              </span>
            )}
          </span>
        </span>
        <button
          className={`btn take-icon-btn take-star${take.favorite ? ' on' : ''}`}
          onClick={() => audio.setFavorite([take.id], !take.favorite)}
          aria-pressed={take.favorite}
          aria-label={take.favorite ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
          title={take.favorite ? 'Favourite' : 'Mark as favourite'}
        >
          {take.favorite ? '★' : '☆'}
        </button>
        <button
          className="btn take-icon-btn"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${label}`}
          title="Rename, notes, export, more"
        >
          {isExpanded ? '▴' : '⋯'}
        </button>
      </div>

      {audio.missingTakeIds.has(take.id) && (
        <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          The audio file for this take isn't on this device.
        </div>
      )}

      {isExpanded && (
        <div className="take-row-body" id={bodyId}>
          <label>
            Name
            <input
              type="text"
              value={nameDraft}
              placeholder={`Take ${number}`}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          <label>
            Notes
            <textarea
              value={notesDraft}
              rows={2}
              placeholder="What do you like or want to fix about this take?"
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={commitNotes}
            />
          </label>

          <TakeLyricsDiff snapshot={take.lyrics} current={currentLyrics} />

          <div className="take-row-actions">
            <button className="btn" onClick={onExport} title="Save a copy of the audio file as it is stored (FLAC)">
              Export…
            </button>
            <button
              className="btn"
              disabled={generateBlocked || !take.seed}
              onClick={() => audio.generate({ seed: take.seed })}
              title={seedTitle}
            >
              Regenerate with this seed
            </button>
            <button
              className="btn"
              disabled={generateBlocked}
              onClick={() => audio.generate({ coverOfTakeId: take.id })}
              title={blockedReason ?? 'Keep this take’s melody and structure, but apply the current sound settings'}
            >
              Restyle with current sound
            </button>
            <button className="btn btn-danger" onClick={() => audio.deleteTake(take)}>
              Delete
            </button>
          </div>

          <details style={{ fontSize: 12 }}>
            <summary className="text-muted" style={{ cursor: 'pointer' }}>
              What was sent
            </summary>
            <pre className="live-song-text" style={{ marginTop: 6, fontSize: 12 }}>
              {`${take.prompt}\n\n${take.lyrics}`}
            </pre>
          </details>
        </div>
      )}
    </li>
  );
}
