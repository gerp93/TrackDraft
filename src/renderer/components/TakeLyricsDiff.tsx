import { useState } from 'react';
import { diffVersionLines } from '../../shared/utils/versionDiff';

/** Line-for-line comparison key: ignore line-ending and trailing-space noise. */
function toLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').trimEnd().split('\n').map((l) => l.trimEnd());
}

export function lyricsDiffer(snapshot: string, current: string): boolean {
  return toLines(snapshot).join('\n') !== toLines(current).join('\n');
}

interface Props {
  /** The lyrics the take was generated from. */
  snapshot: string;
  /** The song's lyrics as they would be sent now; null while still loading. */
  current: string | null;
}

/** In a take's expandable area: says whether the song's lyrics moved on since this take,
 * and shows the changes (rendered like the part version diff) on demand. */
export default function TakeLyricsDiff({ snapshot, current }: Props) {
  const [open, setOpen] = useState(false);

  if (current === null) return null;
  if (!lyricsDiffer(snapshot, current)) {
    return (
      <p className="text-muted take-lyrics-diff" style={{ margin: 0 }}>
        Lyrics match what this take was generated from.
      </p>
    );
  }

  const diff = diffVersionLines(toLines(snapshot), toLines(current));
  return (
    <div className="take-lyrics-diff">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Lyrics have changed since this take.</span>
        <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide changes' : 'Show changes'}
        </button>
      </div>
      {open && (
        <div className="version-diff-body" role="group" aria-label="Lyrics changes since this take">
          {diff.map((line, i) => (
            <div key={i} className={`version-diff-line version-diff-${line.type}`}>
              {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
              {line.text || ' '}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
