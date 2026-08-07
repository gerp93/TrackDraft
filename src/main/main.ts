import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { initDatabase, saveDatabase } from './database/schema';
import {
  getEffectiveDbPath,
  getDefaultDbPath,
  isUsingDefaultLocation,
  setDbPath,
  resetToDefaultDbPath,
} from './dbLocation';
import { SongService } from './database/songService';
import { PartService } from './database/partService';
import { PartPlacementService } from './database/partPlacementService';
import { PartVersionService } from './database/partVersionService';
import { CreateSongInput, UpdateSongInput } from '../shared/types/song';
import { CreatePartInput, UpdatePartInput } from '../shared/types/part';
import { CreatePlacementInput } from '../shared/types/partPlacement';
import { CreatePartVersionInput } from '../shared/types/partVersion';
import { AiSettings } from '../shared/types/ai';
import { Database } from 'sql.js';
import {
  clearClaudeApiKey,
  getAiSettings,
  hasClaudeApiKey,
  setAiSettings,
  setClaudeApiKey,
} from './ai/aiConfig';
import { listOllamaModels } from './ai/ollamaProvider';
import { assist, reorderForRhymeScheme, suggestRhymeScheme, testConnection } from './ai/aiService';
import { clearAiLog, getAiLog } from './ai/aiLog';

// Packaged builds resolve app.getPath('userData') from build.productName ("TrackDraft"),
// while `electron .` in dev resolves it from package.json's "name" ("trackdraft") -- pin it
// so both modes always read/write the same data folder instead of silently diverging.
app.setName('trackdraft');

let mainWindow: BrowserWindow | null = null;
let db: Database | null = null;
let songService: SongService;
let partService: PartService;
let partPlacementService: PartPlacementService;
let partVersionService: PartVersionService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    backgroundColor: '#f5f5f5',
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update ready',
        message: `TrackDraft ${info.version} has been downloaded.`,
        detail: 'Restart now to install it, or it will install automatically the next time you quit.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Failed to check for updates:', err);
  });
}

interface UpdateCheckResult {
  status: 'available' | 'not-available' | 'error' | 'unsupported';
  version?: string;
  message?: string;
}

function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    return Promise.resolve({ status: 'unsupported' });
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
    };
    const onAvailable = (info: { version: string }) => {
      cleanup();
      resolve({ status: 'available', version: info.version });
    };
    const onNotAvailable = () => {
      cleanup();
      resolve({ status: 'not-available' });
    };
    const onError = (err: Error) => {
      cleanup();
      const message = err?.message ?? String(err);
      resolve({
        status: 'error',
        message: message.includes('Cannot find latest')
          ? 'A new version may still be uploading -- try again in a few minutes.'
          : message,
      });
    };

    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    autoUpdater.checkForUpdates().catch(onError);
  });
}

