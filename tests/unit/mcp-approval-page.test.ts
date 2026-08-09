import { describe, expect, it } from 'vitest';
import { renderApprovalPage, renderErrorPage, renderRejectionPage } from '../../src/server/mcp/auth/approval-page.js';

const OPTS = { username: 'tyler', clientName: 'My MCP Client', ticket: 'ticket-abc123' };

describe('renderApprovalPage', () => {
  it('renders the verified username and client name', () => {
    const html = renderApprovalPage(OPTS);
    expect(html).toContain('tyler');
    expect(html).toContain('My MCP Client');
  });

  it('HTML-escapes the username and client name', () => {
    const html = renderApprovalPage({ ...OPTS, username: '<script>alert(1)</script>', clientName: '<b>evil</b>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>evil</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
  });

  it('contains exactly one form posting to /oauth/authorize', () => {
    const html = renderApprovalPage(OPTS);
    const forms = html.match(/<form[^>]*>/g) ?? [];
    expect(forms).toHaveLength(1);
    const [form] = forms as [string];
    expect(form).toContain('action="/oauth/authorize"');
    expect(form.toLowerCase()).toContain('method="post"');
  });

  it('carries only a hidden ticket field as a flow input, and no OAuth params', () => {
    const html = renderApprovalPage(OPTS);
    const hiddenInputs = html.match(/<input[^>]*type="hidden"[^>]*>/g) ?? [];
    expect(hiddenInputs).toHaveLength(1);
    expect(hiddenInputs[0]).toContain('name="ticket"');
    expect(hiddenInputs[0]).toContain(`value="${OPTS.ticket}"`);

    for (const param of ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state']) {
      expect(html).not.toContain(`name="${param}"`);
    }
  });

  it('offers approve and deny as the only actions, via submit buttons', () => {
    const html = renderApprovalPage(OPTS);
    expect(html).toMatch(/<button[^>]*name="action"[^>]*value="approve"/);
    expect(html).toMatch(/<button[^>]*name="action"[^>]*value="deny"/);
  });

  it('contains no password field', () => {
    const html = renderApprovalPage(OPTS);
    expect(html).not.toMatch(/type="password"/);
  });
});

describe('renderRejectionPage', () => {
  it('names Authentik sign-in as the required path, with no form', () => {
    const html = renderRejectionPage();
    expect(html.toLowerCase()).toContain('authentik');
    expect(html).not.toContain('<form');
    expect(html).not.toMatch(/type="password"/);
  });
});

describe('renderErrorPage', () => {
  it('renders the given message with no form', () => {
    const html = renderErrorPage('Unknown client or redirect URI.');
    expect(html).toContain('Unknown client or redirect URI.');
    expect(html).not.toContain('<form');
  });
});
