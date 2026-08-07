import { Part, PartType } from '../types/part';

export const PRESET_PART_TYPES: Exclude<PartType, 'custom'>[] = ['chorus', 'verse', 'intro', 'outro', 'bridge'];

/** Only these types can be "repeated" (placed again, same content record) -- a song
 * typically has one distinct verse/bridge/intro/outro per occurrence, but the same
 * chorus recurring verbatim is the common case. */
export const REPEATABLE_PART_TYPES: Exclude<PartType, 'custom'>[] = ['chorus'];

export const PART_TYPE_LABELS: Record<Exclude<PartType, 'custom'>, string> = {
  chorus: 'Chorus',
  verse: 'Verse',
  intro: 'Intro',
  outro: 'Outro',
  bridge: 'Bridge',
};

/**
 * Display name for a part, computed fresh from its type and its rank among same-type
 * parts in the order they appear in the song's arrangement (top to bottom) -- not creation
 * order -- so numbering always matches reading order and updates immediately when parts are
 * added, removed, or reordered. `orderedPartIds` is the song's placements reduced to each
 * part's first appearance, in arrangement order (a repeated part keeps its first rank).
 */
export function computePartLabel(part: Part, allParts: Part[], orderedPartIds: string[]): string {
  if (part.partType === 'custom') return part.customLabel?.trim() || 'Untitled';

  const partsById = new Map(allParts.map((p) => [p.id, p]));
  const sameTypeIds = orderedPartIds.filter((id) => partsById.get(id)?.partType === part.partType);
  const rank = sameTypeIds.indexOf(part.id) + 1;
  const typeName = PART_TYPE_LABELS[part.partType];
  return sameTypeIds.length <= 1 ? typeName : `${typeName} ${rank}`;
}

/** Reduces a song's placements to each distinct part's first appearance, in arrangement order. */
export function getOrderedPartIds(placementPartIdsInOrder: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const partId of placementPartIdsInOrder) {
    if (!seen.has(partId)) {
      seen.add(partId);
      ordered.push(partId);
    }
  }
  return ordered;
}
