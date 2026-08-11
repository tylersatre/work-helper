# Quickstart: Email Sync validation

**Feature**: 007-email-sync | Validation scenarios proving the feature end-to-end. Contracts: [mcp-email-tools.md](contracts/mcp-email-tools.md), [people-email-linking.md](contracts/people-email-linking.md); entities: [data-model.md](data-model.md).

## Prerequisites

- Node ≥ 22, deps installed (`npm install` — the worktree SessionStart hook does this).
- Automated checks need **no** Microsoft credentials: the whole automated suite runs against the seeded `FakeMailProvider` (research R6).
- The real-mailbox pass (Tyler's manual acceptance, SC-006) additionally needs: a one-time Entra ID app registration (public client, delegated `Mail.Read` + `offline_access`, device-code flow enabled) providing `MS_CLIENT_ID`; then one interactive sign-in.

## Automated validation (simulated mailbox)

```bash
npm run lint && npm run typecheck && npm test
```

All acceptance-relevant suites run inside `npm test` (vitest, in-memory SQLite, real Fastify app + OAuth'd MCP client, fake mail provider). Expected green suites and what each proves:

| Suite | Proves (spec refs) |
|---|---|
| `tests/integration/email-sync.test.ts` | US1: date-range pull from Inbox+Sent only, endpoint-day inclusivity in server-local tz, reported count, idempotent overlap re-run, snapshot survives mailbox deletion, missing/invalid range validation, connection-failure and interrupted-run semantics (FR-001–FR-006, FR-015, FR-016; US1 scenarios 1–4; SC-001, SC-002, SC-005) |
| `tests/integration/email-read-tools.test.ts` | US2: list-conversations ordering/counts/dates + keyset paging exactly-once, get-conversation chronological messages with bodies and role tags (FR-007, FR-008; US2 scenarios 1–2; SC-003) |
| `tests/integration/email-person-linking.test.ts` | US3: case-insensitive linking to people, unlinked addresses, People-page add links existing unlinked record, cross-person uniqueness rejection, emails-for-person across all addresses with per-address roles + paging (FR-009–FR-013; US3 scenarios 1–4; SC-004) |
| `tests/unit/` additions (sync window, cursor codec, graph provider request building, html→text derivation) | R2, R4, R5, R9 mechanics |
| Existing suites (people, contact-entries, mcp-*) | FR-011 "keeps working exactly as today"; FR-014 auth gate unchanged |

`tests/integration/migration-carry-over.test.ts` is expected to be **gone**, not failing (research R8).

## Browser evidence (browser-tester agent → `docs/evidence/email-sync/`)

This slice has no email UI (out of scope), so browser evidence covers the People-page criteria; MCP-only criteria are evidenced by the integration suites above plus their command output.

1. **US3-2**: on the People page, edit a person and add an email address that exists as an unlinked synced record → saves like any add; screenshot the saved person.
2. **US3-3**: attempt to add an address already owned by another person → "That email is already in use" validation message shown, record unchanged; screenshot the rejection.
3. **Regression**: add/edit/remove/primary flows on a person's emails behave as before the schema change.

Seed for these via the dev API/fake-provider harness before driving the browser.

## Real-mailbox pass (manual acceptance, SC-006)

1. One-time sign-in (device code flow; writes the token cache under `./data/`):

```bash
MS_CLIENT_ID=<application-client-id> MS_TENANT_ID=<directory-tenant-id> npm run mail:signin
```

2. Start the app (`npm run dev` — feature 007 → API port 3007) with `MS_CLIENT_ID` set, connect an MCP client through the existing OAuth flow, and call `sync-emails` with a one-month range.
3. Expected: summary reports within 5 minutes with a plausible `syncedCount`; `list-conversations` / `get-conversation` / `emails-for-person` return the real correspondence; the Outlook mailbox itself is unchanged (no read-status changes, no moves).
4. If the token cache is missing/expired, `sync-emails` fails with a clear sign-in error and stores nothing; re-run step 1.

For the self-hosted Docker deployment (feature 006), sign-in is still run from a host checkout against the same `./data/` directory the container reads — see `docs/deploy.md`'s "Email sync mailbox sign-in" section.

## Schema reset note

The schema change squashes drizzle migrations to a fresh baseline (research R8). Existing dev databases must be recreated once:

```bash
rm -f data/*.db
```

Tests are unaffected (in-memory DBs).
