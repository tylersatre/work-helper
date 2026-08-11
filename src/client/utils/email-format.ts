export function subjectOrPlaceholder(subject: string): string {
  return subject.trim() === '' ? '(no subject)' : subject;
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
