import MarkdownIt from 'markdown-it';

const md = new MarkdownIt('zero', { html: false }).enable([
  'heading',
  'lheading',
  'list',
  'emphasis',
  'link',
  'backticks',
  'code',
  'fence',
  'escape',
  'newline',
  'image',
]);

md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]!;
  const alt = token.content;
  const src = token.attrGet('src') ?? '';
  return md.utils.escapeHtml(`![${alt}](${src})`);
};

export function renderNoteMarkdown(text: string): string {
  return md.render(text);
}
