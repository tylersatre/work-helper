# Quickstart: Validating Calendar Sync

Runnable scenarios proving the feature end-to-end. Contracts: [contracts/http-api.md](./contracts/http-api.md), [contracts/mcp-tools.md](./contracts/mcp-tools.md); storage: [data-model.md](./data-model.md). All automated sync checks run against the seeded `FakeCalendarProvider` (research R5); only Tyler's manual acceptance pass touches the real calendar.

## Prerequisites

- Dependencies installed (`npm install` — the worktree SessionStart hook does this).
- Feature ports for branch `019-*`: API **3019**, UI **5119** (`npm run dev` derives them).
- Fake providers for anything browser-driven: `MAIL_PROVIDER=fake` seeds both the mailbox and (new) the calendar via `src/server/services/calendar/dev-seed.ts`.

## Automated checks (the gate)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Targeted runs while iterating:

```bash
npx vitest run tests/unit/calendar-sync-window.test.ts tests/unit/calendar-refresh-rules.test.ts   # window + new/updated/cancellation semantics (US4, US5)
npx vitest run tests/unit/calendar-graph-provider.test.ts                                          # calendarView URL, $select, paging, Prefer headers, 401/403 mapping
npx vitest run tests/integration/calendar-sync.test.ts                                             # MCP e2e: sync-calendar, counts, series ids, validation, already-running (US1, US4, US6)
npx vitest run tests/integration/calendar-sync-runs.test.ts                                        # HTTP: run recording, 400/409, persistence across app rebuild (US1)
npx vitest run tests/integration/calendar-read-tools.test.ts                                       # list-events / get-event / events-for-person, person linking (US2, US3, US5)
npx vitest run tests/integration/mcp-unlinked-addresses.test.ts                                    # extended counts, resource exclusion, ordering (US7)
npx vitest run tests/component/sync-page.test.ts tests/component/app-shell.test.ts                 # calendar section, prefill, disabled states, nav rename (US1)
npx vitest run tests/integration/migration-upgrade.test.ts                                         # fresh vs upgraded DB parity for migration 0002
```

Expected: all pass; the integration suites boot the real Fastify app with an injected `FakeCalendarProvider` and drive the real MCP client through the OAuth flow (existing harness in `tests/integration/helpers/`).

## Scenario walkthroughs

### 1. First sync from the Sync page (US1, SC-001)

1. `MAIL_PROVIDER=fake npm run dev`, open `http://localhost:5119/sync`.
2. Verify the calendar section beside the email section: date pickers prefilled today−30 / today+30, Sync button, "No syncs yet" empty state; email section unchanged.
3. Click Sync → button disables, in-progress indicator shows; on completion the result line reports the seeded counts and a history row appears (when, range, source "web", success, counts). Reload → row persists.
4. Expected: matches US1 scenarios 1–2; browser-tester captures this flow as evidence.

### 2. Full detail round-trip + person linking (US2, US3, SC-002, SC-004)

Covered by `calendar-read-tools.test.ts`: seed one fully-populated event (organizer, required/optional attendees with responses, location, join link, category, body), sync, then `get-event` and assert every FR-008 field; link an attendee address to a person via the existing contact-entry flow and assert `events-for-person` returns the event with the matching address and role, no re-sync.

### 3. Recurrence, refresh, cancellation (US4, US5, SC-003, SC-006)

Covered by `calendar-sync.test.ts` + `calendar-refresh-rules.test.ts`: seed a weekly series (5 occurrences) plus a one-off, sync a month, assert 6 new with shared `seriesId` on occurrences only; mutate the fake (move an event, flip a response, remove an occurrence), re-sync, assert 0 new / correct updated counts, refreshed fields, the removed occurrence retained and flagged cancelled, and no duplicates.

### 4. Agent-triggered sync + validation (US6, SC-005)

Covered by `calendar-sync.test.ts`: `sync-calendar` with a valid range → history row with source "MCP"; with no range and with an inverted range → tool errors, no history rows. Concurrency: a gated in-flight sync makes both the web POST return 409 and the colliding tool call return "A sync is already running" — and `GET /api/sync/status` reports `{ running: true }`, which the component test asserts disables both buttons.

### 5. Unlinked-address discovery spans both sources (US7)

Covered by the extended `mcp-unlinked-addresses.test.ts`: seed the US7 fixture (2 msg/3 evt, 1/0, 0/1, one linked address, one resource-only address) and assert row order, both counts per row, the linked address absent, and the resource-only address absent.

## Manual acceptance pass (Tyler, real calendar)

1. If the Azure app registration uses static consent, add the delegated `Calendars.Read` permission there first (research R4).
2. On the deployed instance, the mailbox may show as needing reconnection (widened scopes) — reconnect once via the Sync page device-code flow, consenting to calendar read.
3. Sync a real range from the Sync page; spot-check counts against Outlook, then ask an agent (via the work-helper MCP) "who's in my meetings this week?" and "when did I last meet <person>?" (SC-004).
