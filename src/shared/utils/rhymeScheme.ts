/**
 * Maps each line to its rhyme-group letter per a scheme string like "AABB" or
 * "ABAB", cycling the scheme's letters across non-blank lines in order. Blank
 * lines map to null and don't consume a letter. A null/empty scheme maps every
 * line to null. This is a bookkeeping/labeling aid only -- it doesn't attempt
 * to detect whether lines actually rhyme.
 */
export function getRhymeLineMap(lines: string[], scheme: string | null): (string | null)[] {
  if (!scheme || scheme.trim() === '') {
    return lines.map(() => null);
  }

  const letters = scheme.trim().split('');
  let cursor = 0;

  return lines.map((line) => {
    if (line.trim() === '') return null;
    const letter = letters[cursor % letters.length];
    cursor++;
    return letter;
  });
}
