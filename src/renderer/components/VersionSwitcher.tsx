import { useState } from 'react';
import { PartVersion } from '../../shared/types/partVersion';
import VersionDiffPanel from './VersionDiffPanel';

interface Props {
  versions: PartVersion[];
  viewedVersionId: string | null;
  onSelectViewed: (versionId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
}

export default function VersionSwitcher({
  versions,
  viewedVersionId,
  onSelectViewed,
  canMoveUp,
  canMoveDown,
  onMove,
}: Props) {
  const [compareOpen, setCompareOpen] = useState(false);
  const viewed = versions.find((v) => v.id === viewedVersionId) ?? null;

  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const viewedIndex = sorted.findIndex((v) => v.id === viewedVersionId);
  const defaultFrom = viewedIndex > 0 ? sorted[viewedIndex - 1] : sorted[0];
  const defaultTo = viewed ?? sorted[sorted.length - 1];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={!canMoveUp} onClick={() => onMove('up')} title="Move part up in the song">
          ↑
        </button>
        <button
          className="btn"
          disabled={!canMoveDown}
          onClick={() => onMove('down')}
          title="Move part down in the song"
        >
          ↓
        </button>
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)', margin: '0 2px' }} />
        {versions.map((v) => {
          const isViewed = v.id === viewedVersionId;
          return (
            <button
              key={v.id}
              className="btn"
              onClick={() => onSelectViewed(v.id)}
              style={
                isViewed
                  ? {
                      background: 'var(--color-primary-action)',
                      borderColor: 'var(--color-primary-action)',
                      color: '#fff',
                      fontWeight: 700,
                    }
                  : undefined
              }
            >
              v{v.versionNumber}
              {v.isActive ? ' ★' : ''}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        {versions.length > 1 && (
          <button className="btn" onClick={() => setCompareOpen(!compareOpen)}>
            {compareOpen ? 'Hide Compare' : 'Compare'}
          </button>
        )}
      </div>

      {compareOpen && versions.length > 1 && (
        <VersionDiffPanel versions={versions} defaultFromId={defaultFrom.id} defaultToId={defaultTo.id} />
      )}
    </div>
  );
}
