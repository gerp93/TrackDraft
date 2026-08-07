import * as path from 'path';
import * as fs from 'fs';
import { app, safeStorage } from 'electron';
import { AiSettings } from '../../shared/types/ai';

const DEFAULT_SETTINGS: AiSettings = {
  aiEnabled: false,
  provider: 'ollama',
  claudeModel: 'claude-opus-5',
  ollamaModel: '',
  // 127.0.0.1, not 'localhost' -- Ollama binds IPv4-only, and Node's fetch on Windows can
  // resolve 'localhost' to the IPv6 loopback first and fail before ever trying IPv4.
  ollamaBaseUrl: 'http://127.0.0.1:11434',
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'ai-config.json');
}

function getKeyPath(): string {
  return path.join(app.getPath('userData'), 'claude-api-key.enc');
}

export function getAiSettings(): AiSettings {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return { ...DEFAULT_SETTINGS };
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setAiSettings(partial: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(), ...partial };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2));
  return next;
}

export function hasClaudeApiKey(): boolean {
  return fs.existsSync(getKeyPath());
}

/** Encrypted at rest via the OS keychain/DPAPI -- deliberately kept out of both the
 * JSON settings file and the SQLite database (which the user can point at a synced
 * folder; an OS-encrypted blob would be unreadable garbage on another machine anyway). */
export function setClaudeApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this system.');
  }
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(getKeyPath(), encrypted);
}

export function getClaudeApiKey(): string | null {
  const keyPath = getKeyPath();
  if (!fs.existsSync(keyPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = fs.readFileSync(keyPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function clearClaudeApiKey(): void {
  const keyPath = getKeyPath();
  if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
}
