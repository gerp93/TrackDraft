import { PartType } from '../types/part';
import { REPEATABLE_PART_TYPES } from './partLabel';

/** One slot of an imported song's arrangement, before anything is saved. Becomes a new
 * Part (+ its first version) and a placement -- or, when `repeatOf` is set, just another
 * placement of the earlier section's Part (a repeated chorus). */
export interface ImportedSection {
  partType: PartType;
  /** Only used when partType is 'custom'. */
  customLabel: string | null;
  noLyrics: boolean;
  lines: string[];
  /** Index (into the same array) of an earlier section this one repeats, or null. */
  repeatOf: number | null;
}

export interface ImportSongInput {
  title: string;
  sections: ImportedSection[];
}

/** "[Verse 1: Some Artist]" -> "Verse 1"; drops performer credits and repeat counts
 * ("x2", "(2x)") that lyric sites tack onto section tags. */
function cleanTagLabel(raw: string): string {
  return raw
    .replace(/\s*(:|\||\s[-–—]\s).*$/, '') // "Verse 1: Artist", "Chorus | Artist", "Hook - Artist"
    .replace(/\(?\s*[x×]\s*\d+\s*\)?$/i, '')
    .replace(/\(?\s*\d+\s*[x×]\s*\)?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Maps a tag's text to one of the app's part types; anything unrecognized becomes a
 * custom part keeping the tag's own wording (e.g. "Guitar Solo", "Interlude"). */
export function classifySectionLabel(rawLabel: string): { partType: PartType; customLabel: string | null } {
  const label = cleanTagLabel(rawLabel);
  const key = label.toLowerCase().replace(/\s*\d+$/, '').replace(/[\s_]+/g, ' ').trim();

  if (/^pre[\s-]?(chorus|hook)$/.test(key)) return { partType: 'pre-chorus', customLabel: null };
  if (/^(chorus|hook|refrain)$/.test(key)) return { partType: 'chorus', customLabel: null };
  if (/^verse$/.test(key)) return { partType: 'verse', customLabel: null };
  if (/^bridge$/.test(key)) return { partType: 'bridge', customLabel: null };
  if (/^intro$/.test(key)) return { partType: 'intro', customLabel: null };
  if (/^outro$/.test(key)) return { partType: 'outro', customLabel: null };
  return { partType: 'custom', customLabel: label || 'Untitled' };
}

/** Labels like these are usually music-only when they come with no lyric lines. */
const INSTRUMENTAL_LABEL = /\b(solo|instrumental|interlude|break|drop|riff)\b/i;
/** A section whose only body is "(Instrumental)" -- what this app's own Live Song panel
 * writes for a no-lyrics part, so an export round-trips back to a no-lyrics part. */
const INSTRUMENTAL_BODY = /^\(?\s*instrumental\s*\)?$/i;

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

/** Collapses runs of blank lines inside a section to a single stanza break. */
function collapseBlankRuns(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim() && out.length && !out[out.length - 1].trim()) continue;
    out.push(line);
  }
  return out;
}

function contentKey(lines: string[]): string {
  return lines
    .filter((l) => l.trim())
    .map((l) => l.trim().toLowerCase().replace(/\s+/g, ' '))
    .join('\n');
}

function sectionKey(s: Pick<ImportedSection, 'partType' | 'customLabel'>): string {
  return s.partType === 'custom' ? `custom:${(s.customLabel ?? '').toLowerCase()}` : s.partType;
}

/**
 * Links repeats so they share one Part, the way a repeated chorus does in the editor:
 * - a tag with no lyrics under it (e.g. a bare "[Chorus]") repeats the most recent
 *   earlier section with the same label that does have lyrics (verses excepted);
 * - a chorus whose lyrics match an earlier chorus's exactly repeats that one.
 * Mutates and returns `sections`.
 */
export function linkRepeatedSections(sections: ImportedSection[]): ImportedSection[] {
  sections.forEach((section, i) => {
    if (section.repeatOf !== null || section.noLyrics) return;
    const hasLyrics = section.lines.some((l) => l.trim());

    for (let j = i - 1; j >= 0; j--) {
      const earlier = sections[j];
      if (earlier.repeatOf !== null || earlier.noLyrics) continue;
      if (sectionKey(earlier) !== sectionKey(section)) continue;
      if (!earlier.lines.some((l) => l.trim())) continue;
      // A bare "[Verse 2]" is a verse still to be written, not a repeat of Verse 1.
      if (!hasLyrics && section.partType !== 'verse') {
        section.repeatOf = j;
        section.lines = [];
        return;
      }
      if (
        (REPEATABLE_PART_TYPES as PartType[]).includes(section.partType) &&
        contentKey(earlier.lines) === contentKey(section.lines)
      ) {
        section.repeatOf = j;
        section.lines = [];
        return;
      }
    }
  });
  return sections;
}

const TAG_LINE = /^\s*\[([^\]]+)\]\s*$/;

/** True if the text has at least one `[Section]` tag line. */
export function hasSectionTags(text: string): boolean {
  return text.split(/\r?\n/).some((l) => TAG_LINE.test(l));
}

