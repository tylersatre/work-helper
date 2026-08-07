import type { ContactEntry } from './types.js';

export function primaryValue(entries: ContactEntry[]): string | null {
  return entries.find((entry) => entry.isPrimary)?.value ?? null;
}
