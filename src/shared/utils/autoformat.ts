/**
 * Strips trailing whitespace from each line and collapses 2+ consecutive
 * blank lines down to exactly 1 between stanzas. Never touches casing or
 * punctuation -- lyrics intentionally break grammar rules.
 */
export function autoformatLines(lines: string[]): string[] {
  const trimmed = lines.map((line) => line.replace(/\s+$/, ''));

  const result: string[] = [];
  let blankRun = 0;
  for (const line of trimmed) {
    if (line === '') {
      blankRun++;
      if (blankRun <= 1) result.push(line);
    } else {
      blankRun = 0;
      result.push(line);
    }
  }
  return result;
}
