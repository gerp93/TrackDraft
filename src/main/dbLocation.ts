import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

interface AppConfig {
  dbPath?: string;
}

// A local dev run (npm run dev) and a packaged/installed build must never
// share a userData folder. Both would open the same SQLite file (WAL mode
// tolerates concurrent connections, but two app versions with different schemas
// writing to one database, or one running the one-time sql.js migration while the
// other has it open, is exactly the mix-up this prevents). Call this before
// anything else touches app.getPath('userData') (must run before Electron's
// 'ready' event).
export function pinUserDataPath(): void {
  const dirName = app.isPackaged ? 'trackdraft' : 'trackdraft-dev';
  app.setPath('userData', path.join(app.getPath('appData'), dirName));
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function readConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config: AppConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function getDefaultDbPath(): string {
  return path.join(app.getPath('userData'), 'trackdraft.db');
}

// The raw configured override, if any — does NOT fall back to the default.
// Use this to detect a missing custom path before silently creating a new,
// empty database in its place.
export function getConfiguredDbPath(): string | undefined {
  const configured = readConfig().dbPath;
  return configured && configured.trim() !== '' ? configured : undefined;
}

/** The database file the app will actually load on startup: a user-chosen location, or the default. */
export function getEffectiveDbPath(): string {
  return getConfiguredDbPath() ?? getDefaultDbPath();
}

export function isUsingDefaultLocation(): boolean {
  return !getConfiguredDbPath();
}

/**
 * Point the app at a different SQLite file. If nothing exists yet at the new
 * location, the current database is copied there first so no data is lost.
 * The caller must closeDatabase() first: the copy takes only the main file, and
 * recent commits live in the -wal sidecar until the database is checkpointed.
 * If a file already exists there, it's left alone and simply adopted as-is.
 */
export function setDbPath(newPath: string): void {
  const currentPath = getEffectiveDbPath();

  if (!fs.existsSync(newPath) && fs.existsSync(currentPath)) {
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.copyFileSync(currentPath, newPath);
  }

  writeConfig({ ...readConfig(), dbPath: newPath });
}

export function resetToDefaultDbPath(): void {
  const config = readConfig();
  delete config.dbPath;
  writeConfig(config);
}
