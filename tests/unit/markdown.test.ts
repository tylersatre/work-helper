import { describe, expect, it } from 'vitest';
import { renderNoteMarkdown } from '../../src/client/utils/markdown.js';

describe('renderNoteMarkdown', () => {
  it('renders bold, italic, links, inline code, and an em dash unchanged', () => {
    const html = renderNoteMarkdown(
      '**Urgent:** call *Sam* about [pricing](https://example.com/pricing) — see `deck.pdf`',
    );

    expect(html).toContain('<strong>Urgent:</strong>');
    expect(html).toContain('<em>Sam</em>');
    expect(html).toContain('<a href="https://example.com/pricing">pricing</a>');
    expect(html).toContain('<code>deck.pdf</code>');
  });

  it('renders a bulleted list', () => {
    const html = renderNoteMarkdown('- item1\n- item2');

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item1</li>');
    expect(html).toContain('<li>item2</li>');
  });

  it('renders a numbered list', () => {
    const html = renderNoteMarkdown('1. item1\n2. item2');

    expect(html).toContain('<ol>');
    expect(html).toContain('<li>item1</li>');
  });

  it('renders a heading', () => {
    const html = renderNoteMarkdown('## Recap');

    expect(html).toContain('<h2>Recap</h2>');
  });

  it('renders a fenced code block', () => {
    const html = renderNoteMarkdown('```\ncode line\n```');

    expect(html).toContain('<pre><code>code line');
  });

  it('renders raw HTML like <script> as escaped inert text', () => {
    const html = renderNoteMarkdown('Note <script>alert(1)</script> here');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders an <img onerror=...> tag as escaped inert text', () => {
    const html = renderNoteMarkdown('Note <img onerror=alert(1) src=x> here');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img onerror=alert(1) src=x&gt;');
  });

  it('refuses a javascript: link URL, degrading to text', () => {
    const html = renderNoteMarkdown('click [here](javascript:alert(1)) now');

    expect(html).not.toContain('<a ');
    expect(html).toContain('[here](javascript:alert(1))');
  });

  it('refuses a vbscript: link URL, degrading to text', () => {
    const html = renderNoteMarkdown('click [here](vbscript:alert(1)) now');

    expect(html).not.toContain('<a ');
  });

  it('refuses a non-image data: link URL, degrading to text', () => {
    const html = renderNoteMarkdown('click [here](data:text/html,payload) now');

    expect(html).not.toContain('<a ');
  });

  it('permits a data:image/... link URL per markdown-it default validateLink', () => {
    const html = renderNoteMarkdown('click [here](data:image/png;base64,abc) now');

    expect(html).toContain('<a href="data:image/png;base64,abc">here</a>');
  });

  it('leaves image syntax as literal text (out of scope)', () => {
    const html = renderNoteMarkdown('![Diagram](https://example.com/diagram.png)');

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a ');
    expect(html).toContain('![Diagram](https://example.com/diagram.png)');
  });

  it('leaves table syntax as literal text (out of scope)', () => {
    const html = renderNoteMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');

    expect(html).not.toContain('<table');
  });

  it('leaves strikethrough syntax as literal text (out of scope)', () => {
    const html = renderNoteMarkdown('~~gone~~');

    expect(html).not.toContain('<s>');
    expect(html).not.toContain('<del>');
    expect(html).toContain('~~gone~~');
  });

  it('leaves blockquote syntax as literal text (out of scope)', () => {
    const html = renderNoteMarkdown('> quoted');

    expect(html).not.toContain('<blockquote>');
  });

  it('leaves autolink syntax as literal text (out of scope)', () => {
    const html = renderNoteMarkdown('<https://example.com>');

    expect(html).not.toContain('<a ');
  });

  it('renders a stray unclosed ** as ordinary text without throwing', () => {
    const html = renderNoteMarkdown('a **b c');

    expect(html).not.toContain('<strong>');
    expect(html).toContain('a **b c');
  });
});
