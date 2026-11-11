import React, { createContext, useContext, useState } from 'react';

interface PrivacyContextType {
  /** In-memory only -- resets to false on every launch/reload, so the app always opens with
   * hidden songs hidden. A privacy screen, not security: no PIN, no encryption. */
  showHidden: boolean;
  setShowHidden: (show: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [showHidden, setShowHidden] = useState(false);
  return <PrivacyContext.Provider value={{ showHidden, setShowHidden }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within PrivacyProvider');
  }
  return context;
}
