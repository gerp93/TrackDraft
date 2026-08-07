import { Song, CreateSongInput, UpdateSongInput } from '../shared/types/song';
import { Part, CreatePartInput, UpdatePartInput } from '../shared/types/part';
import { PartPlacement, CreatePlacementInput } from '../shared/types/partPlacement';
import { PartVersion, CreatePartVersionInput } from '../shared/types/partVersion';
import { AiLogEntry, AiSettings, AiSettingsWithKeyFlag, AiTestConnectionResult } from '../shared/types/ai';

declare global {
  interface Window {
    electronAPI: {
      songs: {
        getAll: () => Promise<Song[]>;
        getById: (id: string) => Promise<Song | null>;
        create: (input: CreateSongInput) => Promise<Song>;
        update: (id: string, input: UpdateSongInput) => Promise<Song>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      parts: {
        getBySong: (songId: string) => Promise<Part[]>;
        getById: (id: string) => Promise<Part | null>;
        create: (input: CreatePartInput) => Promise<Part>;
        update: (id: string, input: UpdatePartInput) => Promise<Part>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      placements: {
        getBySong: (songId: string) => Promise<PartPlacement[]>;
        create: (input: CreatePlacementInput, atIndex: number) => Promise<PartPlacement>;
        reorder: (songId: string, orderedPlacementIds: string[]) => Promise<PartPlacement[]>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      partVersions: {
        getByPart: (partId: string) => Promise<PartVersion[]>;
        getById: (id: string) => Promise<PartVersion | null>;
        getActiveForPart: (partId: string) => Promise<PartVersion | null>;
        getActiveForSong: (songId: string) => Promise<PartVersion[]>;
        getLatestForSong: (songId: string) => Promise<PartVersion[]>;
        create: (input: CreatePartVersionInput) => Promise<PartVersion>;
        duplicate: (versionId: string) => Promise<PartVersion>;
        updateText: (id: string, lines: string[]) => Promise<PartVersion>;
        updateRhymeScheme: (id: string, rhymeScheme: string | null) => Promise<PartVersion>;
        delete: (id: string) => Promise<{ success: boolean }>;
      };
      dbLocation: {
        get: () => Promise<{ path: string; isDefault: boolean; defaultPath: string }>;
        browseExisting: () => Promise<string | null>;
        browseNew: () => Promise<string | null>;
        set: (newPath: string) => Promise<{ success: boolean }>;
        resetToDefault: () => Promise<{ success: boolean }>;
      };
      app: {
        getVersion: () => Promise<string>;
      };
      updates: {
        check: () => Promise<{
          status: 'available' | 'not-available' | 'error' | 'unsupported';
          version?: string;
          message?: string;
        }>;
      };
      ai: {
        getSettings: () => Promise<AiSettingsWithKeyFlag>;
        setSettings: (partial: Partial<AiSettings>) => Promise<AiSettings>;
        setClaudeApiKey: (key: string) => Promise<{ success: boolean }>;
        clearClaudeApiKey: () => Promise<{ success: boolean }>;
        testConnection: () => Promise<AiTestConnectionResult>;
        listOllamaModels: () => Promise<string[]>;
        suggestRhymeScheme: (lines: string[]) => Promise<{ scheme: string }>;
        reorderForRhymeScheme: (lines: string[], rhymeScheme: string) => Promise<{ lines: string[] }>;
        assist: (
          songId: string,
          partId: string,
          instruction: string,
          rhymeScheme?: string | null
        ) => Promise<{ lines: string[] }>;
        getLog: () => Promise<AiLogEntry[]>;
        clearLog: () => Promise<{ success: boolean }>;
      };
    };
  }
}

export {};
