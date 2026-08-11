export function subjectOrPlaceholder(subject: string): string {
  return subject.trim() === '' ? '(no subject)' : subject;
}

/** Prefill split for the create-person control (FR-013): a two-word display name splits into
 * first/last; anything else (single-word, empty, three-or-more words) leaves both fields blank. */
export function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 2) {
    return { firstName: '', lastName: '' };
  }
  return { firstName: words[0]!, lastName: words[1]! };
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];

/** Human-readable file size, e.g. 53248 -> "52 KB". */
export function formatBytes(sizeBytes: number): string {
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${Math.round(value)} ${BYTE_UNITS[unitIndex]}`;
}
