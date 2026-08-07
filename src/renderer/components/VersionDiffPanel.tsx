import { useState } from 'react';
import { PartVersion } from '../../shared/types/partVersion';
import { diffVersionLines } from '../../shared/utils/versionDiff';

interface Props {
  versions: PartVersion[];
  defaultFromId: string;
  defaultToId: string;
}

export default function VersionDiffPanel({ versions, defaultFromId, defaultToId }: Props) {
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(defaultToId);

  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const from = sorted.find((v) => v.id === fromId) ?? sorted[0];
  const to = sorted.find((v) => v.id === toId) ?? sorted[sorted.length - 1];
  const diff = diffVersionLines(from.lines, to.lines);
  const isEmpty = from.lines.length === 0 && to.lines.length === 0;

  return (
    <div className="version-diff-panel">
      <div className="version-diff-controls">
        <span className="text-muted">Comparing</span>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNumber}
            </option>
          ))}
        </select>
        <span className="text-muted">→</span>
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNumber}
              {v.isActive ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="version-diff-body">
        {isEmpty ? (
          <p className="text-muted" style={{ margin: 0 }}>
            Both versions are empty.
          </p>
        ) : (
          diff.map((line, i) => (
            <div key={i} className={`version-diff-line version-diff-${line.type}`}>
              {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
              {line.text || ' '}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
