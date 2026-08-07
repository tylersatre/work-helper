import { describe, expect, it } from 'vitest';
import { renderLockedPage, renderPasswordPage } from '../../src/server/mcp/auth/password-page.js';

const FLOW_PARAMS = {
  client_id: 'client-123',
  redirect_uri: 'http://localhost:8976/callback',
  code_challenge: 'abc123',
  code_challenge_method: 'S256',
  state: 'xyz',
};

describe('renderPasswordPage', () => {
  it('renders one password input, a submit button, and all flow params as hidden fields', () => {
    const html = renderPasswordPage({ flowParams: FLOW_PARAMS });

    const passwordInputs = html.match(/<input[^>]*type="password"[^>]*>/g) ?? [];
    expect(passwordInputs).toHaveLength(1);
    expect(passwordInputs[0]).toContain('name="password"');

    expect(html).toMatch(/<button[^>]*type="submit"/);

    for (const [name, value] of Object.entries(FLOW_PARAMS)) {
      expect(html).toContain(`name="${name}"`);
      expect(html).toContain(`value="${value}"`);
    }
  });

  it('does not render an error message in the plain form state', () => {
    const html = renderPasswordPage({ flowParams: FLOW_PARAMS });
    expect(html).not.toContain('class="error"');
  });

  it('re-renders the form with a visible error message in the error state', () => {
    const html = renderPasswordPage({ flowParams: FLOW_PARAMS, error: 'Incorrect password' });

    const passwordInputs = html.match(/<input[^>]*type="password"[^>]*>/g) ?? [];
    expect(passwordInputs).toHaveLength(1);
    expect(html).toContain('Incorrect password');

    for (const [name, value] of Object.entries(FLOW_PARAMS)) {
      expect(html).toContain(`name="${name}"`);
      expect(html).toContain(`value="${value}"`);
    }
  });
});

describe('renderLockedPage', () => {
  it('renders a heading and a locked message, with no form', () => {
    const html = renderLockedPage();

    expect(html).toMatch(/<h1[^>]*>.*locked.*<\/h1>/is);
    expect(html.toLowerCase()).toContain('locked');
    expect(html).not.toContain('<form');
    expect(html).not.toMatch(/<input[^>]*type="password"/);
  });
});
