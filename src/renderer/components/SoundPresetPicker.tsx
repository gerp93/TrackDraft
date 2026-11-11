import { useEffect, useState } from 'react';
import { SoundPreset } from '../../shared/types/soundPreset';
import { VocalGender } from '../../shared/types/song';

interface Props {
  styleNotes: string;
  vocalGender: VocalGender;
  onApplyStyleNotes?: (value: string) => Promise<void>;
  onVocalGenderChange: (value: VocalGender) => Promise<void>;
}

/** Compact row above the Sound field: apply a saved preset, save the current sound as one,
 * or manage (delete) saved presets. */
export default function SoundPresetPicker({
  styleNotes,
  vocalGender,
  onApplyStyleNotes,
  onVocalGenderChange,
}: Props) {
  const [presets, setPresets] = useState<SoundPreset[]>([]);
  const [managing, setManaging] = useState(false);
  const [selectValue, setSelectValue] = useState('');

  const loadPresets = async () => {
    setPresets(await window.electronAPI.presets.getAll());
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const handleSelect = async (id: string) => {
    setSelectValue('');
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    if (onApplyStyleNotes) {
      await onApplyStyleNotes(preset.styleNotes);
    }
    await onVocalGenderChange(preset.vocalGender);
  };

  const handleSave = async () => {
    const name = window.prompt('Preset name');
    if (!name || !name.trim()) return;
    await window.electronAPI.presets.create({ name: name.trim(), styleNotes, vocalGender });
    await loadPresets();
  };

  const handleDelete = async (preset: SoundPreset) => {
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    await window.electronAPI.presets.delete(preset.id);
    await loadPresets();
  };

  return (
    <div className="sound-preset-picker">
      <div className="sound-preset-row">
        <select
          aria-label="Apply a saved sound preset"
          value={selectValue}
          onChange={(e) => handleSelect(e.target.value)}
        >
          <option value="">Presets…</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn" disabled={!styleNotes.trim()} onClick={handleSave}>
          Save as preset
        </button>
        <button type="button" className="btn" onClick={() => setManaging((open) => !open)}>
          {managing ? 'Done' : 'Manage'}
        </button>
      </div>

      {managing && (
        <ul className="sound-preset-list">
          {presets.length === 0 && <li className="text-muted">No saved presets yet.</li>}
          {presets.map((preset) => (
            <li key={preset.id}>
              <span>{preset.name}</span>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(preset)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
