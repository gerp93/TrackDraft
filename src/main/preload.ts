import { contextBridge, ipcRenderer } from 'electron';
import { CreateSongInput, UpdateSongInput } from '../shared/types/song';
import { CreatePartInput, UpdatePartInput } from '../shared/types/part';
import { CreatePlacementInput } from '../shared/types/partPlacement';
import { CreatePartVersionInput } from '../shared/types/partVersion';
import { AiSettings } from '../shared/types/ai';

contextBridge.exposeInMainWorld('electronAPI', {
  songs: {
    getAll: () => ipcRenderer.invoke('songs:getAll'),
    getById: (id: string) => ipcRenderer.invoke('songs:getById', id),
    create: (input: CreateSongInput) => ipcRenderer.invoke('songs:create', input),
    update: (id: string, input: UpdateSongInput) => ipcRenderer.invoke('songs:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('songs:delete', id),
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
    reorderForRhymeScheme: (lines: string[], rhymeScheme: string) =>
      ipcRenderer.invoke('ai:reorderForRhymeScheme', lines, rhymeScheme),
    assist: (songId: string, partId: string, instruction: string, rhymeScheme?: string | null) =>
      ipcRenderer.invoke('ai:assist', songId, partId, instruction, rhymeScheme),
    getLog: () => ipcRenderer.invoke('ai:getLog'),
    clearLog: () => ipcRenderer.invoke('ai:clearLog'),
  },
});
