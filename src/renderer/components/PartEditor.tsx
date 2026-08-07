import { useEffect, useRef, useState } from 'react';
import { Part } from '../../shared/types/part';
import { PartVersion } from '../../shared/types/partVersion';
import { autoformatLines } from '../../shared/utils/autoformat';
import { getRhymeLineMap } from '../../shared/utils/rhymeScheme';
import { PART_CHANGED_EVENT, notifyPartChanged } from '../utils/partEvents';
import VersionSwitcher from './VersionSwitcher';
import AutoformatButton from './AutoformatButton';
import RhymeSchemeInput from './RhymeSchemeInput';

interface Props {
  part: Part;
  songId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
}

const AUTOSAVE_DELAY_MS = 800;

function latestOf(versions: PartVersion[]): PartVersion | null {
  return versions.length ? versions.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a)) : null;
}

export default function PartEditor({ part, songId, canMoveUp, canMoveDown, onMove }: Props) {
  const [versions, setVersions] = useState<PartVersion[]>([]);
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<string[]>([]);
  const [draftRhymeScheme, setDraftRhymeScheme] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');

  const [aiEnabled, setAiEnabled] = useState(false);

  const [autoformatting, setAutoformatting] = useState(false);
  const [autoformatError, setAutoformatError] = useState<string | null>(null);

  const [askAiOpen, setAskAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ id: string; lines: string[]; rhymeScheme: string | null } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function autoResize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    autoResize(textareaRef.current);
  }, [draftLines]);

  useEffect(() => {
    window.electronAPI.ai.getSettings().then((s) => setAiEnabled(s.aiEnabled));
  }, []);

  useEffect(() => {
    load();
    return () => {
      flushPendingSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id]);

  useEffect(() => {
    function handleExternalChange(e: Event) {
      const detail = (e as CustomEvent<{ partId: string; preferViewedVersionId?: string }>).detail;
      // Skip while this instance has its own unsaved edit pending, so an in-progress
      // keystroke here doesn't get clobbered by a reload triggered by a sibling placement.
      if (detail?.partId === part.id && !pendingSave.current) {
        load(detail.preferViewedVersionId ?? viewedVersionId ?? undefined);
      }
    }
    window.addEventListener(PART_CHANGED_EVENT, handleExternalChange);
    return () => window.removeEventListener(PART_CHANGED_EVENT, handleExternalChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id, viewedVersionId]);

  async function load(preferViewedId?: string) {
    const list = await window.electronAPI.partVersions.getByPart(part.id);
    setVersions(list);
    const target = list.find((v) => v.id === preferViewedId) ?? latestOf(list);
    selectViewed(target ?? null);
  }

  function selectViewed(version: PartVersion | null) {
    flushPendingSave();
    setViewedVersionId(version?.id ?? null);
    setDraftLines(version?.lines ?? []);
    setDraftRhymeScheme(version?.rhymeScheme ?? '');
    setSaveState('idle');
  }

  function handleSelectViewed(versionId: string) {
    const version = versions.find((v) => v.id === versionId) ?? null;
    selectViewed(version);
    // Every other placement of this same part (a repeated chorus) follows onto this tab too.
    notifyPartChanged(part.id, versionId);
  }

  async function handleDuplicate() {
    if (!viewedVersionId) return;
    flushPendingSave();
    const created = await window.electronAPI.partVersions.duplicate(viewedVersionId);
    await load(created.id);
    notifyPartChanged(part.id, created.id);
  }

  async function handleDeleteVersion(versionId: string) {
    if (!confirm('Delete this version? This cannot be undone.')) return;
    await window.electronAPI.partVersions.delete(versionId);
    await load();
    notifyPartChanged(part.id);
  }

  function scheduleSave(nextLines: string[], nextRhymeScheme: string) {
    if (!viewedVersionId) return;
    pendingSave.current = { id: viewedVersionId, lines: nextLines, rhymeScheme: nextRhymeScheme.trim() || null };
    setSaveState('pending');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushPendingSave();
    }, AUTOSAVE_DELAY_MS);
  }

  async function flushPendingSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    setSaveState('saving');
    await Promise.all([
      window.electronAPI.partVersions.updateText(pending.id, pending.lines),
      window.electronAPI.partVersions.updateRhymeScheme(pending.id, pending.rhymeScheme),
    ]);
    setVersions((prev) =>
      prev.map((v) => (v.id === pending.id ? { ...v, lines: pending.lines, rhymeScheme: pending.rhymeScheme } : v))
    );
    setSaveState('saved');
    notifyPartChanged(part.id);
  }

  function handleLinesChange(next: string[]) {
    setDraftLines(next);
    scheduleSave(next, draftRhymeScheme);
  }

  function handleRhymeChange(next: string) {
    setDraftRhymeScheme(next);
    scheduleSave(draftLines, next);
  }

  /** Always does the deterministic whitespace cleanup. If AI is enabled, also tries to
   * detect a rhyme scheme when none is set yet, then reorders the (already-cleaned)
   * existing lines -- never rewording them -- to fit whichever scheme is now in play. */
  async function handleAutoformat() {
    setAutoformatError(null);
    const formatted = autoformatLines(draftLines);
    setDraftLines(formatted);
    scheduleSave(formatted, draftRhymeScheme);

    if (!aiEnabled) return;

    setAutoformatting(true);
    try {
      let scheme = draftRhymeScheme.trim();
      if (!scheme) {
        const detected = await window.electronAPI.ai.suggestRhymeScheme(formatted);
        scheme = detected.scheme;
      }
      if (scheme) {
        const { lines: reordered } = await window.electronAPI.ai.reorderForRhymeScheme(formatted, scheme);
        setDraftRhymeScheme(scheme);
        setDraftLines(reordered);
        scheduleSave(reordered, scheme);
      }
    } catch (err) {
      setAutoformatError(err instanceof Error ? err.message : String(err));
    } finally {
      setAutoformatting(false);
    }
  }

  async function handleAskAi() {
    if (!viewedVersionId || !aiInstruction.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const { lines } = await window.electronAPI.ai.assist(
        songId,
        part.id,
        aiInstruction.trim(),
        draftRhymeScheme.trim() || undefined
      );
      flushPendingSave();
      const created = await window.electronAPI.partVersions.duplicate(viewedVersionId);
      await window.electronAPI.partVersions.updateText(created.id, lines);
      await load(created.id);
      notifyPartChanged(part.id, created.id);
      setAskAiOpen(false);
      setAiInstruction('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiGenerating(false);
    }
  }

  const latestVersion = latestOf(versions);
  const isEditable = !!latestVersion && viewedVersionId === latestVersion.id;
  const rhymeMap = getRhymeLineMap(draftLines, draftRhymeScheme.trim() || null);

  if (versions.length === 0) {
    return (
      <div className="card">
        <p className="text-muted">No versions yet for this part.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <VersionSwitcher
        versions={versions}
        viewedVersionId={viewedVersionId}
        onSelectViewed={handleSelectViewed}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMove={onMove}
      />

      {part.noLyrics && part.partType === 'custom' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p className="text-muted" style={{ margin: 0, fontSize: 13, flex: 1 }}>
            No lyrics for this section — instrumental. Uncheck "No lyrics" above to add text.
          </p>
          <button className="btn" onClick={handleDuplicate}>
            Duplicate as new version
          </button>
          {viewedVersionId && versions.length > 1 && (
            <button className="btn btn-danger" onClick={() => handleDeleteVersion(viewedVersionId)}>
              Delete Version
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}>
            <RhymeSchemeInput value={draftRhymeScheme} onChange={handleRhymeChange} disabled={!isEditable} />
            {isEditable && (
              <div className="field">
                <label style={{ visibility: 'hidden' }}>Autoformat</label>
                <AutoformatButton
                  onClick={handleAutoformat}
                  disabled={autoformatting}
                  busy={autoformatting}
                  aiEnabled={aiEnabled}
                  hasRhymeScheme={!!draftRhymeScheme.trim()}
                />
              </div>
            )}
            <span style={{ flex: 1 }} />
            <span className="text-muted" style={{ fontSize: 12 }}>
              {!isEditable
                ? 'Read-only — only the latest version is editable'
                : saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'pending'
                    ? 'Editing…'
                    : saveState === 'saved'
                      ? 'Saved'
                      : ''}
            </span>
            {aiEnabled && (
              <button className="btn" onClick={() => setAskAiOpen(!askAiOpen)}>
                Ask AI
              </button>
            )}
            <button className="btn" onClick={handleDuplicate}>
              Duplicate as new version
            </button>
            {viewedVersionId && versions.length > 1 && (
              <button className="btn btn-danger" onClick={() => handleDeleteVersion(viewedVersionId)}>
                Delete Version
              </button>
            )}
          </div>

          {autoformatError && (
            <p style={{ color: 'var(--color-accent-red)', fontSize: 12, marginTop: -6, marginBottom: 8 }}>
              {autoformatError}
            </p>
          )}

          {aiEnabled && askAiOpen && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskAi()}
                placeholder="e.g. write an upbeat second verse about summer nights"
                disabled={aiGenerating}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="btn btn-primary" onClick={handleAskAi} disabled={aiGenerating || !aiInstruction.trim()}>
                {aiGenerating ? 'Generating…' : 'Generate'}
              </button>
              <button
                className="btn"
                disabled={aiGenerating}
                onClick={() => {
                  setAskAiOpen(false);
                  setAiError(null);
                }}
              >
                Cancel
              </button>
              {aiError && (
                <span style={{ color: 'var(--color-accent-red)', fontSize: 12, width: '100%' }}>{aiError}</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex' }}>
            <div className="rhyme-gutter">
              {rhymeMap.map((letter, i) => (
                <div key={i}>{letter ?? ' '}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="lyric-textarea"
              value={draftLines.join('\n')}
              onChange={(e) => {
                if (isEditable) handleLinesChange(e.target.value.split('\n'));
                autoResize(e.target);
              }}
              onBlur={() => flushPendingSave()}
              readOnly={!isEditable}
              spellCheck={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
