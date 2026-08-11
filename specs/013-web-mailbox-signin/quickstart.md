# Quickstart: web-mailbox-signin validation

**Feature**: `013-web-mailbox-signin` | **Date**: 2026-08-11

How to prove the feature works end-to-end. Automated checks never contact real Microsoft — sign-in scenarios run against the simulated flow (research.md D6); only Tyler's manual acceptance pass at the end touches a real mailbox.

## Prerequisites

- Node ≥22, dependencies installed (`npm install` — the worktree SessionStart hook normally does this).
- Ports for this branch (013): API **3013**, UI **5113** (derived by `scripts/dev-ports.sh`).

## Automated checks

```bash
npm run lint && npm run typecheck && npm test
```

New suites this feature adds (names indicative; see tasks.md): unit tests for `MailboxAuth` verification/sign-out over the msal mock (extends tests/unit/email-graph-auth.test.ts), unit tests for `MailboxConnectionManager` attempt lifecycle, integration tests for the three `/api/mailbox` endpoints with `FakeMailboxAuth` (including restart persistence: second `buildApp` over the same fake store file / token cache), integration assertions that no recorded sync error matches `/mail:signin/` (SC-004 — the existing assertion at tests/integration/email-sync.test.ts:314 inverts), and component tests for `MailboxPanel.vue` state rendering.

## Browser evidence (browser-tester agent)

Each spec state is seeded by env + fake-store file, then driven through the real UI at `http://localhost:5113/` (Sync page). Evidence lands in `docs/evidence/013-web-mailbox-signin/`.

| Scenario | Server setup | Drive & expect |
|---|---|---|
| Not configured (US2-1) | No `MS_*` vars, no `MAIL_AUTH` | Panel names the missing settings, no Connect button |
| Not connected → Connect → pending (US1-1..2) | `MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev`, no fake-store file | Click Connect: link + code + copy control + waiting indicator appear without reload |
| Pending resume (US1-5 / FR-004) | While pending | Reload page, click Connect again: same code shown |
| Connected flip (US1-3) | Fake completes ~2s after Connect as `tyler@example.com` | Panel flips to "Connected as tyler@example.com" with no reload (poll picks it up) |
| Connected at a glance + Disconnect (US2-2, US3-2) | Fake store pre-seeded connected | Panel shows connected + Disconnect; click Disconnect → "Not connected" |
| Declined/expired attempt (US3-1) | `MAIL_AUTH=fake-decline MAIL_PROVIDER=fake` | Connect → after ~2s panel shows Microsoft's error and offers Connect again |
| Dead sign-in reads as not connected (US2-3) | Fake store seeded with a dead/expired sign-in | Panel shows not connected, never connected |
| Sync error copy (US3-3) | Configured-but-not-connected | Trigger a sync from the page: recorded error says connect on the Sync page, no CLI mention |

Restart-persistence criteria (FR-008, FR-009) and the MCP-side error copy (FR-010 via `sync-emails`) are API/store-surface criteria — covered by the integration suites above with recorded output, per the constitution's surface-appropriate-evidence rule.

## Manual acceptance pass (Tyler, real Microsoft)

1. Real `MS_CLIENT_ID`/`MS_TENANT_ID` set, no `MAIL_AUTH`/`MAIL_PROVIDER`, empty/absent token cache → Sync page shows Not connected.
2. Connect → open the link in a new tab, enter the code, sign in → panel flips to your real account without reload (SC-001: under 2 minutes, no terminal).
3. Restart the server → still connected. Run a sync → succeeds.
4. Disconnect → Not connected; sync now fails with the connect-on-Sync-page message. Reconnect from the page alone (SC-002).
5. Headless fallback still works: `npm run mail:signin` signs in and the panel shows connected on next refresh (FR-012, last-completed-sign-in-wins edge case).

## Definition of done gate

`verifier` agent re-runs the commands above and cross-checks evidence in `docs/evidence/013-web-mailbox-signin/` against every acceptance criterion; the Stop-hook gate (lint/typecheck/test/build) must pass before any completion claim.
