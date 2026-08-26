export function relativeTime(thenMs: number, nowMs: number): string {
  const diffSeconds = Math.floor((nowMs - thenMs) / 1000);

  if (diffSeconds < 60) {
    return 'just now';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function absoluteLocal(thenMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(thenMs));
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseLocalDate(value: string): number {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

export function formatLocalDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDueDate(value: string): string {
  if (!DATE_ONLY_PATTERN.test(value)) return value;
  const ms = parseLocalDate(value);
  if (Number.isNaN(ms)) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(ms));
}