/**
 * Splits pasted lyrics into sections using the `[Section]` tag lines above each one --
 * the format lyric sites and this app's own Live Song panel use -- so a song copied out
 * of TrackDraft imports back as the same parts.
 *
 * With no tags at all, falls back to blank-line-separated stanzas: a stanza that occurs
 * more than once becomes a (repeated) chorus, every other stanza a verse.
 *
 * Text above the first tag (often a site's title/credits line) becomes its own custom
 * "Untitled" section so nothing is silently dropped; it's easy to remove in the preview.
 */
export function parseTaggedLyrics(text: string): ImportedSection[] {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));

  if (!rawLines.some((l) => TAG_LINE.test(l))) {
    return parseUntaggedStanzas(rawLines);
  }

  const sections: ImportedSection[] = [];
  let current: { label: string | null; lines: string[] } = { label: null, lines: [] };

  const flush = () => {
    const lines = collapseBlankRuns(trimBlankEdges(current.lines));
    if (current.label === null) {
      if (lines.length) {
        sections.push({ partType: 'custom', customLabel: 'Untitled', noLyrics: false, lines, repeatOf: null });
      }
      return;
    }
    const { partType, customLabel } = classifySectionLabel(current.label);
    const nonBlank = lines.filter((l) => l.trim());
    const instrumentalBody = nonBlank.length === 1 && INSTRUMENTAL_BODY.test(nonBlank[0].trim());
    const noLyrics =
      instrumentalBody || (nonBlank.length === 0 && partType === 'custom' && INSTRUMENTAL_LABEL.test(customLabel ?? ''));
    sections.push({ partType, customLabel, noLyrics, lines: noLyrics ? [] : lines, repeatOf: null });
  };

  for (const line of rawLines) {
    const tag = line.match(TAG_LINE);
    if (tag) {
      flush();
      current = { label: tag[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();

  return linkRepeatedSections(sections);
}

function parseUntaggedStanzas(rawLines: string[]): ImportedSection[] {
  const stanzas: string[][] = [];
  let current: string[] = [];
  for (const line of rawLines) {
    if (line.trim()) {
      current.push(line);
    } else if (current.length) {
      stanzas.push(current);
      current = [];
    }
  }
  if (current.length) stanzas.push(current);

  const counts = new Map<string, number>();
  for (const s of stanzas) counts.set(contentKey(s), (counts.get(contentKey(s)) ?? 0) + 1);

  const sections: ImportedSection[] = stanzas.map((lines) => ({
    partType: (counts.get(contentKey(lines)) ?? 0) > 1 ? 'chorus' : 'verse',
    customLabel: null,
    noLyrics: false,
    lines,
    repeatOf: null,
  }));
  return linkRepeatedSections(sections);
}

/** The non-blank lines of `text`, in order, for numbering in the AI import prompt. */
export function nonBlankLinesOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim());
}

/** One section as the AI describes it: a range over the numbered non-blank lines. */
export interface AiSectionSpec {
  type: string;
  label?: string | null;
  start?: number | null;
  end?: number | null;
  instrumental?: boolean;
}

/**
 * Turns the AI's section list (line-number ranges into the pasted text's non-blank
 * lines) into sections, copying the user's own lines rather than trusting the model to
 * retype them. Ranges are taken in order; any that overlap an earlier one, run
 * backwards, or point outside the text are dropped. Lines the model left out of every
 * range (site junk like "Embed") are dropped too -- that's the point of AI import.
 * Blank lines that sat between a section's lines in the original are kept as stanza breaks.
 */
export function sectionsFromAiSpecs(text: string, specs: AiSectionSpec[]): ImportedSection[] {
  const allLines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const nonBlankRawIndex: number[] = [];
  allLines.forEach((l, i) => {
    if (l.trim()) nonBlankRawIndex.push(i);
  });
  const total = nonBlankRawIndex.length;

  const sections: ImportedSection[] = [];
  let lastEnd = -1;
  for (const spec of specs) {
    if (!spec || typeof spec !== 'object') continue;
    const typeText = String(spec.type ?? '').trim();
    const labelText = typeof spec.label === 'string' ? spec.label.trim() : '';
    const classified = classifySectionLabel(typeText.toLowerCase() === 'custom' ? labelText : typeText || labelText);
    const { partType } = classified;
    const customLabel = partType === 'custom' ? classified.customLabel || labelText || 'Untitled' : null;

    const start = Number.isInteger(spec.start) ? (spec.start as number) : null;
    const end = Number.isInteger(spec.end) ? (spec.end as number) : start;

    if (start === null || end === null) {
      // No range: an instrumental section, or a bare repeat ("chorus again").
      sections.push({ partType, customLabel, noLyrics: !!spec.instrumental, lines: [], repeatOf: null });
      continue;
    }
    if (start < 0 || end >= total || end < start || start <= lastEnd) continue;
    lastEnd = end;

    // Tag lines are numbered as hints for the model; never keep one as a lyric.
    const lines = collapseBlankRuns(
      trimBlankEdges(allLines.slice(nonBlankRawIndex[start], nonBlankRawIndex[end] + 1).filter((l) => !TAG_LINE.test(l)))
    );
    sections.push({ partType, customLabel, noLyrics: false, lines, repeatOf: null });
  }

  return linkRepeatedSections(sections);
}
