import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Song } from '../../shared/types/song';
import { Part, PartType } from '../../shared/types/part';
import { PartPlacement } from '../../shared/types/partPlacement';
import { computePartLabel, getOrderedPartIds } from '../../shared/utils/partLabel';
import PartHeader from '../components/PartHeader';
import PartEditor from '../components/PartEditor';
import InsertPartBar from '../components/InsertPartBar';
import LiveSongPanel from '../components/LiveSongPanel';

export default function SongDetail() {
  const { songId } = useParams<{ songId: string }>();
  const [song, setSong] = useState<Song | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [placements, setPlacements] = useState<PartPlacement[]>([]);
  const [titleDraft, setTitleDraft] = useState('');
  const [justAddedPlacementId, setJustAddedPlacementId] = useState<string | null>(null);
  const [deletingPlacementId, setDeletingPlacementId] = useState<string | null>(null);
  const partRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '6 1 0', minWidth: 0 }}>
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
          <div style={{ flex: '4 1 0', minWidth: 260, position: 'sticky', top: 0 }}>
            <LiveSongPanel songId={songId} placements={placements} parts={parts} />
          </div>
        )}
      </div>
    </div>
  );
}
