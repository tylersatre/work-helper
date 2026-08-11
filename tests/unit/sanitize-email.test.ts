// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../../src/client/utils/sanitize-email.js';

describe('sanitizeEmailHtml', () => {
  it('strips <script> tags', () => {
    const result = sanitizeEmailHtml('<p>hi</p><script>window.__xss = true;</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('__xss');
  });

  it('strips event-handler attributes like onerror', () => {
    const result = sanitizeEmailHtml('<img src="x" onerror="window.__xss = true">');
    expect(result).not.toContain('onerror');
  });

  it('removes javascript: URLs', () => {
    const result = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('keeps bold markup and https links', () => {
    const result = sanitizeEmailHtml('<b>updated pricing sheet</b> <a href="https://example.com/pricing">pricing page</a>');
    expect(result).toContain('<b>updated pricing sheet</b>');
    expect(result).toContain('href="https://example.com/pricing"');
  });

  it('forces target="_blank" and rel="noopener noreferrer" on every surviving anchor', () => {
    const result = sanitizeEmailHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});
