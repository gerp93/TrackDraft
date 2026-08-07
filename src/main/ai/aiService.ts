import { PartPlacementService } from '../database/partPlacementService';
import { PartService } from '../database/partService';
import { PartVersionService } from '../database/partVersionService';
import { AiPromptSegment, AiTestConnectionResult } from '../../shared/types/ai';
import { buildSongContextText } from '../../shared/utils/songContext';
import { computePartLabel, getOrderedPartIds } from '../../shared/utils/partLabel';
import { getAiSettings, getClaudeApiKey } from './aiConfig';
import { claudeChat } from './claudeProvider';
import { listOllamaModels, ollamaChat } from './ollamaProvider';
import { recordAiCall } from './aiLog';

interface Services {
  partPlacementService: PartPlacementService;
  partService: PartService;
  partVersionService: PartVersionService;
}

/** Guards every explicit/automatic AI feature (not testConnection, which must work
 * regardless of the toggle so the provider can be verified before turning it on). */
function assertAiEnabled(): void {
  if (!getAiSettings().aiEnabled) {
    throw new Error('AI features are turned off -- enable them in Settings first.');
  }
}

function joinSegments(segments: AiPromptSegment[]): string {
  return segments.map((s) => s.text).join('\n\n');
}

/** Every real AI feature (Ask AI, Autoformat's scheme detection/reorder, rhyme
 * suggestion) goes through this one function -- so this is also the one place that
 * needs to record to the AI log, with no per-feature wiring. testConnection() calls
 * the providers directly and deliberately bypasses this (see its own comment).
 *
 * Callers pass labeled segments instead of one flat string per side -- the log then
 * shows the real, source-captured structure of the prompt (e.g. "Full song context"
 * vs "Instruction") rather than something re-parsed/guessed out of the joined text. */
