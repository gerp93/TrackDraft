import { ReactNode, useEffect, useState } from 'react';

interface Props {
  label: string;
  renameable: boolean;
  noLyrics: boolean;
  onRename: (label: string) => void;
  onDelete: () => void;
  onToggleNoLyrics: () => void;
  children: ReactNode;
}

export default function PartHeader({
  label,
  renameable,
  noLyrics,
  onRename,
  onDelete,
  onToggleNoLyrics,
  children,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(label);
  const [collapsed, setCollapsed] = useState(false);

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
        <button className="btn btn-danger" onClick={onDelete} title="Remove this part from the song">
          Delete Part
        </button>
      </div>
      <div style={{ display: collapsed ? 'none' : 'block' }}>{children}</div>
    </div>
  );
}
