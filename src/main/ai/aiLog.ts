import { v4 as uuidv4 } from 'uuid';
import { AiLogEntry, AiProvider, AiPromptSegment } from '../../shared/types/ai';

const MAX_LOG_ENTRIES = 50;

let log: AiLogEntry[] = [];

/** In-memory only, newest first, capped at MAX_LOG_ENTRIES -- this is a debugging/
 * transparency aid, not a durable record, so it doesn't survive an app restart. */
export function recordAiCall(entry: {
  provider: AiProvider;
  model: string;
  systemSegments: AiPromptSegment[];
  userSegments: AiPromptSegment[];
  systemPrompt: string;
  userMessage: string;
  response: string | null;
  error: string | null;
  durationMs: number;
}): void {
  log.unshift({ id: uuidv4(), timestamp: new Date().toISOString(), ...entry });
  if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
}

export function getAiLog(): AiLogEntry[] {
  return log;
}

export function clearAiLog(): void {
  log = [];
}
