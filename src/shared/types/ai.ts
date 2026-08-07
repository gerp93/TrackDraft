export type AiProvider = 'claude' | 'ollama';

export interface AiSettings {
  /** Master switch. When false, nothing in the app attempts to reach a model --
   * not automatically (Autoformat's AI step) and not on explicit request (Ask AI). */
  aiEnabled: boolean;
  provider: AiProvider;
  claudeModel: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
}

export interface AiSettingsWithKeyFlag extends AiSettings {
  hasClaudeKey: boolean;
}

export interface AiTestConnectionResult {
  ok: boolean;
  message: string;
}

/** One labeled piece of a prompt, captured at the point it's built rather than guessed
 * back out of the final string later -- e.g. "Full song context" vs "Instruction". */
export interface AiPromptSegment {
  label: string;
  text: string;
}

/** One record per AI provider call -- captured centrally so every feature (Ask AI,
 * Autoformat's rhyme detection/reorder, etc.) shows up here with no per-feature wiring. */
export interface AiLogEntry {
  id: string;
  timestamp: string;
  provider: AiProvider;
  model: string;
  systemSegments: AiPromptSegment[];
  userSegments: AiPromptSegment[];
  systemPrompt: string;
  userMessage: string;
  response: string | null;
  error: string | null;
  durationMs: number;
}
