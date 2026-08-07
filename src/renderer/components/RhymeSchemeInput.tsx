interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function RhymeSchemeInput({ value, onChange, disabled }: Props) {
  return (
    <div className="field" style={{ maxWidth: 200 }}>
      <label>Rhyme scheme</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. AABB (optional)"
        disabled={disabled}
      />
    </div>
  );
}