app.whenReady().then(async () => {
  db = await initDatabase();
  songService = new SongService(db);
  partService = new PartService(db);
  partPlacementService = new PartPlacementService(db);
  partVersionService = new PartVersionService(db);

  registerIPCHandlers();

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    saveDatabase(db);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerIPCHandlers() {
  // Song handlers
  ipcMain.handle('songs:getAll', () => songService.getAllSongs());
  ipcMain.handle('songs:getById', (_, id: string) => songService.getSongById(id));
  ipcMain.handle('songs:create', (_, input: CreateSongInput) => songService.createSong(input));
  ipcMain.handle('songs:update', (_, id: string, input: UpdateSongInput) => songService.updateSong(id, input));
  ipcMain.handle('songs:delete', (_, id: string) => {
    songService.deleteSong(id);
    return { success: true };
  });

  // Part (content) handlers
  ipcMain.handle('parts:getBySong', (_, songId: string) => partService.getPartsBySong(songId));
  ipcMain.handle('parts:getById', (_, id: string) => partService.getPartById(id));
  ipcMain.handle('parts:create', (_, input: CreatePartInput) => partService.createPart(input));
  ipcMain.handle('parts:update', (_, id: string, input: UpdatePartInput) => partService.updatePart(id, input));
  ipcMain.handle('parts:delete', (_, id: string) => {
    partService.deletePart(id);
    return { success: true };
  });

  // Placement (arrangement) handlers -- where a part appears in the song's top-to-bottom order
  ipcMain.handle('placements:getBySong', (_, songId: string) => partPlacementService.getPlacementsBySong(songId));
  ipcMain.handle('placements:create', (_, input: CreatePlacementInput, atIndex: number) =>
    partPlacementService.createPlacement(input, atIndex)
  );
  ipcMain.handle('placements:reorder', (_, songId: string, orderedPlacementIds: string[]) =>
    partPlacementService.reorderPlacements(songId, orderedPlacementIds)
  );
  ipcMain.handle('placements:delete', (_, id: string) => {
    partPlacementService.deletePlacement(id);
    return { success: true };
  });

  // Part version handlers
  ipcMain.handle('partVersions:getByPart', (_, partId: string) => partVersionService.getVersionsByPart(partId));
  ipcMain.handle('partVersions:getById', (_, id: string) => partVersionService.getVersionById(id));
  ipcMain.handle('partVersions:getActiveForPart', (_, partId: string) =>
    partVersionService.getActiveVersionForPart(partId)
  );
  ipcMain.handle('partVersions:getActiveForSong', (_, songId: string) =>
    partVersionService.getActiveVersionsForSong(songId)
  );
  ipcMain.handle('partVersions:getLatestForSong', (_, songId: string) =>
    partVersionService.getLatestVersionsForSong(songId)
  );
  ipcMain.handle('partVersions:create', (_, input: CreatePartVersionInput) =>
    partVersionService.createVersion(input)
  );
  ipcMain.handle('partVersions:duplicate', (_, versionId: string) =>
    partVersionService.duplicateVersion(versionId)
  );
  ipcMain.handle('partVersions:updateText', (_, id: string, lines: string[]) =>
    partVersionService.updateVersionText(id, lines)
  );
  ipcMain.handle('partVersions:updateRhymeScheme', (_, id: string, rhymeScheme: string | null) =>
    partVersionService.updateVersionRhymeScheme(id, rhymeScheme)
  );
  ipcMain.handle('partVersions:delete', (_, id: string) => {
    partVersionService.deleteVersion(id);
    return { success: true };
  });

  // Database location handlers
  ipcMain.handle('dbLocation:get', () => ({
    path: getEffectiveDbPath(),
    isDefault: isUsingDefaultLocation(),
    defaultPath: getDefaultDbPath(),
  }));

  ipcMain.handle('dbLocation:browseExisting', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose an existing TrackDraft database file',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dbLocation:browseNew', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Choose where to store the TrackDraft database',
      defaultPath: 'trackdraft.db',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.handle('dbLocation:set', (_, newPath: string) => {
    if (db) {
      saveDatabase(db);
    }
    setDbPath(newPath);
    app.relaunch();
    app.exit();
    return { success: true };
  });

  ipcMain.handle('dbLocation:resetToDefault', () => {
    if (db) {
      saveDatabase(db);
    }
    resetToDefaultDbPath();
    app.relaunch();
    app.exit();
    return { success: true };
  });

  // App / update handlers
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('updates:check', () => checkForUpdatesNow());

  // AI handlers
  ipcMain.handle('ai:getSettings', () => ({ ...getAiSettings(), hasClaudeKey: hasClaudeApiKey() }));
  ipcMain.handle('ai:setSettings', (_, partial: Partial<AiSettings>) => setAiSettings(partial));
  ipcMain.handle('ai:setClaudeApiKey', (_, key: string) => {
    setClaudeApiKey(key);
    return { success: true };
  });
  ipcMain.handle('ai:clearClaudeApiKey', () => {
    clearClaudeApiKey();
    return { success: true };
  });
  ipcMain.handle('ai:testConnection', () => testConnection());
  ipcMain.handle('ai:listOllamaModels', () => listOllamaModels(getAiSettings().ollamaBaseUrl));
  ipcMain.handle('ai:suggestRhymeScheme', (_, lines: string[]) => suggestRhymeScheme(lines));
  ipcMain.handle('ai:reorderForRhymeScheme', async (_, lines: string[], rhymeScheme: string) => ({
    lines: await reorderForRhymeScheme(lines, rhymeScheme),
  }));
  ipcMain.handle(
    'ai:assist',
    (_, songId: string, partId: string, instruction: string, rhymeScheme?: string | null) =>
      assist({ partPlacementService, partService, partVersionService }, songId, partId, instruction, rhymeScheme)
  );
  ipcMain.handle('ai:getLog', () => getAiLog());
  ipcMain.handle('ai:clearLog', () => {
    clearAiLog();
    return { success: true };
  });
}
