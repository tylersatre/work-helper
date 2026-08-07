function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hiddenFields(flowParams: Record<string, string>): string {
  return Object.entries(flowParams)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('\n      ');
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
      input[type="password"] { display: block; width: 100%; padding: 0.5rem; margin: 0.5rem 0 1rem; box-sizing: border-box; }
      button { width: 100%; padding: 0.5rem; }
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

export interface PasswordPageOptions {
  flowParams: Record<string, string>;
  error?: string;
}

export function renderPasswordPage({ flowParams, error }: PasswordPageOptions): string {
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';

  return pageShell(
    'work-helper connector',
    `<form method="post">
        <h1>Connect to work-helper</h1>
        <label for="password">Connector password</label>
        <input type="password" name="password" id="password" autofocus>
        ${errorHtml}
        ${hiddenFields(flowParams)}
        <button type="submit">Connect</button>
      </form>`,
  );
}

export function renderErrorPage(message: string): string {
  return pageShell('work-helper connector — error', `<h1>Connection request rejected</h1><p>${escapeHtml(message)}</p>`);
}

export function renderLockedPage(): string {
  return pageShell(
    'work-helper connector — locked',
    `<h1>Password entry locked</h1><p>Too many incorrect attempts. Password entry from this connection is locked until the server restarts.</p>`,
  );
}
