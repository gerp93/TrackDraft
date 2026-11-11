import { Part } from '../types/part';
import { PartPlacement } from '../types/partPlacement';
import { PartVersion } from '../types/partVersion';
import { sanitizeDirection } from './partDirection';
import { computePartLabel, getOrderedPartIds } from './partLabel';

/**
 * Renders a song's arrangement in the structure-tag format music models (ACE-Step)
 * expect: a `[Section]` tag line followed by that section's lyric lines.
 *
 * Differs from buildSongContextText (what the Live Song Panel shows) in two ways:
 * a no-lyrics part becomes a bare tag with no "(Instrumental)" body, which the model
 * would otherwise try to sing; and a lyric part with nothing written yet is left out
 * instead of sent as an empty section.
 *
 * A part's direction goes inside its tag as `[Chorus - whispered]`: ACE-Step's docs show
 * descriptors in that form, and keeping it in the tag means the model reads it as a
 * property of the section rather than as a lyric to sing.
 */
export function buildMusicLyrics(
  placements: PartPlacement[],
  parts: Part[],
  latestVersionByPartId: Record<string, PartVersion>
): string {
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const orderedPartIds = getOrderedPartIds(placements.map((p) => p.partId));

  const sections: string[] = [];
  for (const placement of placements) {
    const part = partsById.get(placement.partId);
    if (!part) continue;
    const baseLabel = computePartLabel(part, parts, orderedPartIds);
    const direction = sanitizeDirection(part.direction);
    const label = direction ? `${baseLabel} - ${direction}` : baseLabel;
    const lines = (latestVersionByPartId[part.id]?.lines ?? []).filter((l) => l.trim());
    if (part.noLyrics) {
      sections.push(`[${label}]`);
    } else if (lines.length > 0) {
      sections.push(`[${label}]\n${lines.join('\n')}`);
    }
  }
  return sections.join('\n\n');
}
