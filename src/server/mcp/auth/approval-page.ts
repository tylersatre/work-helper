function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
      .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); min-width: 280px; }
      .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
      button { flex: 1; padding: 0.5rem; }
      .error { color: #b00020; }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`;
}

export interface ApprovalPageOptions {
  username: string;
  clientName: string;
  ticket: string;
}

export function renderApprovalPage({ username, clientName, ticket }: ApprovalPageOptions): string {
  return pageShell(
    'work-helper connector — approve',
    `<h1>Connect to work-helper</h1>
      <p><strong>${escapeHtml(clientName)}</strong> wants to connect as <strong>${escapeHtml(username)}</strong>.</p>
      <form method="post" action="/oauth/authorize">
        <input type="hidden" name="ticket" value="${escapeHtml(ticket)}">
        <div class="actions">
          <button type="submit" name="action" value="deny">Deny</button>
          <button type="submit" name="action" value="approve">Approve</button>
        </div>
      </form>`,
  );
}

export function renderRejectionPage(): string {
  return pageShell(
    'work-helper connector — rejected',
    `<h1>Connection request rejected</h1><p>This request must be reached through the deployment's Authentik sign-in.</p>`,
  );
}

export function renderErrorPage(message: string): string {
  return pageShell('work-helper connector — error', `<h1>Connection request rejected</h1><p>${escapeHtml(message)}</p>`);
}
