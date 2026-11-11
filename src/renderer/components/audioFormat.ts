import { SongTake } from '../../shared/types/songTake';

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function formatTakeTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function takeMeta(take: SongTake): string {
  const length = take.durationSeconds ? ` · ${formatClock(take.durationSeconds * 1000)}` : '';
  return `${formatTakeTime(take.createdAt)}${length}`;
}