async function chat(systemSegments: AiPromptSegment[], userSegments: AiPromptSegment[]): Promise<string> {
  const systemPrompt = joinSegments(systemSegments);
  const userMessage = joinSegments(userSegments);
  const settings = getAiSettings();
  const model = settings.provider === 'claude' ? settings.claudeModel : settings.ollamaModel;
  const start = Date.now();
  try {
    let response: string;
    if (settings.provider === 'claude') {
      const apiKey = getClaudeApiKey();
      if (!apiKey) {
        throw new Error('No Claude API key set -- add one in Settings.');
      }
      response = await claudeChat(apiKey, settings.claudeModel, systemPrompt, userMessage);
    } else {
      response = await ollamaChat(settings.ollamaBaseUrl, settings.ollamaModel, systemPrompt, userMessage);
    }
    recordAiCall({
      provider: settings.provider,
      model,
      systemSegments,
      userSegments,
      systemPrompt,
      userMessage,
      response,
      error: null,
      durationMs: Date.now() - start,
    });
    return response;
  } catch (err) {
    recordAiCall({
      provider: settings.provider,
      model,
      systemSegments,
      userSegments,
      systemPrompt,
      userMessage,
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

export async function testConnection(): Promise<AiTestConnectionResult> {
  const settings = getAiSettings();
  try {
    if (settings.provider === 'claude') {
      const apiKey = getClaudeApiKey();
      if (!apiKey) return { ok: false, message: 'No API key set.' };
      await claudeChat(apiKey, settings.claudeModel, 'Reply with exactly: OK', 'Say OK.');
      return { ok: true, message: `Claude API reachable (${settings.claudeModel}).` };
    }
    const models = await listOllamaModels(settings.ollamaBaseUrl);
    return { ok: true, message: `Ollama reachable (${models.length} model${models.length === 1 ? '' : 's'} available).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Rough heuristic: does the instruction itself ask for a different length? If so, we
 * shouldn't enforce/truncate toward the current length -- that would fight the user's
 * actual request. Imperfect (keyword-based), but the failure modes are low-risk: a
 * missed phrasing just falls back to enforcing length, an over-match just skips
 * enforcement, and neither breaks anything. */
const LENGTH_CHANGE_PATTERN =
  /\b(longer|shorter|extend|expand|shrink|trim|cut (it )?down|add (a |another )?(verse|stanza|line)|more lines|fewer lines|double|twice as (long|many)|half as (long|many))\b/i;

/** Trims lines from the end (respecting blank-line separators) until at most
 * targetNonBlankCount non-blank lines remain -- used to enforce a length the model was
 * told to hit but may not have (small/local models routinely ignore count instructions,
 * especially alongside a rhyme-scheme constraint). Never adds lines; only trims excess. */
function truncateToLineCount(lines: string[], targetNonBlankCount: number): string[] {
  const result: string[] = [];
  let nonBlankCount = 0;
  for (const line of lines) {
    if (nonBlankCount >= targetNonBlankCount) break;
    result.push(line);
    if (line.trim()) nonBlankCount++;
  }
  while (result.length && !result[result.length - 1].trim()) result.pop();
  return result;
}

/** Strips code fences and an echoed `[LABEL]` header line the model sometimes repeats. */
function postProcessLyrics(raw: string): string[] {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  if (lines[0] && /^\[.+\]$/.test(lines[0].trim())) lines.shift();
  return lines;
}

export async function suggestRhymeScheme(lines: string[]): Promise<{ scheme: string }> {
  assertAiEnabled();
  // Too little to analyze is treated the same as "no clear rhyme found" -- both mean
  // "nothing to suggest yet", not a failure worth interrupting the (otherwise silent,
  // background) Autoformat flow for.
  if (lines.filter((l) => l.trim()).length < 2) {
    return { scheme: '' };
  }

  const systemSegments: AiPromptSegment[] = [
    {
      label: 'Instructions',
      text:
        'You analyze song lyrics and identify their rhyme scheme. Respond with ONLY the rhyme scheme pattern ' +
        '(e.g. AABB, ABAB, ABCB) using consecutive capital letters, one per non-blank line, or the single word ' +
        '"none" if there is no clear rhyme pattern. Do not include any other text, punctuation, or explanation.',
    },
  ];
  const userSegments: AiPromptSegment[] = [{ label: 'Lyrics', text: lines.join('\n') }];

  const raw = await chat(systemSegments, userSegments);
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === 'NONE') return { scheme: '' };

  const scheme = cleaned.replace(/[^A-Z]/g, '');
  if (!scheme || scheme.length > 30) {
    throw new Error('AI returned an unexpected response for the rhyme scheme.');
  }
  return { scheme };
}

/**
 * Reorders EXISTING non-blank lines (never rewrites/invents text) so they fit a rhyme
 * scheme, by asking the AI which lines already rhyme and applying its suggested
 * permutation ourselves -- we never trust the model to retype lines verbatim. Blank
 * lines (stanza breaks) stay fixed at their original positions.
 */
export async function reorderForRhymeScheme(lines: string[], rhymeScheme: string): Promise<string[]> {
  assertAiEnabled();
  const scheme = rhymeScheme.trim().toUpperCase();
  if (!scheme) {
    throw new Error('Set a rhyme scheme first.');
  }

  const nonBlankIndices: number[] = [];
  const nonBlankLines: string[] = [];
  lines.forEach((line, i) => {
    if (line.trim()) {
      nonBlankIndices.push(i);
      nonBlankLines.push(line);
    }
  });

  if (nonBlankLines.length < 2) {
    throw new Error('Not enough lyric lines to reorder yet.');
  }

  const numbered = nonBlankLines.map((line, i) => `${i}: ${line}`).join('\n');
  const systemSegments: AiPromptSegment[] = [
    {
      label: 'Instructions',
      text:
        'You reorder existing song lyric lines -- without changing any words -- so they fit a target rhyme scheme. ' +
        "You'll get numbered lines and a scheme pattern. The pattern's letters cycle across the lines in order " +
        '(wrapping if there are more lines than letters); lines assigned the same letter must rhyme with each ' +
        'other. Find a reordering of the given line numbers that satisfies the pattern using the words already ' +
        'present -- do not invent, edit, or reword any line. Respond with ONLY a JSON array of the line numbers ' +
        'in their new order (e.g. [2,0,3,1]), using every number exactly once. No other text.',
    },
  ];
  const userSegments: AiPromptSegment[] = [
    { label: 'Rhyme scheme', text: `Rhyme scheme: ${scheme}` },
    { label: 'Numbered lines', text: numbered },
  ];

  const raw = await chat(systemSegments, userSegments);
  const match = raw.match(/\[[\d,\s]*\]/);
  let order: unknown = null;
  if (match) {
    try {
      order = JSON.parse(match[0]);
    } catch {
      order = null;
    }
  }

  const expectedLength = nonBlankLines.length;
  const seen = Array.isArray(order) ? new Set(order) : null;
  const isValidPermutation =
    Array.isArray(order) &&
    order.length === expectedLength &&
    seen!.size === expectedLength &&
    nonBlankLines.every((_, i) => seen!.has(i));

  if (!isValidPermutation) {
    throw new Error(
      "AI couldn't find a reordering of your existing lines that fits this rhyme scheme -- try Ask AI to write new lines for it instead."
    );
  }

  const reordered = [...lines];
  (order as number[]).forEach((originalPos, newSlot) => {
    reordered[nonBlankIndices[newSlot]] = nonBlankLines[originalPos];
  });
  return reordered;
}

export async function assist(
  services: Services,
  songId: string,
  partId: string,
  instruction: string,
  rhymeScheme?: string | null
): Promise<{ lines: string[] }> {
  assertAiEnabled();
  const trimmedInstruction = instruction.trim();
  if (!trimmedInstruction) {
    throw new Error('Enter an instruction for the AI first.');
  }
  const trimmedScheme = rhymeScheme?.trim().toUpperCase() || null;

  const placements = services.partPlacementService.getPlacementsBySong(songId);
  const parts = services.partService.getPartsBySong(songId);
  const latestVersions = services.partVersionService.getLatestVersionsForSong(songId);

  const targetPart = parts.find((p) => p.id === partId);
  if (!targetPart) {
    throw new Error('Part not found.');
  }

  const latestByPartId: Record<string, (typeof latestVersions)[number]> = {};
  for (const v of latestVersions) latestByPartId[v.partId] = v;

  const contextText = buildSongContextText(placements, parts, latestByPartId);
  const orderedPartIds = getOrderedPartIds(placements.map((p) => p.partId));
  const targetLabel = computePartLabel(targetPart, parts, orderedPartIds).toUpperCase();
  const currentLines = latestByPartId[partId]?.lines ?? [];

  const systemSegments: AiPromptSegment[] = [
    {
      label: 'Role & output format',
      text:
        'You are a songwriting assistant helping write or revise ONE specific section of a song. ' +
        "You'll see the full song's current lyrics for context, then an instruction for a single section. " +
        'Return ONLY the lyric lines for that section, one per line, one lyric line per line of output -- ' +
        'no section tags, no explanations, no quotes, no markdown code fences.',
    },
  ];

  if (trimmedScheme) {
    systemSegments.push({
      label: 'Rhyme scheme requirement',
      text:
        `The section must follow this rhyme scheme: ${trimmedScheme}. Each letter is one non-blank lyric ` +
        'line, in order; lines sharing the same letter must rhyme with each other. If the section needs more ' +
        `lines than the pattern has letters, cycle the pattern from the start again (e.g. "${trimmedScheme}" ` +
        `becomes ${trimmedScheme}${trimmedScheme} for twice as many lines).`,
    });
  }

  // Ask the model to hit a fixed count (helps some models), but don't rely on it --
  // smaller/local models routinely ignore explicit line-count instructions. The actual
  // enforcement happens below, after the response comes back: if it overshoots, we
  // truncate it ourselves rather than hoping the prompt was followed. Skipped entirely
  // when the instruction itself seems to ask for a different length -- enforcing the
  // old length would fight that request.
  // Target the exact current count -- no rounding to a "whole cycle" of the rhyme
  // scheme. The app's own rhyme-scheme rendering (getRhymeLineMap) already cycles a
  // scheme's letters across however many lines exist and simply stops wherever they
  // end, with no requirement that the count be a multiple of the pattern length; a
  // 6-line section with a 4-letter scheme is completely normal (A,B,A,B,A,B). Rounding
  // the target up to the next full cycle here would contradict that and grow sections
  // the user didn't ask to grow.
  const currentNonBlankCount = currentLines.filter((l) => l.trim()).length;
  const wantsLengthChange = LENGTH_CHANGE_PATTERN.test(trimmedInstruction);
  let targetLineCount: number | null = null;
  if (currentNonBlankCount > 0 && !wantsLengthChange) {
    targetLineCount = currentNonBlankCount;
    systemSegments.push({
      label: 'Length guidance',
      text:
        `Write exactly ${targetLineCount} lyric line${targetLineCount === 1 ? '' : 's'} for this section (the ` +
        `current version has ${currentNonBlankCount}) -- unless the instruction below explicitly asks for a ` +
        'different length (e.g. "make it longer", "add a verse", "cut it down"), in which case follow the ' +
        "instruction's length intent instead. Do not pad, expand, or add extra stanzas beyond the target.",
    });
  }

  const userSegments: AiPromptSegment[] = [
    { label: 'Full song context', text: contextText || '(nothing written yet)' },
    { label: 'Instruction', text: `Instruction for the [${targetLabel}] section: ${trimmedInstruction}` },
    {
      label: 'Current lyrics for this section',
      text: currentLines.length ? currentLines.join('\n') : '(empty)',
    },
  ];

  const raw = await chat(systemSegments, userSegments);
  let lines = postProcessLyrics(raw);
  if (lines.length === 0 || lines.every((l) => !l.trim())) {
    throw new Error('AI returned an empty response.');
  }

  if (targetLineCount !== null) {
    const actualNonBlankCount = lines.filter((l) => l.trim()).length;
    if (actualNonBlankCount > targetLineCount) {
      lines = truncateToLineCount(lines, targetLineCount);
    }
  }

  return { lines };
}
