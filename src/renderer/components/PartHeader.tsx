import { ReactNode, useEffect, useState } from 'react';
import { MAX_DIRECTION_LENGTH, sanitizeDirection } from '../../shared/utils/partDirection';

interface Props {
  label: string;
  renameable: boolean;
  noLyrics: boolean;
  direction: string;
  /** Placements of this part in the arrangement; more than one means the direction is shared. */
  placementCount: number;
  onRename: (label: string) => void;
  onDelete: () => void;
  onToggleNoLyrics: () => void;
  onChangeDirection: (direction: string) => void;
  children: ReactNode;
}

export default function PartHeader({
  label,
  renameable,
  noLyrics,
  direction,
  placementCount,
  onRename,
  onDelete,
  onToggleNoLyrics,
  onChangeDirection,
  children,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(label);
  const [collapsed, setCollapsed] = useState(false);
  const [editingDirection, setEditingDirection] = useState(false);
  const [directionValue, setDirectionValue] = useState(direction);

  useEffect(() => {
    if (!editingDirection) setDirectionValue(direction);
  }, [direction, editingDirection]);

  function commitDirection() {
    const cleaned = sanitizeDirection(directionValue);
    setEditingDirection(false);
    setDirectionValue(cleaned);
    if (cleaned !== direction) onChangeDirection(cleaned);
  }

  useEffect(() => {
    if (!renaming) setRenameValue(label);
  }, [label, renaming]);

  function commitRename() {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (trimmed && trimmed !== label) onRename(trimmed);
    else setRenameValue(label);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 8 }}>
        <button
          className="btn part-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            style={{ fontSize: 18, fontWeight: 700, flex: 1 }}
          />
        ) : (
          <h2
            onClick={() => renameable && setRenaming(true)}
            style={{ fontSize: 18, margin: 0, flex: 1, cursor: renameable ? 'text' : 'default' }}
            title={renameable ? 'Click to rename' : 'Name is set by part type'}
          >
            {label}
          </h2>
        )}
        {renameable && (
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-muted)' }}
          >
            <input type="checkbox" checked={noLyrics} onChange={onToggleNoLyrics} style={{ width: 'auto' }} />
            No lyrics
          </label>
        )}
        {!direction && !editingDirection && (
          <button
            className="btn section-direction-add"
            onClick={() => setEditingDirection(true)}
            title="Tell the music model how this section should sound"
          >
            + Add direction
          </button>
        )}
        <button className="btn btn-danger" onClick={onDelete} title="Remove this part from the song">
          Delete Part
        </button>
      </div>
      {(direction || editingDirection) && (
        <div className="section-direction" style={{ display: collapsed ? 'none' : 'flex' }}>
          <span className="section-direction-label">Audio direction</span>
          <input
            autoFocus={editingDirection && !direction}
            value={directionValue}
            maxLength={MAX_DIRECTION_LENGTH}
            placeholder="How should this section sound? e.g. whispered, just piano"
            onFocus={() => setEditingDirection(true)}
            onChange={(e) => setDirectionValue(e.target.value)}
            onBlur={commitDirection}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {placementCount > 1 && (
            <span className="section-direction-note">applies to all {placementCount} placements</span>
          )}
        </div>
      )}
      <div style={{ display: collapsed ? 'none' : 'block' }}>{children}</div>
    </div>
  );
}
