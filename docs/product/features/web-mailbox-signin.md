# Feature: web-mailbox-signin

## User story

As Tyler, I want to connect and reconnect my Outlook mailbox from the web UI — a panel on the Sync page that shows the device-code link and code in the browser and reports the connection state — so that signing in no longer means shelling into a host clone of the repo, running a CLI script, and copying codes between machines.

## Acceptance criteria

Sign-in criteria run against a simulated device-code flow seeded by test setup (the automated checks never talk to real Microsoft); Tyler's manual acceptance pass connects his real mailbox. The flow itself is unchanged from today: same MSAL public client, same delegated scopes, same token cache file — only where it starts and where the code is shown moves to the web. "The mailbox panel" means a new panel on the existing Email Sync page. Account names, codes, and error texts below are illustrative concrete test data.

- **Given** the server is running without `MS_CLIENT_ID`/`MS_TENANT_ID` configured
  **When** I open the Email Sync page
  **Then** the mailbox panel shows that mail is not configured, points at the env vars needed to configure it, and offers no Connect button

- **Given** mail is configured but no account has ever signed in (empty token cache)
  **When** I open the Email Sync page
  **Then** the mailbox panel shows a "Not connected" state and a Connect button

- **Given** the "Not connected" panel
  **When** I click Connect
  **Then** the panel shows the Microsoft verification link (opening in a new tab), the user code with a copy control, and a waiting indicator — without me leaving or reloading the Sync page

- **Given** a Connect attempt is pending with code "ABC-DEF-123"
  **When** I click Connect again (same tab or after a page reload)
  **Then** the panel shows the same pending attempt with code "ABC-DEF-123" — no second device-code flow is started

- **Given** a pending Connect attempt
  **When** the sign-in completes on Microsoft's side as "tyler@example.com"
  **Then** the panel flips to "Connected as tyler@example.com" without a page reload, and the connection survives a server restart (token cache persisted to the same file sync reads)

- **Given** a pending Connect attempt
  **When** the sign-in is declined or the code expires on Microsoft's side
  **Then** the panel reports the failure with the error from Microsoft and offers Connect again

- **Given** a connected mailbox
  **When** I open the Email Sync page
  **Then** the panel shows "Connected as tyler@example.com" and a Disconnect button, and "connected" is verified by an actual silent token acquisition — a present-but-dead token cache shows as not connected, not as connected

- **Given** a connected mailbox
  **When** I click Disconnect
  **Then** the panel returns to "Not connected", the removal persists across a server restart, and a subsequent sync attempt fails with the connect-the-mailbox message below

- **Given** mail is configured but the mailbox is not connected (or its sign-in has expired)
  **When** a sync is triggered from the web or via the sync-emails MCP tool
  **Then** the recorded error tells me to connect the mailbox on the Sync page — no error path anywhere in the app tells me to run `npm run mail:signin` anymore

- **Given** a mailbox whose sign-in has expired (dead refresh token) versus one that has never signed in
  **When** each state produces its error
  **Then** the two states are distinguishable in the error detail (the underlying auth failure is no longer swallowed), even though both lead to the same "connect the mailbox" action

## Out of scope

- The redirect-based (auth code + PKCE) sign-in flow — deliberately not chosen; device code keeps the Azure app registration unchanged and works on any host.
- Removing the `npm run mail:signin` CLI — it stays as a headless fallback and must keep working; the web flow is the primary path and the docs lead with it.
- Multiple mailboxes or accounts — one mailbox, Tyler's; connecting a second account while one is connected is not supported.
- Any change to sync behavior, scopes (`Mail.Read`, `offline_access`), token cache format or location, or the Azure app registration.
- Sign-in state surfaced through MCP tools — agents only see the updated error text on failed syncs; there is no connect/status MCP tool.
- Auto-reconnect, token-expiry warnings, or notifications — the panel reports state when the page is open, nothing proactive.

## Open questions

- Interview resolved (2026-08-11): web-based sign-in via device code shown in the browser (no Azure registration changes) over redirect OAuth; panel scope is status + connect + disconnect on the Sync page; error strings across web and MCP point at the Sync page instead of the CLI; CLI script kept as a fallback.
- Exact panel copy and layout are acceptance-time details Tyler can adjust.
- None remaining — ready for `/speckit-specify`.
