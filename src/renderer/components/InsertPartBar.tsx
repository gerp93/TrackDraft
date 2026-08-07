import { useEffect, useRef, useState } from 'react';
import { Part, PartType } from '../../shared/types/part';
import { PRESET_PART_TYPES, REPEATABLE_PART_TYPES, PART_TYPE_LABELS, computePartLabel } from '../../shared/utils/partLabel';

interface Props {
  parts: Part[];
  orderedPartIds: string[];
  onAddNew: (type: PartType) => void;
  onAddRepeat: (partId: string) => void;
  onAddCustom: (label: string, noLyrics: boolean) => void;
}

export default function InsertPartBar({ parts, orderedPartIds, onAddNew, onAddRepeat, onAddCustom }: Props) {
  const [openType, setOpenType] = useState<PartType | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customNoLyrics, setCustomNoLyrics] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (openType && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenType(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openType]);

  function handlePresetClick(type: PartType) {
    const existing = parts.filter((p) => p.partType === type);
    const canRepeat = (REPEATABLE_PART_TYPES as PartType[]).includes(type);
    if (existing.length === 0 || !canRepeat) {
      onAddNew(type);
      return;
    }
    setOpenType(openType === type ? null : type);
  }

  function submitCustom() {
    const label = customValue.trim();
    if (label) onAddCustom(label, customNoLyrics);
    cancelCustom();
  }

  function cancelCustom() {
    setCustomValue('');
    setCustomNoLyrics(false);
    setCustomOpen(false);
  }

  return (
    <div className="insert-part-bar" ref={containerRef}>
      {PRESET_PART_TYPES.map((type) => {
        const existing = parts.filter((p) => p.partType === type);
        return (
          <div key={type} className="insert-part-menu-wrap">
            <button className="btn insert-part-btn" onClick={() => handlePresetClick(type)}>
              + {PART_TYPE_LABELS[type]}
            </button>
            {openType === type && (
              <div className="insert-part-menu">
                {existing.map((p) => (
                  <button
                    key={p.id}
                    className="insert-part-menu-item"
                    onClick={() => {
                      onAddRepeat(p.id);
                      setOpenType(null);
                    }}
                  >
                    Repeat: {computePartLabel(p, parts, orderedPartIds)}
                  </button>
                ))}
                <button
                  className="insert-part-menu-item"
                  onClick={() => {
                    onAddNew(type);
                    setOpenType(null);
                  }}
                >
                  New {PART_TYPE_LABELS[type]}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {customOpen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCustom();
              if (e.key === 'Escape') cancelCustom();
            }}
            placeholder="Custom part name"
            style={{ width: 160 }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={customNoLyrics}
              onChange={(e) => setCustomNoLyrics(e.target.checked)}
              style={{ width: 'auto' }}
            />
            No lyrics
          </label>
          <button className="btn btn-primary" onClick={submitCustom}>
            Add
          </button>
          <button className="btn" onClick={cancelCustom}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn insert-part-btn" onClick={() => setCustomOpen(true)}>
          + Custom…
        </button>
      )}
    </div>
  );
}
