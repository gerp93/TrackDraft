import React, { createContext, useContext, useEffect, useState } from 'react';

interface AiSettingsContextType {
  aiEnabled: boolean;
  /** Re-reads settings from the main process -- call after any change so every
   * consumer (e.g. the top nav) picks it up immediately, not just on next mount. */
  refresh: () => Promise<void>;
}

const AiSettingsContext = createContext<AiSettingsContextType | undefined>(undefined);

export function AiSettingsProvider({ children }: { children: React.ReactNode }) {
  const [aiEnabled, setAiEnabled] = useState(false);

  async function refresh() {
    const settings = await window.electronAPI.ai.getSettings();
    setAiEnabled(settings.aiEnabled);
  }

  useEffect(() => {
    refresh();
  }, []);

  return <AiSettingsContext.Provider value={{ aiEnabled, refresh }}>{children}</AiSettingsContext.Provider>;
}

export function useAiSettings() {
  const context = useContext(AiSettingsContext);
  if (!context) {
    throw new Error('useAiSettings must be used within AiSettingsProvider');
  }
  return context;
}
