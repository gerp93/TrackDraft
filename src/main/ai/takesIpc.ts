import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { SongService } from '../database/songService';
import { SongTakeService } from '../database/songTakeService';
import { SongTake, SongTakePatch, TakeExportResult } from '../../shared/types/songTake';
import { deleteTake } from './songGeneration';
import { copyTakeIntoFolder, copyTakeTo, exportFileName, takeExtension } from './takeExport';

interface Deps {
  songService: SongService;
  songTakeService: SongTakeService;
  getWindow: () => BrowserWindow | null;
}

const CANCELLED: TakeExportResult = { chosen: false, path: null, saved: 0, errors: [] };

/** IPC for take management (star / rename / notes / export / bulk). Kept apart from the
 * generation handlers in main.ts. */
export function registerTakesIpc({ songService, songTakeService, getWindow }: Deps): void {
  /** A take's file-name label needs its number, which is its place among the song's takes. */
  function describe(take: SongTake): { songTitle: string; number: number } {
    const all = songTakeService.getTakesBySong(take.songId); // newest first
    const index = all.findIndex((t) => t.id === take.id);
    return {
      songTitle: songService.getSongById(take.songId)?.title ?? '',
      number: index === -1 ? 0 : all.length - index,
    };
  }

  ipcMain.handle('takes:update', (_, takeId: string, patch: SongTakePatch) =>
    songTakeService.updateTake(takeId, patch)
  );

  ipcMain.handle('takes:setFavorite', (_, takeIds: string[], favorite: boolean) => {
    songTakeService.setFavorite(takeIds, favorite);
    return { success: true };
  });

  ipcMain.handle('takes:delete', (_, takeIds: string[]) => {
    for (const id of takeIds) deleteTake({ songTakeService }, id);
    return { success: true };
  });

  ipcMain.handle('takes:export', async (_, takeId: string): Promise<TakeExportResult> => {
    const take = songTakeService.getTakeById(takeId);
    const win = getWindow();
    if (!take || !win) return CANCELLED;
    const { songTitle, number } = describe(take);
    const ext = takeExtension(take);
    const result = await dialog.showSaveDialog(win, {
      title: 'Export take',
      defaultPath: exportFileName(songTitle, take, number),
      filters: [{ name: `${ext.toUpperCase()} audio`, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return CANCELLED;
    try {
      copyTakeTo(take, result.filePath);
      return { chosen: true, path: result.filePath, saved: 1, errors: [] };
    } catch (err) {
      return { chosen: true, path: null, saved: 0, errors: [err instanceof Error ? err.message : String(err)] };
    }
  });

  ipcMain.handle('takes:exportMany', async (_, takeIds: string[]): Promise<TakeExportResult> => {
    const win = getWindow();
    if (!win || takeIds.length === 0) return CANCELLED;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a folder to export the takes to',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return CANCELLED;
    const dir = result.filePaths[0];
    let saved = 0;
    const errors: string[] = [];
    for (const id of takeIds) {
      const take = songTakeService.getTakeById(id);
      if (!take) continue;
      const { songTitle, number } = describe(take);
      try {
        copyTakeIntoFolder(take, dir, exportFileName(songTitle, take, number));
        saved++;
      } catch (err) {
        errors.push(`Take ${number}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { chosen: true, path: path.resolve(dir), saved, errors };
  });
}
