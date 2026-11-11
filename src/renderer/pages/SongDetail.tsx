import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Song, VocalGender } from '../../shared/types/song';
import { Part, PartType } from '../../shared/types/part';
import { PartPlacement } from '../../shared/types/partPlacement';
import { computePartLabel, getOrderedPartIds } from '../../shared/utils/partLabel';
import PartHeader from '../components/PartHeader';
import PartEditor from '../components/PartEditor';
import InsertPartBar from '../components/InsertPartBar';
import LiveSongPanel from '../components/LiveSongPanel';
import { AudioBar, AudioPanel, useSongAudio } from '../components/SongAudio';
import { useCurrentLyrics } from '../utils/useCurrentLyrics';

export default function SongDetail() {
  const { songId } = useParams<{ songId: string }>();
  const [song, setSong] = useState<Song | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [placements, setPlacements] = useState<PartPlacement[]>([]);
  const [titleDraft, setTitleDraft] = useState('');
  const [justAddedPlacementId, setJustAddedPlacementId] = useState<string | null>(null);
  const [deletingPlacementId, setDeletingPlacementId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'song' | 'notes'>('song');
  const [styleNotesDraft, setStyleNotesDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const partRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const songTabRef = useRef<HTMLDivElement | null>(null);
  const audioBarRef = useRef<HTMLDivElement | null>(null);
  const soundInputRef = useRef<HTMLTextAreaElement>(null);
  const audio = useSongAudio(songId ?? '', styleNotesDraft, handleStyleNotesBlur);
  const currentLyrics = useCurrentLyrics(songId ?? '', placements, parts);

  // The slide-out audio panel is position:fixed, so it has to be told where the page
  // area starts (below the top bar) and where the docked player bar begins -- both
  // change with window size, and the bar's height changes when it wraps.
  useEffect(() => {
    const root = songTabRef.current;
    const bar = audioBarRef.current;
    if (!root || !bar) return;
    const measure = () => {
      const scroller = root.closest('.main-content');
      root.style.setProperty('--audio-panel-top', `${scroller?.getBoundingClientRect().top ?? 0}px`);
      root.style.setProperty('--audio-bar-height', `${bar.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [song !== null, activeTab]);

  function handleNeedSound() {
    setAudioPanelOpen(true);
    // After the panel has slid in (it is visibility:hidden while closed).
    setTimeout(() => soundInputRef.current?.focus(), 250);
  }

  useEffect(() => {
    if (songId) load(songId);
  }, [songId]);

  useEffect(() => {
    if (!justAddedPlacementId) return;
    partRefs.current[justAddedPlacementId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setJustAddedPlacementId(null), 1800);
    return () => clearTimeout(timer);
  }, [justAddedPlacementId]);

  async function load(id: string) {
    const [s, partList, placementList] = await Promise.all([
      window.electronAPI.songs.getById(id),
      window.electronAPI.parts.getBySong(id),
      window.electronAPI.placements.getBySong(id),
    ]);
    setSong(s);
    setTitleDraft(s?.title ?? '');
    setStyleNotesDraft(s?.styleNotes ?? '');
    setNotesDraft(s?.notes ?? '');
    setParts(partList);
    setPlacements(placementList);
  }

  async function handleTitleBlur() {
    if (!songId || !song) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== song.title) {
      await window.electronAPI.songs.update(songId, { title: trimmed });
      await load(songId);
    }
  }

  async function handleStyleNotesBlur() {
    if (!songId || !song) return;
    if (styleNotesDraft !== song.styleNotes) {
      await window.electronAPI.songs.update(songId, { styleNotes: styleNotesDraft });
      await load(songId);
    }
  }

  async function handleVocalGenderChange(vocalGender: VocalGender) {
    if (!songId) return;
    await window.electronAPI.songs.update(songId, { vocalGender });
    await load(songId);
  }

  async function handleNotesBlur() {
    if (!songId || !song) return;
    if (notesDraft !== song.notes) {
      await window.electronAPI.songs.update(songId, { notes: notesDraft });
      await load(songId);
    }
  }

  /** Creates a brand-new content record of this type (with a blank first version) and places it. */
  async function handleAddNew(type: PartType, atIndex: number) {
    if (!songId) return;
    const part = await window.electronAPI.parts.create({ songId, partType: type });
    await window.electronAPI.partVersions.create({ partId: part.id, lines: [] });
    const placement = await window.electronAPI.placements.create({ songId, partId: part.id }, atIndex);
    await load(songId);
    setJustAddedPlacementId(placement.id);
  }

  async function handleAddCustom(label: string, noLyrics: boolean, atIndex: number) {
    if (!songId) return;
    const part = await window.electronAPI.parts.create({ songId, partType: 'custom', customLabel: label, noLyrics });
    await window.electronAPI.partVersions.create({ partId: part.id, lines: [] });
    const placement = await window.electronAPI.placements.create({ songId, partId: part.id }, atIndex);
    await load(songId);
    setJustAddedPlacementId(placement.id);
  }

  /** Places an existing part again -- a repeat. Same content record, no new version created. */
  async function handleAddRepeat(partId: string, atIndex: number) {
    if (!songId) return;
    const placement = await window.electronAPI.placements.create({ songId, partId }, atIndex);
    await load(songId);
    setJustAddedPlacementId(placement.id);
  }

  async function handleRenamePart(partId: string, label: string) {
    await window.electronAPI.parts.update(partId, { customLabel: label });
    if (songId) await load(songId);
  }

  async function handleToggleNoLyrics(partId: string, current: boolean) {
    await window.electronAPI.parts.update(partId, { noLyrics: !current });
    if (songId) await load(songId);
  }

  async function handleChangeDirection(partId: string, direction: string) {
    await window.electronAPI.parts.update(partId, { direction });
    if (songId) await load(songId);
  }

  async function handleDeletePlacement(placementId: string) {
    if (!songId) return;
    if (!confirm('Remove this part from the song? If it appears nowhere else, its content is deleted too.')) return;
    // Play the fade-out with the part still on screen before actually removing it.
    setDeletingPlacementId(placementId);
    await new Promise((resolve) => setTimeout(resolve, 280));
    await window.electronAPI.placements.delete(placementId);
    await load(songId);
    setDeletingPlacementId(null);
  }

  async function handleMovePlacement(placementId: string, direction: 'up' | 'down') {
    if (!songId) return;
    const ids = placements.map((p) => p.id);
    const index = ids.indexOf(placementId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await window.electronAPI.placements.reorder(songId, ids);
    await load(songId);
  }

  if (!song) return <div className="text-muted">Loading…</div>;

  const partsById = new Map(parts.map((p) => [p.id, p]));
  const orderedPartIds = getOrderedPartIds(placements.map((p) => p.partId));

  return (
    <div>
      <div className="page-header">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleBlur}
          style={{ fontSize: 22, fontWeight: 700, border: 'none', background: 'transparent', padding: '8px 0' }}
        />
      </div>

      <div className="song-tabs">
        <button
          className={`song-tab-btn${activeTab === 'song' ? ' active' : ''}`}
          onClick={() => setActiveTab('song')}
        >
          Song
        </button>
        <button
          className={`song-tab-btn${activeTab === 'notes' ? ' active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
          <div className="field">
            <label>Notes</label>
            <textarea
              className="notes-textarea"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Anything worth jotting down about this song..."
            />
          </div>
        </div>
      )}

      <div ref={songTabRef} style={{ display: activeTab === 'song' ? 'block' : 'none' }}>
      <div className="song-layout">
        <div className="song-parts-column">
          {placements.length === 0 && (
            <div className="text-muted" style={{ marginBottom: 8 }}>
              Add a part to start writing.
            </div>
          )}

          <InsertPartBar
            parts={parts}
            orderedPartIds={orderedPartIds}
            onAddNew={(type) => handleAddNew(type, 0)}
            onAddRepeat={(partId) => handleAddRepeat(partId, 0)}
            onAddCustom={(label, noLyrics) => handleAddCustom(label, noLyrics, 0)}
          />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {placements.map((placement, i) => {
              const part = partsById.get(placement.partId);
              if (!part) return null;
              const label = computePartLabel(part, parts, orderedPartIds);
              const cssClass = [
                placement.id === justAddedPlacementId ? 'just-added' : '',
                placement.id === deletingPlacementId ? 'deleting' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={placement.id}
                  ref={(el) => {
                    partRefs.current[placement.id] = el;
                  }}
                  className={cssClass || undefined}
                >
                  <PartHeader
                    label={label}
                    renameable={part.partType === 'custom'}
                    noLyrics={part.noLyrics}
                    onRename={(newLabel) => handleRenamePart(part.id, newLabel)}
                    onDelete={() => handleDeletePlacement(placement.id)}
                    onToggleNoLyrics={() => handleToggleNoLyrics(part.id, part.noLyrics)}
                    direction={part.direction}
                    placementCount={placements.filter((p) => p.partId === part.id).length}
                    onChangeDirection={(d) => handleChangeDirection(part.id, d)}
                  >
                    <PartEditor
                      part={part}
                      songId={songId!}
                      canMoveUp={i > 0}
                      canMoveDown={i < placements.length - 1}
                      onMove={(direction) => handleMovePlacement(placement.id, direction)}
                    />
                  </PartHeader>
                  <InsertPartBar
                    parts={parts}
                    orderedPartIds={orderedPartIds}
                    onAddNew={(type) => handleAddNew(type, i + 1)}
                    onAddRepeat={(partId) => handleAddRepeat(partId, i + 1)}
                    onAddCustom={(label, noLyrics) => handleAddCustom(label, noLyrics, i + 1)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {songId && (
          <div className="song-lyrics-column">
            <LiveSongPanel songId={songId} placements={placements} parts={parts} />
          </div>
        )}

        {songId && (
          <AudioPanel
            audio={audio}
            songId={songId}
            open={audioPanelOpen}
            onClose={() => setAudioPanelOpen(false)}
            styleNotes={styleNotesDraft}
            onStyleNotesChange={setStyleNotesDraft}
            onStyleNotesCommit={handleStyleNotesBlur}
            vocalGender={song.vocalGender}
            onVocalGenderChange={handleVocalGenderChange}
            soundInputRef={soundInputRef}
            currentLyrics={currentLyrics}
          />
        )}
      </div>

      <div ref={audioBarRef} className="audio-bar-dock">
        <AudioBar
          audio={audio}
          hasSound={styleNotesDraft.trim().length > 0}
          panelOpen={audioPanelOpen}
          onTogglePanel={() => setAudioPanelOpen((open) => !open)}
          onNeedSound={handleNeedSound}
        />
      </div>
      </div>
    </div>
  );
}
