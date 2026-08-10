# Email Sync Improvements — Automated-Check Evidence (MCP-only criteria)

Feature: 012-email-sync-improvements. This file covers the acceptance criteria reachable only through the MCP tools or the HTTP API — no browser involved. UI-facing US1 criteria (scenarios 1–5) have separate browser evidence in this same directory. Raw `vitest run --reporter=verbose` output for every test referenced below is saved alongside this file as `automated-check-output.txt` (94/94 tests passed, captured 2026-08-10).

## US1 scenario 6 — MCP-triggered sync appears in run history with source "mcp"

**Given** an authorized agent, **when** it calls `sync-emails` with a valid range, **then** the run appears in the Sync page's run history with source "MCP" and its counts.

Test: `tests/integration/email-sync.test.ts` → `US1: sync-emails records run history through the shared coordinator > records an executed run with source "mcp" and its counts (US1 scenario 6, FR-007)`

**Result: PASS** — asserts a `GET /api/email-sync/runs` row with `{ source: 'mcp', status: 'success', newCount: 2, updatedCount: 0, error: null }` after an MCP `sync-emails` call.

Also covered: `rejects a tool call arriving while a sync is active with "A sync is already running" and records nothing for it` (FR-006) and `records a failure run when the mailbox is unreachable, alongside the existing tool-error response` (FR-007/FR-008 on the MCP path) — both **PASS**.

## US2 scenario 1 — full FR-009 capture through get-conversation

**Given** a fully-populated "Quote attached" message (display names, both timestamps, unread, importance high, flagged, category, one PDF attachment), **when** synced and fetched via `get-conversation`, **then** every FR-009 field is present.

Tests:

- `tests/integration/email-sync.test.ts` → `US2: full metadata capture > stores every FR-009 field for a fully-populated message (US2 scenario 1)` — asserts the stored row (sourceFolder, isRead, importance, flagStatus, categories, webLink, internetMessageId, sentAt/receivedAt), the participant displayNames, and the attachment row.
- `tests/integration/email-read-tools.test.ts` → `US2: get-conversation and list-conversations expose the full FR-009/FR-010 field set > get-conversation surfaces every FR-009 field for a fully-populated message (US2 scenario 1)` — asserts the same fields as returned through the MCP `get-conversation` tool.
- `tests/integration/email-sync.test.ts` → `US2: full metadata capture > syncs a message with no attachments, normal importance, no flag, no categories, and an address-only sender cleanly (FR-011)` — the empty/defaulted-fields edge case.

**Result: PASS** (all three).

## US2 scenario 2 — list-conversations indicators + participants

**Given** the synced "Quote attached" message, **when** `list-conversations` is called, **then** the conversation entry shows `hasUnread`, `hasAttachments`, and a `participants` array alongside subject/count/date.

Test: `tests/integration/email-read-tools.test.ts` → `US2: get-conversation and list-conversations expose the full FR-009/FR-010 field set > list-conversations shows unread + attachment indicators and participants alongside subject/count/date (US2 scenario 2)`

**Result: PASS** — asserts `hasUnread: true`, `hasAttachments: true`, and `participants` containing both the sender (with linked person) and the recipient (unlinked).

## US3 scenario 1 — all meaningful folders, Junk/Drafts/Deleted Items excluded

**Given** six messages across Inbox, Archive, a custom "Projects" folder, Junk, Drafts, and Deleted Items, **when** a covering sync runs, **then** the run reports 3 new, the three included messages show the correct folder display name, and the three excluded messages appear nowhere in `list-conversations`.

Test: `tests/integration/email-sync.test.ts` → `US3: sync all meaningful folders > covers Inbox, Archive, and custom folders while excluding Junk/Drafts/Deleted Items (US3 scenario 1)`

**Result: PASS** — asserts `syncedCount: 3`, `sourceFolder` of `'Inbox'` / `'Archive'` / `'Projects'` for the three stored messages, and that the three excluded subjects appear in neither the stored rows nor `list-conversations`.

Also covered at the unit level: `tests/unit/email-folder-pruning.test.ts` (both tests **PASS**) — proves the pruning policy itself keeps arbitrarily-nested Inbox/Archive/custom folders and drops Junk/Deleted Items/Drafts subtrees wholesale, independent of any provider.

