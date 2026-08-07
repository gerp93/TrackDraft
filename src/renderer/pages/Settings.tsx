import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAiSettings } from '../context/AiSettingsContext';
import { THEME_LABELS } from '../utils/themes';
import { AiProvider, AiSettingsWithKeyFlag } from '../../shared/types/ai';

const CLAUDE_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];

export default function Settings() {
  const { currentTheme, setTheme, availableThemes } = useTheme();
  const { refresh: refreshAiSettingsContext } = useAiSettings();

  const [dbLocation, setDbLocation] = useState<{ path: string; isDefault: boolean; defaultPath: string } | null>(
    null
  );
  const [dbBusy, setDbBusy] = useState(false);

  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'unsupported'
  >('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const [aiSettings, setAiSettingsState] = useState<AiSettingsWithKeyFlag | null>(null);
  const [claudeKeyInput, setClaudeKeyInput] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    window.electronAPI.dbLocation.get().then(setDbLocation);
    window.electronAPI.app.getVersion().then(setAppVersion);
    window.electronAPI.ai.getSettings().then(setAiSettingsState);
  }, []);

  async function refreshAiSettings() {
    const next = await window.electronAPI.ai.getSettings();
    setAiSettingsState(next);
    return next;
  }

  async function handleToggleAiEnabled(aiEnabled: boolean) {
    setAiBusy(true);
    setAiTestResult(null);
    await window.electronAPI.ai.setSettings({ aiEnabled });
    await refreshAiSettings();
    await refreshAiSettingsContext();
    setAiBusy(false);
  }

  async function handleProviderChange(provider: AiProvider) {
    setAiBusy(true);
    setAiTestResult(null);
    await window.electronAPI.ai.setSettings({ provider });
    await refreshAiSettings();
    setAiBusy(false);
  }

  async function handleClaudeModelChange(claudeModel: string) {
    await window.electronAPI.ai.setSettings({ claudeModel });
    await refreshAiSettings();
  }

  async function handleSaveClaudeKey() {
    if (!claudeKeyInput.trim()) return;
    setAiBusy(true);
    await window.electronAPI.ai.setClaudeApiKey(claudeKeyInput.trim());
    setClaudeKeyInput('');
    await refreshAiSettings();
    setAiBusy(false);
  }

  async function handleClearClaudeKey() {
    setAiBusy(true);
    await window.electronAPI.ai.clearClaudeApiKey();
    await refreshAiSettings();
    setAiBusy(false);
  }

  async function handleOllamaBaseUrlBlur(baseUrl: string) {
    if (!aiSettings || baseUrl === aiSettings.ollamaBaseUrl) return;
    await window.electronAPI.ai.setSettings({ ollamaBaseUrl: baseUrl });
    await refreshAiSettings();
  }

  async function handleOllamaModelChange(ollamaModel: string) {
    await window.electronAPI.ai.setSettings({ ollamaModel });
    await refreshAiSettings();
  }

  async function handleRefreshOllamaModels() {
    setOllamaModelsLoading(true);
    setOllamaModelsError(null);
    try {
      const models = await window.electronAPI.ai.listOllamaModels();
      setOllamaModels(models);
    } catch (err) {
      setOllamaModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setOllamaModelsLoading(false);
    }
  }

  async function handleTestAiConnection() {
    setAiTesting(true);
    setAiTestResult(null);
    const result = await window.electronAPI.ai.testConnection();
    setAiTestResult(result);
    setAiTesting(false);
  }

  async function handleCheckForUpdates() {
    setUpdateStatus('checking');
    setUpdateMessage(null);
    const result = await window.electronAPI.updates.check();
    setUpdateStatus(result.status);
    if (result.status === 'available') {
      setUpdateMessage(`Version ${result.version} is downloading in the background.`);
    } else if (result.status === 'error') {
      setUpdateMessage(result.message ?? 'Something went wrong.');
    }
  }

  async function handleUseExistingFile() {
    const picked = await window.electronAPI.dbLocation.browseExisting();
    if (!picked) return;
    setDbBusy(true);
    await window.electronAPI.dbLocation.set(picked);
  }

  async function handleCreateNewLocation() {
    const picked = await window.electronAPI.dbLocation.browseNew();
    if (!picked) return;
    setDbBusy(true);
    await window.electronAPI.dbLocation.set(picked);
  }

  async function handleResetToDefault() {
    if (!confirm(`Switch back to the default database location (${dbLocation?.defaultPath})?`)) return;
    setDbBusy(true);
    await window.electronAPI.dbLocation.resetToDefault();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Updates</h2>
        <p className="text-muted" style={{ marginTop: -8, fontSize: 13 }}>
          {appVersion ? `You're running version ${appVersion}.` : 'Loading version…'}
        </p>
        <button
          className="btn"
          disabled={updateStatus === 'checking' || updateStatus === 'unsupported'}
          onClick={handleCheckForUpdates}
        >
          {updateStatus === 'checking' ? 'Checking…' : 'Check for Updates'}
        </button>
        {updateStatus === 'not-available' && (
          <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            You're up to date.
          </p>
        )}
        {updateStatus === 'available' && (
          <p style={{ color: 'var(--color-accent-green)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            {updateMessage}
          </p>
        )}
        {updateStatus === 'error' && (
          <p style={{ color: 'var(--color-accent-red)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            Check failed: {updateMessage}
          </p>
        )}
        {updateStatus === 'unsupported' && (
          <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            Update checks are only available in a packaged build, not in dev mode.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Theme</h2>
        <p className="text-muted" style={{ marginTop: -8, fontSize: 13 }}>
          Choose your preferred color theme for the app.
        </p>
        <div className="field">
          <label>App Theme</label>
          <select value={currentTheme || ''} onChange={(e) => setTheme(e.target.value as any)} style={{ maxWidth: 300 }}>
            {availableThemes.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>AI Assistant</h2>
        <p className="text-muted" style={{ marginTop: -8, fontSize: 13 }}>
          Use a local Ollama model on your own GPU, or the Claude API, to suggest rhyme schemes and draft lyrics.
        </p>
        {aiSettings && (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                marginBottom: aiSettings.aiEnabled ? 16 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={aiSettings.aiEnabled}
                disabled={aiBusy}
                onChange={(e) => handleToggleAiEnabled(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Enable AI features
            </label>
            {!aiSettings.aiEnabled && (
              <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                Off -- TrackDraft never contacts Ollama or Claude. Turn this on to use Ask AI or AI-assisted
                Autoformat.
              </p>
            )}
            {aiSettings.aiEnabled && (
              <>
            <div className="field">
              <label>Provider</label>
              <select
                value={aiSettings.provider}
                disabled={aiBusy}
                onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                style={{ maxWidth: 300 }}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="claude">Claude API (cloud)</option>
              </select>
            </div>

            {aiSettings.provider === 'claude' ? (
              <>
                <div className="field">
                  <label>Model</label>
                  <select
                    value={aiSettings.claudeModel}
                    onChange={(e) => handleClaudeModelChange(e.target.value)}
                    style={{ maxWidth: 300 }}
                  >
                    {CLAUDE_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>API Key</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="password"
                      value={claudeKeyInput}
                      onChange={(e) => setClaudeKeyInput(e.target.value)}
                      placeholder={aiSettings.hasClaudeKey ? 'Key saved -- enter a new one to replace it' : 'sk-ant-...'}
                      style={{ maxWidth: 300 }}
                    />
                    <button className="btn" disabled={aiBusy || !claudeKeyInput.trim()} onClick={handleSaveClaudeKey}>
                      Save Key
                    </button>
                    {aiSettings.hasClaudeKey && (
                      <button className="btn btn-danger" disabled={aiBusy} onClick={handleClearClaudeKey}>
                        Clear Key
                      </button>
                    )}
                  </div>
                  <span className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {aiSettings.hasClaudeKey ? 'A key is saved (encrypted on this device).' : 'No key saved yet.'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>Ollama URL</label>
                  <input
                    defaultValue={aiSettings.ollamaBaseUrl}
                    key={aiSettings.ollamaBaseUrl}
                    onBlur={(e) => handleOllamaBaseUrlBlur(e.target.value.trim())}
                    style={{ maxWidth: 300 }}
                  />
                </div>
                <div className="field">
                  <label>Model</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={aiSettings.ollamaModel}
                      onChange={(e) => handleOllamaModelChange(e.target.value)}
                      style={{ maxWidth: 260 }}
                    >
                      <option value="">Select a model…</option>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {aiSettings.ollamaModel && !ollamaModels.includes(aiSettings.ollamaModel) && (
                        <option value={aiSettings.ollamaModel}>{aiSettings.ollamaModel}</option>
                      )}
                    </select>
                    <button className="btn" disabled={ollamaModelsLoading} onClick={handleRefreshOllamaModels}>
                      {ollamaModelsLoading ? 'Loading…' : 'Refresh Models'}
                    </button>
                  </div>
                  {ollamaModelsError && (
                    <span style={{ color: 'var(--color-accent-red)', fontSize: 12, marginTop: 4 }}>
                      {ollamaModelsError}
                    </span>
                  )}
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button className="btn" disabled={aiTesting} onClick={handleTestAiConnection}>
                {aiTesting ? 'Testing…' : 'Test Connection'}
              </button>
              {aiTestResult && (
                <span
                  style={{
                    fontSize: 13,
                    color: aiTestResult.ok ? 'var(--color-accent-green)' : 'var(--color-accent-red)',
                  }}
                >
                  {aiTestResult.message}
                </span>
              )}
            </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Database Location</h2>
        <p className="text-muted" style={{ marginTop: -8, fontSize: 13 }}>
          TrackDraft stores everything in a single SQLite file. Point it at a file in a synced folder (OneDrive,
          Dropbox, etc.) to keep an off-device copy, or switch between files for different data sets.
        </p>
        {dbLocation && (
          <>
            <div className="field">
              <label>Current File{dbLocation.isDefault ? ' (default)' : ''}</label>
              <input value={dbLocation.path} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" disabled={dbBusy} onClick={handleUseExistingFile}>
                Use Existing File…
              </button>
              <button className="btn" disabled={dbBusy} onClick={handleCreateNewLocation}>
                Create New File Here…
              </button>
              {!dbLocation.isDefault && (
                <button className="btn" disabled={dbBusy} onClick={handleResetToDefault}>
                  Reset to Default
                </button>
              )}
            </div>
            {dbBusy && (
              <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Restarting TrackDraft to load the new location…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
