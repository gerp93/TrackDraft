import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Part, PartType } from '../../shared/types/part';
import { computePartLabel, PART_TYPE_LABELS, PRESET_PART_TYPES } from '../../shared/utils/partLabel';
import { hasSectionTags, ImportedSection, parseTaggedLyrics } from '../../shared/utils/songImport';
import { useAiSettings } from '../context/AiSettingsContext';

const TYPE_OPTIONS: PartType[] = [...PRESET_PART_TYPES, 'custom'];

/** Display labels ("Verse 2", "Chorus") for the preview, numbered the same way the song
 * editor will number them once saved -- by building throwaway Part records. */
function previewLabels(sections: ImportedSection[]): string[] {
  const parts: Part[] = [];
  const partIdBySection: string[] = [];
  sections.forEach((s, i) => {
    if (s.repeatOf !== null) {
      partIdBySection.push(partIdBySection[s.repeatOf]);
      return;
    }
    const id = String(i);
    parts.push({
      id,
      songId: '',
      partType: s.partType,
      customLabel: s.customLabel,
      noLyrics: s.noLyrics,
      createdAt: '',
      updatedAt: '',
    });
    partIdBySection.push(id);
  });
  const orderedPartIds = parts.map((p) => p.id);
  const byId = new Map(parts.map((p) => [p.id, p]));
  return partIdBySection.map((id) => computePartLabel(byId.get(id)!, parts, orderedPartIds));
}

/** Removes section k, keeping every repeatOf index pointing at the right section. If k
 * had repeats, the first repeat inherits k's lyrics and becomes the original. */
function removeSection(sections: ImportedSection[], k: number): ImportedSection[] {
  const removed = sections[k];
  let heir: number | null = null;
  const next = sections.map((s, i) => {
    if (i === k) return s;
    if (s.repeatOf === k) {
      if (heir === null) {
        heir = i;
        return { ...s, repeatOf: null, lines: removed.lines, noLyrics: removed.noLyrics };
      }
      return { ...s, repeatOf: heir };
    }
    return s;
  });
  return next
    .filter((_, i) => i !== k)
    .map((s) => (s.repeatOf !== null && s.repeatOf > k ? { ...s, repeatOf: s.repeatOf - 1 } : s));
}

export default function ImportSong() {
  const navigate = useNavigate();
  const { aiEnabled } = useAiSettings();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [sections, setSections] = useState<ImportedSection[] | null>(null);
  const [splitBy, setSplitBy] = useState<'tags' | 'ai' | null>(null);
  const [busy, setBusy] = useState<'ai' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labels = useMemo(() => (sections ? previewLabels(sections) : []), [sections]);
  const tagsFound = useMemo(() => hasSectionTags(text), [text]);

  function handleSplitByTags() {
    setError(null);
    const result = parseTaggedLyrics(text);
    if (!result.length) {
      setError('No lyrics found to split.');
      return;
    }
    setSections(result);
    setSplitBy('tags');
  }

  async function handleSplitWithAi() {
    setError(null);
    setBusy('ai');
    try {
      setSections(await window.electronAPI.ai.splitLyrics(text));
      setSplitBy('ai');
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err));
    } finally {
      setBusy(null);
    }
  }

  function updateSection(i: number, patch: Partial<ImportedSection>) {
    setSections((prev) => prev && prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function handleImport() {
    if (!sections?.length) return;
    setError(null);
    setBusy('import');
    try {
      const song = await window.electronAPI.songs.import({ title: title.trim() || 'Imported song', sections });
      navigate(`/songs/${song.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/" className="text-muted" style={{ textDecoration: 'none' }}>
          ← Songs
        </Link>
        <h1>Import Song</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Imported song" />
        </div>
        <div className="field">
          <label>Lyrics</label>
          <textarea
            className="lyric-textarea import-textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSections(null);
              setSplitBy(null);
            }}
            placeholder={'Paste the full lyrics. Section tags on their own line, like\n\n[Verse 1]\n...\n\n[Chorus]\n...\n\nsplit them into parts.'}
            rows={16}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSplitByTags} disabled={!text.trim() || busy !== null}>
            Split by tags
          </button>
          {aiEnabled && (
            <button className="btn" onClick={handleSplitWithAi} disabled={!text.trim() || busy !== null}>
              {busy === 'ai' ? 'Asking AI…' : 'Split with AI'}
            </button>
          )}
          {text.trim() && !tagsFound && (
            <span className="text-muted">
              No [Section] tags found -- splitting by tags will use blank lines, with repeated stanzas as the chorus.
            </span>
          )}
        </div>
        {error && (
          <div className="import-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {sections && (
        <div className="card">
          <div className="import-preview-header">
            <h2 style={{ margin: 0 }}>
              {sections.length} part{sections.length === 1 ? '' : 's'}{' '}
              <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8em' }}>
                {splitBy === 'ai' ? 'split by AI' : 'split by tags'}
              </span>
            </h2>
            <button className="btn btn-primary" onClick={handleImport} disabled={!sections.length || busy !== null}>
              {busy === 'import' ? 'Importing…' : 'Import Song'}
            </button>
          </div>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Check the parts below, fix any types, and drop anything that isn't lyrics. You can still edit everything
            after importing.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sections.map((section, i) => {
              const isRepeat = section.repeatOf !== null;
              return (
                <div key={i} className="import-section">
                  <div className="import-section-header">
                    <strong>{labels[i]}</strong>
                    {isRepeat ? (
                      <span className="text-muted">repeats {labels[section.repeatOf!]}</span>
                    ) : (
                      <>
                        <select
                          value={section.partType}
                          onChange={(e) => {
                            const partType = e.target.value as PartType;
                            updateSection(i, {
                              partType,
                              customLabel: partType === 'custom' ? section.customLabel || labels[i] : null,
                            });
                          }}
                        >
                          {TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t === 'custom' ? 'Custom' : PART_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        {section.partType === 'custom' && (
                          <input
                            value={section.customLabel ?? ''}
                            onChange={(e) => updateSection(i, { customLabel: e.target.value })}
                            placeholder="Label"
                            style={{ width: 160 }}
                          />
                        )}
                        <label className="text-muted" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={section.noLyrics}
                            onChange={(e) => updateSection(i, { noLyrics: e.target.checked })}
                          />
                          Instrumental
                        </label>
                      </>
                    )}
                    <button
                      className="btn btn-danger"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setSections((prev) => prev && removeSection(prev, i))}
                    >
                      Remove
                    </button>
                  </div>
                  {!isRepeat && !section.noLyrics && (
                    <pre className="import-section-lines">
                      {section.lines.length ? section.lines.join('\n') : <span className="text-muted">(empty)</span>}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
