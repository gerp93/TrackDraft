/** Longest direction kept. ACE-Step's own guidance is that tag descriptors should stay
 * short ("[Chorus - anthemic]"); long style text belongs in the caption instead. */
export const MAX_DIRECTION_LENGTH = 80;

/**
 * Cleans a part's performance direction so it can sit safely inside a `[Section - direction]`
 * tag: square brackets and newlines would break the tag syntax, so they are removed and
 * whitespace is collapsed. Returns '' when nothing usable is left.
 */
export function sanitizeDirection(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/[\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIRECTION_LENGTH)
    .trim();
}
