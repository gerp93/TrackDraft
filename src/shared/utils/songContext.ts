import { Part } from '../types/part';
import { PartPlacement } from '../types/partPlacement';
import { PartVersion } from '../types/partVersion';
import { computePartLabel, getOrderedPartIds } from './partLabel';

/**
 * Renders a song's full arrangement as `[LABEL]\nbody` sections, using each part's
 * latest version. Shared by the Live Song Panel and AI context assembly so the AI
 * sees exactly what the panel shows.
 */
export function buildSongContextText(
  placements: PartPlacement[],
  parts: Part[],
  latestVersionByPartId: Record<string, PartVersion>
): string {
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const orderedPartIds = getOrderedPartIds(placements.map((p) => p.partId));

  return placements
    .map((placement) => {
      const part = partsById.get(placement.partId);
      if (!part) return null;
      const label = computePartLabel(part, parts, orderedPartIds).toUpperCase();
      const lines = latestVersionByPartId[part.id]?.lines ?? [];
      const body = lines.length > 0 ? lines.join('\n') : part.noLyrics ? '(Instrumental)' : '';
      return `[${label}]\n${body}`;
    })
    .filter((section): section is string => section !== null)
    .join('\n\n');
}
