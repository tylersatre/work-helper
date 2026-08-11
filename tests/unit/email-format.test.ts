import { describe, expect, it } from 'vitest';
import { formatBytes, subjectOrPlaceholder } from '../../src/client/utils/email-format.js';

describe('subjectOrPlaceholder', () => {
  it('returns the placeholder for an empty subject', () => {
    expect(subjectOrPlaceholder('')).toBe('(no subject)');
  });

  it('returns the placeholder for a whitespace-only subject', () => {
    expect(subjectOrPlaceholder('   ')).toBe('(no subject)');
  });

  it('passes a real subject through unchanged', () => {
    expect(subjectOrPlaceholder('Quote attached')).toBe('Quote attached');
  });
});

describe('formatBytes', () => {
  it('formats a KB-scale size as human-readable KB', () => {
    expect(formatBytes(53248)).toBe('52 KB');
  });

  it('formats a byte-scale size in bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats an MB-scale size as human-readable MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
