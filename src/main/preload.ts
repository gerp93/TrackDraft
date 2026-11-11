import { contextBridge, ipcRenderer } from 'electron';
import { CreateSongInput, UpdateSongInput } from '../shared/types/song';
import { CreatePartInput, UpdatePartInput } from '../shared/types/part';
import { CreatePlacementInput } from '../shared/types/partPlacement';
import { CreatePartVersionInput } from '../shared/types/partVersion';
import { AiSettings } from '../shared/types/ai';
import { GenerateSongOptions, SongTakePatch } from '../shared/types/songTake';
import { ImportSongInput } from '../shared/utils/songImport';
import { CreateSoundPresetInput } from '../shared/types/soundPreset';

contextBridge.exposeInMainWorld('electronAPI', {
  songs: {
    getAll: () => ipcRenderer.invoke('songs:getAll'),
    getById: (id: string) => ipcRenderer.invoke('songs:getById', id),
    create: (input: CreateSongInput) => ipcRenderer.invoke('songs:create', input),
    update: (id: string, input: UpdateSongInput) => ipcRenderer.invoke('songs:update', id, input),
    setHidden: (id: string, hidden: boolean) => ipcRenderer.invoke('songs:setHidden', id, hidden),
    delete: (id: string) => ipcRenderer.invoke('songs:delete', id),
    import: (input: ImportSongInput) => ipcRenderer.invoke('songs:import', input),
  },

  parts: {
    getBySong: (songId: string) => ipcRenderer.invoke('parts:getBySong', songId),
    getById: (id: string) => ipcRenderer.invoke('parts:getById', id),
    create: (input: CreatePartInput) => ipcRenderer.invoke('parts:create', input),
    update: (id: string, input: UpdatePartInput) => ipcRenderer.invoke('parts:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('parts:delete', id),
  },

  placements: {
    getBySong: (songId: string) => ipcRenderer.invoke('placements:getBySong', songId),
    create: (input: CreatePlacementInput, atIndex: number) =>
      ipcRenderer.invoke('placements:create', input, atIndex),
    reorder: (songId: string, orderedPlacementIds: string[]) =>
      ipcRenderer.invoke('placements:reorder', songId, orderedPlacementIds),
    delete: (id: string) => ipcRenderer.invoke('placements:delete', id),
  },

  partVersions: {
    getByPart: (partId: string) => ipcRenderer.invoke('partVersions:getByPart', partId),
    getById: (id: string) => ipcRenderer.invoke('partVersions:getById', id),
    getActiveForPart: (partId: string) => ipcRenderer.invoke('partVersions:getActiveForPart', partId),
    getActiveForSong: (songId: string) => ipcRenderer.invoke('partVersions:getActiveForSong', songId),
    getLatestForSong: (songId: string) => ipcRenderer.invoke('partVersions:getLatestForSong', songId),
    create: (input: CreatePartVersionInput) => ipcRenderer.invoke('partVersions:create', input),
    duplicate: (versionId: string) => ipcRenderer.invoke('partVersions:duplicate', versionId),
    updateText: (id: string, lines: string[]) => ipcRenderer.invoke('partVersions:updateText', id, lines),
    updateRhymeScheme: (id: string, rhymeScheme: string | null) =>
      ipcRenderer.invoke('partVersions:updateRhymeScheme', id, rhymeScheme),
    delete: (id: string) => ipcRenderer.invoke('partVersions:delete', id),
  },

  dbLocation: {
    get: () => ipcRenderer.invoke('dbLocation:get'),
    browseExisting: () => ipcRenderer.invoke('dbLocation:browseExisting'),
    browseNew: () => ipcRenderer.invoke('dbLocation:browseNew'),
    set: (newPath: string) => ipcRenderer.invoke('dbLocation:set', newPath),
    resetToDefault: () => ipcRenderer.invoke('dbLocation:resetToDefault'),
    showInFolder: () => ipcRenderer.invoke('dbLocation:showInFolder'),
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },

  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
  },

  ai: {
    getSettings: () => ipcRenderer.invoke('ai:getSettings'),
    setSettings: (partial: Partial<AiSettings>) => ipcRenderer.invoke('ai:setSettings', partial),
    setClaudeApiKey: (key: string) => ipcRenderer.invoke('ai:setClaudeApiKey', key),
    clearClaudeApiKey: () => ipcRenderer.invoke('ai:clearClaudeApiKey'),
    testConnection: () => ipcRenderer.invoke('ai:testConnection'),
    listOllamaModels: () => ipcRenderer.invoke('ai:listOllamaModels'),
    suggestRhymeScheme: (lines: string[]) => ipcRenderer.invoke('ai:suggestRhymeScheme', lines),
    splitLyrics: (text: string) => ipcRenderer.invoke('ai:splitLyrics', text),
    reorderForRhymeScheme: (lines: string[], rhymeScheme: string) =>
      ipcRenderer.invoke('ai:reorderForRhymeScheme', lines, rhymeScheme),
    assist: (songId: string, partId: string, instruction: string, rhymeScheme?: string | null) =>
      ipcRenderer.invoke('ai:assist', songId, partId, instruction, rhymeScheme),
    getLog: () => ipcRenderer.invoke('ai:getLog'),
    clearLog: () => ipcRenderer.invoke('ai:clearLog'),
  },

  presets: {
    getAll: () => ipcRenderer.invoke('presets:getAll'),
    create: (input: CreateSoundPresetInput) => ipcRenderer.invoke('presets:create', input),
    delete: (id: string) => ipcRenderer.invoke('presets:delete', id),
  },

  music: {
    testConnection: () => ipcRenderer.invoke('music:testConnection'),
    serverStatus: () => ipcRenderer.invoke('music:serverStatus'),
    startServer: () => ipcRenderer.invoke('music:startServer'),
    stopServer: () => ipcRenderer.invoke('music:stopServer'),
    browseServerDir: () => ipcRenderer.invoke('music:browseServerDir'),
    generate: (songId: string, options?: GenerateSongOptions) => ipcRenderer.invoke('music:generate', songId, options),
    getActive: (songId: string) => ipcRenderer.invoke('music:getActive', songId),
    getTakes: (songId: string) => ipcRenderer.invoke('music:getTakes', songId),
    getTakeAudio: (takeId: string) => ipcRenderer.invoke('music:getTakeAudio', takeId),
    deleteTake: (takeId: string) => ipcRenderer.invoke('music:deleteTake', takeId),
  },
  takes: {
    update: (takeId: string, patch: SongTakePatch) => ipcRenderer.invoke('takes:update', takeId, patch),
    setFavorite: (takeIds: string[], favorite: boolean) => ipcRenderer.invoke('takes:setFavorite', takeIds, favorite),
    delete: (takeIds: string[]) => ipcRenderer.invoke('takes:delete', takeIds),
    export: (takeId: string) => ipcRenderer.invoke('takes:export', takeId),
    exportMany: (takeIds: string[]) => ipcRenderer.invoke('takes:exportMany', takeIds),
  },
});
