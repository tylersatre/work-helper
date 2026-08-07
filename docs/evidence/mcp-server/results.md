# MCP Server — Acceptance Evidence

**Feature**: 004-mcp-server
**Date tested**: 2026-08-06
**Servers under test**: backend on http://localhost:3001 (Fastify + MCP), Vue SPA on http://localhost:5174 (proxying `/api` to the backend), plus a throwaway local echo server on http://localhost:9999 standing in for an OAuth client's callback endpoint (renders the received path+query as visible page text — a real, inspectable redirect target rather than an unreachable one).

Evidence scope follows [quickstart.md](../../../specs/004-mcp-server/quickstart.md)'s evidence map: browser evidence covers the password page (the feature's only new UI, US1/US4) and the web app's rendering of MCP-originated writes (US3). US2 (pure data retrieval over the MCP protocol) and US5 (token revocation, a protocol-level behavior with no UI) have no separate browser surface beyond what US1's connect flow already exercises — their acceptance is via the scripted-MCP-client integration tests (`tests/integration/mcp-read-tools.test.ts`, `tests/integration/mcp-revocation.test.ts`), which drive a real listening server with the SDK's own client. Claude Desktop connection itself is Tyler's manual acceptance step per the spec's 2026-08-06 clarification — not an automated or browser-evidence item.

## User Story 1 — Connect a client through the password gate

### Scenario (US1-AS1, US1-AS2): password form, wrong-password retry, success

**Given** a standards-compliant client opens the authorize URL for a registered client, **When** it enters the wrong password and retries, then enters the correct password, **Then** it sees a retryable error on the wrong attempt and a redirect carrying an authorization code on the correct one.

**Result**: PASS

Navigated to a valid `GET /oauth/authorize` URL (PKCE S256, pre-registered client). The page showed a single "Connector password" field and a "Connect" button — no other fields.

**Evidence**: `us1-password-form.png`

Submitted a wrong password (`wrong-password-1`): server responded `401`, page re-rendered the same form with the visible message "Incorrect password. Please try again." — the form remained usable (not locked, this is only the 1st failure).

**Evidence**: `us1-wrong-password-error.png`

Submitted a second wrong password: `401` again, same retryable error, still not locked (2nd consecutive failure, per FR-006/FR-007 the lock only trips on the 3rd).

Submitted the correct password `correct-horse-battery`: server responded `302`. The browser landed on the registered `redirect_uri` — a local echo server that renders the exact request path+query it received as visible page text: `/callback?code=LpJrmVZWE58o7EjidZmQ6CVoOqTGsaUDrLQcO3rS7Lo&state=evidence-state-2`. Both an authorization `code` and the round-tripped `state=evidence-state-2` are present, proving the redirect carried real OAuth flow data (FR-012's success path; contracts/http-auth.md's `302 Location: <redirect_uri>?code=...&state=...`).

**Evidence**: `us1-success-redirect.png`

*(Note: an earlier evidence pass used an unreachable `redirect_uri`, producing a browser connection-error screenshot that proved nothing. This run replaces it with a real, inspectable callback target.)*

### Scenario (US1-AS3, FR-012): unauthenticated `/mcp` refused

**Result**: PASS (automated only — not a browser-observable surface)

`tests/integration/mcp-connect.test.ts` asserts an unauthenticated `POST /mcp` returns `401` with a `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"` header. No UI exists at this endpoint to screenshot.

## User Story 3 — Capture tasks and notes from a conversation

### Scenario (US3-AS1, FR-020, SC-004): create-task with an initial note lands in the web app

**Given** an authorized MCP client calls `create-task` with title "Book venue" and note "Requested during planning chat", **When** Tyler opens the board, **Then** the card appears in the first lane with the note visible and labeled "via MCP", surviving a reload.

**Result**: PASS

`create-task` was called via a real MCP tool call (no HTTP shortcuts). The board showed "Book venue" in the "To Do" lane.

**Evidence**: `us3-board-book-venue.png`

Opening the task's detail view showed the note "Requested during planning chat" labeled exactly **via MCP** (the `data-testid="note-source"` element).

**Evidence**: `us3-task-detail-via-mcp.png`

A full page reload (real navigation, not SPA routing) showed the same card and the same "via MCP" label still present.

**Evidence**: `us3-after-reload.png`

### Scenario (US3-AS2, FR-018): add-note appends a newest "via MCP" note above an existing UI note

**Given** a task "Draft launch plan" already has one UI-added note ("Kickoff call went well"), **When** an authorized MCP client calls `add-note` with "Follow-up scheduled with the vendor", **Then** the web app shows the new note first, labeled "via MCP", with the original UI note unchanged below it labeled "You" — both surviving a reload.

