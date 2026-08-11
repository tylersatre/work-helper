import { describe, expect, it } from 'vitest';
import { subjectOrPlaceholder } from '../../src/client/utils/email-format.js';

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