## US4 scenario 1 — refresh on overlapping re-sync

**Given** "Quote attached" was synced unread in Inbox, then marked read and moved to Archive in the mailbox, **when** a sync runs over an overlapping range, **then** the run reports 0 new / 1 updated, the stored row shows read state read and folder Archive while subject/body/timestamps/participants are unchanged, and the conversation's message count is unchanged (no duplicate).

Test: `tests/integration/email-sync.test.ts` → `US4: keep stored metadata fresh on re-sync > refreshes read state and folder while leaving subject/body/participants/timestamps unchanged, with no duplicate (US4 scenario 1, FR-013)`

**Result: PASS** — asserts `{ status: 'complete', syncedCount: 0, updatedCount: 1 }`, byte-identical subject/body/timestamps, `sourceFolder: 'Archive'`, `isRead: true`, an unchanged conversation count, an unchanged participant row, and the attachment row still present (name unchanged, replaced wholesale under the hood).

Also covered: `stores each message exactly once across two runs with overlapping ranges (SC-004)` — **PASS**.

Field-rule precision (unit level): `tests/unit/email-refresh-rules.test.ts` — drives `runSync` directly against a real (in-memory) DB across two runs with a controllable stub provider, and asserts field-by-field that exactly `sourceFolder`, `sentAt`, `receivedAt`, `isRead`, `importance`, `flagStatus`, `categories`, `webLink`, `internetMessageId`, and the attachment rows change, while `subject`, `bodyOriginal`/`bodyContentType`/`bodyText`, `conversationId`, `graphMessageId`, `createdAt`, and participant rows stay byte-identical even when the incoming message attempts to change them. **PASS**.

## Edge case — a second trigger while a run is in flight is rejected, records nothing

Tests:

- `tests/integration/email-sync-runs.test.ts` → `POST /api/email-sync/runs > rejects a trigger arriving while a run is in flight with 409 and records nothing for it` (web path) — **PASS**.
- `tests/integration/email-sync.test.ts` → `US1: sync-emails records run history through the shared coordinator > rejects a tool call arriving while a sync is active with "A sync is already running" and records nothing for it` (MCP path) — **PASS**.

Both hold a sync open on a gated stub provider, fire a second trigger while the gate is closed, assert the rejection (409 / tool error "A sync is already running"), then release the gate and confirm exactly one run was recorded.

## Edge case — empty range records a 0 new / 0 updated success

Test: `tests/integration/email-sync-runs.test.ts` → `POST /api/email-sync/runs > records a 0 new / 0 updated success run for a range with no matching messages`

**Result: PASS**.

## Edge case — mid-run partial failure, then a later overlapping sync completes without duplicates

Tests:

- `tests/integration/email-sync-runs.test.ts` → `POST /api/email-sync/runs > records a partial-failure run when the connection drops mid-run, then a later overlapping run stores the remainder without duplicates` (web path) — **PASS**.
- `tests/integration/email-sync.test.ts` → `US1: sync-emails > keeps partial progress and reports "interrupted" when the connection drops mid-run, then completes on re-run without duplicates` (MCP path) — **PASS**. Also asserts the follow-up run's `updatedCount` reflects the already-stored messages it re-encounters.

## Summary

| Criterion | Test(s) | Result |
|---|---|---|
| US1-6 MCP source in history | email-sync.test.ts (coordinator describe block) | PASS |
| US2-1 full FR-009 capture | email-sync.test.ts, email-read-tools.test.ts | PASS |
| US2-2 list-conversations indicators + participants | email-read-tools.test.ts | PASS |
| US3-1 all-folder coverage + exclusion | email-sync.test.ts, email-folder-pruning.test.ts | PASS |
| US4-1 refresh on re-sync | email-sync.test.ts, email-refresh-rules.test.ts | PASS |
| Edge: already-running | email-sync-runs.test.ts, email-sync.test.ts | PASS |
| Edge: empty range | email-sync-runs.test.ts | PASS |
| Edge: mid-run partial failure | email-sync-runs.test.ts, email-sync.test.ts | PASS |

94/94 tests passed across all ten test files exercised for this evidence pass (`automated-check-output.txt`). The full project gate (`npm run lint && npm run typecheck && npm test && npm run build`) also passes — 586/586 tests total.
