# US2/US3 Browser Evidence

Captured by the `browser-tester` agent against the running dev server, in three separate sessions (each needing a different `MAIL_AUTH`/`MAIL_PROVIDER` combination).

## US2 — See true connection state at a glance

`MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev`.

| Scenario | Result | Screenshot(s) |
|---|---|---|
| US2-2: connected panel + Disconnect works | PASS — Disconnect fired a real `POST /api/mailbox/disconnect` (200), panel updated to "Not connected" without reload | `us2-2-connected.png`, `us2-2-connected-disconnect.png` |
| US2-3: dead/expired sign-in reads as not-connected | Not UI/API-reachable — the `expired` state only arises from a stale on-disk token cache, which cannot be seeded through the running app's UI or API. Covered instead by the automated integration suite (`tests/integration/mailbox-api.test.ts`, "a fake seeded with a dead/expired sign-in reports not-connected/expired") — recorded automated-check output is the surface-appropriate evidence here per the constitution. | — |

## US3 — Recover from failure and disconnect

### US3-1: declined attempt shows error + Connect again (FR-006)

First attempted against `MAIL_AUTH=fake MAIL_PROVIDER=fake` (always-succeeds mode) — correctly BLOCKED, since that mode can't produce a decline. Re-run against `MAIL_AUTH=fake-decline MAIL_PROVIDER=fake npm run dev` with a clean never-signed-in state:

| Step | Result | Screenshot |
|---|---|---|
| Not-connected panel | PASS | (see US1 evidence) |
| Click Connect → pending | PASS | `us3-1-pending.png` |
| Auto-decline after ~2s → error shown, no reload | PASS — exact text: "AADSTS70016: The user declined the device-code sign-in request." | `us3-1-declined-error.png` |
| Connect again → fresh pending attempt (recovery) | PASS | `us3-1-retry-pending.png` |

(`us3-1-blocked-connect-always-succeeds.png` is the earlier, correctly-blocked attempt under the wrong dev mode — kept for the record, superseded by the PASS above.)

### US3-2: Disconnect → Not connected (no reload)

`MAIL_AUTH=fake MAIL_PROVIDER=fake npm run dev`.

PASS — confirmed twice, independently, by two different evidence sessions. Clicking Disconnect fires a real `POST /api/mailbox/disconnect` (200), and the panel updates to "Not connected" without a reload.

Screenshots: `us3-2-before-connected.png`, `us3-2-disconnect.png`.

### US3-3: sync error copy, no CLI mention

First attempted against `MAIL_AUTH=fake MAIL_PROVIDER=fake` — inconclusive, because `MAIL_PROVIDER=fake` serves a `FakeMailProvider` that ignores mailbox connection state entirely, so sync succeeded regardless of being disconnected (expected: `MAIL_PROVIDER` and `MAIL_AUTH` are independent dev switches).

Re-run against `MAIL_AUTH=fake npm run dev` (no `MAIL_PROVIDER`) — with this mode, `mailProvider` is `GraphMailProvider` wired to the fake mailbox auth, so it genuinely respects connection state (and `getAccessToken()` throws before any network call when disconnected, so no real Microsoft traffic occurs). Mailbox left disconnected, sync triggered from the Sync page:

**PASS** — exact text observed: "Sync failed: Mailbox is not connected (never signed in) — connect the mailbox on the Sync page." No CLI mention.

Screenshot: `us3-3-sync-error-copy.png`.

## Note

FR-008 (restart persistence) and FR-009/FR-010's MCP-surface criteria are evidenced by recorded automated-check output (`tests/integration/mailbox-api.test.ts`, `tests/integration/email-sync.test.ts`), not browser screenshots, per the constitution's surface-appropriate-evidence rule — see quickstart.md.
