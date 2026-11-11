import { useEffect, useState } from 'react';
import { Part } from '../../shared/types/part';
import { PartPlacement } from '../../shared/types/partPlacement';
import { PartVersion } from '../../shared/types/partVersion';
import { buildMusicLyrics } from '../../shared/utils/musicLyrics';
import { PART_CHANGED_EVENT } from './partEvents';

/** The lyrics text a generation started right now would send, kept fresh as parts are
 * rearranged or edited (same refresh triggers as LiveSongPanel). */
export function useCurrentLyrics(songId: string, placements: PartPlacement[], parts: Part[]): string | null {
  const [latestByPartId, setLatestByPartId] = useState<Record<string, PartVersion> | null>(null);

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    async function load() {
      const versions = await window.electronAPI.partVersions.getLatestForSong(songId);
      if (cancelled) return;
      const map: Record<string, PartVersion> = {};
      for (const v of versions) map[v.partId] = v;
      setLatestByPartId(map);
    }
    load();
    window.addEventListener(PART_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PART_CHANGED_EVENT, load);
    };
  }, [songId, placements, parts]);

  // null until the versions have loaded, so takes aren't briefly flagged as changed.
  return latestByPartId ? buildMusicLyrics(placements, parts, latestByPartId) : null;
}
