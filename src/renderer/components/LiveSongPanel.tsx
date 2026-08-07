import { useEffect, useState } from 'react';
import { Part } from '../../shared/types/part';
import { PartPlacement } from '../../shared/types/partPlacement';
import { PartVersion } from '../../shared/types/partVersion';
import { buildSongContextText } from '../../shared/utils/songContext';
import { PART_CHANGED_EVENT } from '../utils/partEvents';

interface Props {
  songId: string;
  placements: PartPlacement[];
  parts: Part[];
}

export default function LiveSongPanel({ songId, placements, parts }: Props) {
  const [latestByPartId, setLatestByPartId] = useState<Record<string, PartVersion>>({});
  const [copyLabel, setCopyLabel] = useState('Copy');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, placements, parts]);

  useEffect(() => {
    window.addEventListener(PART_CHANGED_EVENT, load);
    return () => window.removeEventListener(PART_CHANGED_EVENT, load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  async function load() {
    const versions = await window.electronAPI.partVersions.getLatestForSong(songId);
    const map: Record<string, PartVersion> = {};
    for (const v of versions) map[v.partId] = v;
    setLatestByPartId(map);
  }

  const fullText = buildSongContextText(placements, parts, latestByPartId);

  async function handleCopy() {
    await navigator.clipboard.writeText(fullText);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy'), 1500);
  }

  return (
    <div className="live-song-panel">
      <div className="live-song-header">
        <h2 style={{ fontSize: 15, margin: 0 }}>Full Song</h2>
        <button className="btn" onClick={handleCopy} disabled={!fullText.trim()}>
          {copyLabel}
        </button>
      </div>
      <pre className="live-song-text">{fullText.trim() ? fullText : 'Nothing written yet.'}</pre>
    </div>
  );
}
