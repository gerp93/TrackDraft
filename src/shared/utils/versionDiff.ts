import { diffArrays } from 'diff';

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/** Line-level diff between two versions' lyric text. Pure and framework-agnostic -- runs
 * entirely client-side since both versions' `lines` are already loaded in the editor. */
export function diffVersionLines(fromLines: string[], toLines: string[]): DiffLine[] {
  const chunks = diffArrays(fromLines, toLines);
  const result: DiffLine[] = [];

  for (const chunk of chunks) {
    const type: DiffLineType = chunk.added ? 'added' : chunk.removed ? 'removed' : 'unchanged';
    for (const text of chunk.value) {
      result.push({ type, text });
    }
  }

  return result;
}
