import { describe, expect, it } from 'vitest';
import { deriveBodyText } from '../../src/server/services/email/sync.js';

describe('deriveBodyText', () => {
  it('passes text bodies through as-is', () => {
    expect(deriveBodyText('Can you send the updated pricing sheet?', 'text')).toBe(
      'Can you send the updated pricing sheet?',
    );
  });

  it('preserves whitespace/newlines in text bodies rather than reformatting them', () => {
    const original = 'Line one\n\nLine two';
    expect(deriveBodyText(original, 'text')).toBe(original);
  });

  it('converts html bodies to plain text', () => {
    const result = deriveBodyText('<p>Hello <strong>Sam</strong></p>', 'html');
    expect(result).toContain('Hello');
    expect(result).toContain('Sam');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<strong>');
  });

  it('keeps links inline in the derived text rather than dropping them', () => {
    const result = deriveBodyText('<a href="https://example.com/pricing">pricing sheet</a>', 'html');
    expect(result).toContain('pricing sheet');
    expect(result).toContain('https://example.com/pricing');
  });

  it('disables wrapping — a long html paragraph stays on one line', () => {
    const longSentence = 'word '.repeat(40).trim();
    const result = deriveBodyText(`<p>${longSentence}</p>`, 'html');
    expect(result.split('\n').some((line) => line.length > 100)).toBe(true);
  });

  it('returns an empty string for an empty text body', () => {
    expect(deriveBodyText('', 'text')).toBe('');
  });

  it('returns an empty string for an empty html body', () => {
    expect(deriveBodyText('', 'html')).toBe('');
  });
});
