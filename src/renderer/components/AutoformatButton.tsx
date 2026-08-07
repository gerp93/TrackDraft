interface Props {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  aiEnabled?: boolean;
  hasRhymeScheme?: boolean;
}

export default function AutoformatButton({ onClick, disabled, busy, aiEnabled, hasRhymeScheme }: Props) {
  const title = !aiEnabled
    ? 'Strip trailing whitespace and collapse extra blank lines'
    : hasRhymeScheme
      ? 'Strip whitespace, collapse blank lines, and reorder existing lines (no rewriting) to fit the rhyme scheme'
      : 'Strip whitespace, collapse blank lines, and try to detect a rhyme scheme from your lyrics -- then reorder to fit it';
  return (
    <button className="btn" onClick={onClick} disabled={disabled} title={title}>
      {busy ? 'Autoformatting…' : 'Autoformat'}
    </button>
  );
}