**Result**: PASS

The task detail view showed exactly two notes, newest first:
1. "Follow-up scheduled with the vendor" — label **via MCP**
2. "Kickoff call went well" — label **You**

Confirmed both visually and by reading the `data-testid="note-source"` elements directly (`["via MCP", "You"]` in DOM order, matching the visible top-to-bottom order).

**Evidence**: `us3-two-notes-ordering.png`

A full page reload preserved both notes in the same order with the same labels (timestamps advanced between checks, confirming a real re-fetch rather than stale client state).

**Evidence**: `us3-two-notes-after-reload.png`

## User Story 4 — Lock out password guessing, per IP

### Scenario (US4-AS1, FR-006–FR-008): three consecutive wrong passwords lock the page

**Given** three consecutive wrong password submissions from one browser/IP, **When** a third wrong password is submitted, **Then** the page shows a distinct locked state with no form — refusing even the correct password until a restart.

**Result**: PASS

After a third consecutive wrong password, the server responded `423` and the page showed a heading "Password entry locked" and the message "Too many incorrect attempts. Password entry from this connection is locked until the server restarts." — no password input, no submit button, no form of any kind.

**Evidence**: `us4-locked-state.png`

### Scenario (US4-AS2, FR-009): restart clears the lockout

**Result**: PASS (automated only)

`tests/integration/mcp-lockout.test.ts` rebuilds the app over the same on-disk database (simulating a restart) and confirms the previously-locked IP succeeds again afterward, while `tests/unit/mcp-lockout.test.ts` pins the tracker's own invariant that nothing short of a fresh tracker (i.e. a restart) can clear a lock. No distinct browser state exists for "cleared by restart" beyond the already-evidenced unlocked form (`us1-password-form.png`) and locked form (`us4-locked-state.png`) — the transition between them requires an actual process restart, which is a server lifecycle event rather than a UI state.

## User Story 2 — Ask about the board, tasks, and people

**Result**: PASS (automated only — no browser surface)

`tests/integration/mcp-read-tools.test.ts` drives a real MCP client through `list-board`, `get-task`, `search-people`, and `get-person` against seeded data and asserts exact shapes, orderings, and error strings per `contracts/mcp-tools.md`. These are pure protocol-level reads with no rendered UI of their own to screenshot; the underlying data is the same data proven visible in the US3 web-app screenshots above.

## User Story 5 — Revoke access by changing the password

**Result**: PASS (automated only — no browser surface)

`tests/integration/mcp-revocation.test.ts` proves: a restart with the same password keeps existing tokens working (no re-auth, no password page); a restart with a changed password fails the next tool call with `401` + `WWW-Authenticate`, and reconnecting refuses the old password (retryable error) while accepting the new one; and one password change cuts off multiple previously-connected clients at once. Token revocation is inherently a protocol-level (bearer token validity) behavior with no distinct UI to screenshot beyond the password-page states already evidenced under US1/US4.

## Overall

| Story | Scenario | Result | Evidence |
|---|---|---|---|
| US1 | Wrong-password retry then success (AS1/AS3) | PASS | us1-password-form.png, us1-wrong-password-error.png, us1-success-redirect.png |
| US1 | Unauthenticated `/mcp` refused (AS3, FR-012) | PASS | automated (mcp-connect.test.ts) |
| US2 | Read tools return exact contract shapes (AS1–AS3) | PASS | automated (mcp-read-tools.test.ts) |
| US3 | create-task + note visible, "via MCP", survives reload (AS1) | PASS | us3-board-book-venue.png, us3-task-detail-via-mcp.png, us3-after-reload.png |
| US3 | add-note ordering and labels, survives reload (AS2) | PASS | us3-two-notes-ordering.png, us3-two-notes-after-reload.png |
| US4 | Three-strike lockout, no form (AS1) | PASS | us4-locked-state.png |
| US4 | Restart clears lockout (AS2) | PASS | automated (mcp-lockout.test.ts, mcp-lockout unit test) |
| US5 | Same-password restart keeps tokens working (AS1) | PASS | automated (mcp-revocation.test.ts) |
| US5 | Changed-password restart revokes tokens (AS2) | PASS | automated (mcp-revocation.test.ts) |

All 13 acceptance scenarios across US1–US5 in spec.md pass (the 9 rows above group related scenarios together, e.g. US1's row covers AS1 and AS2), each backed by browser evidence where a browser surface exists and by scripted-MCP-client integration tests otherwise. Full automated gate (`npm run lint && npm run typecheck && npm test && npm run build`) is green: 29 test files, 228 tests.
