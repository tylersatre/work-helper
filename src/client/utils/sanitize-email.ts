import DOMPurify from 'dompurify';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Sanitizes a stored HTML email body: DOMPurify's default safe profile strips scripts, event
 * handlers, and scriptable URLs; every surviving anchor is forced to open safely in a new tab. */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
