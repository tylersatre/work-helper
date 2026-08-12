// @vitest-environment jsdom
import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import EmailBody from '../../src/client/components/EmailBody.vue';
import { palette } from '../../src/client/palette.js';

describe('EmailBody', () => {
  it('renders sanitized HTML formatting inside an open shadow root, with no script side effects', () => {
    (window as unknown as { __xss?: boolean }).__xss = undefined;
    const { container } = render(EmailBody, {
      props: {
        bodyOriginal:
          '<b>updated pricing sheet</b> <a href="https://example.com/pricing">pricing page</a><script>window.__xss = true;</script>',
        bodyContentType: 'html',
      },
    });

    const host = container.querySelector('[data-testid="email-body-html"]');
    expect(host).toBeTruthy();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).toBeTruthy();
    expect(shadow!.querySelector('b')?.textContent).toBe('updated pricing sheet');
    expect(shadow!.querySelector('a')?.getAttribute('href')).toBe('https://example.com/pricing');
    expect(shadow!.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it('renders html email on a light card — white background, dark text, light color-scheme — so emails authored against white stay readable on the dark app', () => {
    const { container } = render(EmailBody, {
      props: {
        bodyOriginal: '<p style="color: #444444;">Will you please update my address?</p>',
        bodyContentType: 'html',
      },
    });

    const host = container.querySelector('[data-testid="email-body-html"]');
    const shadow = (host as HTMLElement).shadowRoot!;
    const style = shadow.querySelector('style');
    expect(style).toBeTruthy();
    expect(style!.textContent).toContain(`background: ${palette.emailCardBg}`);
    expect(style!.textContent).toContain(`color: ${palette.emailCardText}`);
    expect(style!.textContent).toContain('color-scheme: light');
    // The email content itself renders inside the light card.
    const card = shadow.querySelector('.email-light-card');
    expect(card).toBeTruthy();
    expect(card!.querySelector('p')?.textContent).toBe('Will you please update my address?');
  });

  it('renders a text body as escaped, pre-wrapped text with no auto-linking, preserving blank-line paragraphs', () => {
    const { container } = render(EmailBody, {
      props: { bodyOriginal: 'Line one\n\nLine two https://example.com <b>not bold</b>', bodyContentType: 'text' },
    });

    const host = container.querySelector('[data-testid="email-body-text"]');
    expect(host).toBeTruthy();
    expect((host as HTMLElement).shadowRoot).toBeNull();
    expect(host!.querySelector('a')).toBeNull();
    expect(host!.textContent).toContain('<b>not bold</b>');
    expect(host!.textContent).toContain('Line one');
    expect(getComputedStyle(host as HTMLElement).whiteSpace).toBe('pre-wrap');
  });
});
