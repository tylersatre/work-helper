# Tasks: Calendar Sync

**Input**: Design documents from `/specs/019-calendar-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires red→green TDD: every implementation task is preceded by a task that writes its failing tests, and code written before its failing test is discarded.

**Organization**: Tasks are grouped by user story (US1–US7 from spec.md) so each story is an independently implementable, independently testable increment. Stories execute in priority order (P1 → P2 → P3); later stories extend files created by earlier ones.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same group (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US7); Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path(s)

## Path Conventions

Single project at repository root: `src/server/`, `src/client/`, `tests/`, `drizzle/` — per plan.md Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirm the worktree is healthy before any feature work.

- [X] T001 Run the full gate (`npm run lint && npm run typecheck && npm test && npm run build`) in the worktree root and confirm it passes clean on the unmodified branch, so later failures are attributable to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, and the provider abstraction every user story's tests depend on. No user story work can begin until this phase is complete.

- [X] T002 Add `calendarEvents`, `calendarEventParticipants`, and `calendarSyncRuns` tables to `src/server/db/schema.ts` exactly per data-model.md — columns, enums, defaults, FKs (participants → events ON DELETE cascade, participants → email_addresses), and indexes (`calendar_events_graph_id_unique` UNIQUE, `calendar_events_start_at`, `calendar_events_series_master_id`, `calendar_event_participants_event_address_role_unique` UNIQUE, `calendar_event_participants_address_id`, `calendar_sync_runs_ran_at`), following existing schema conventions (epoch-ms integers, boolean mode, text enums, json mode)
- [X] T003 Generate the migration with `npx drizzle-kit generate` producing `drizzle/0002_*.sql`; verify it is purely additive (CREATE TABLE + CREATE INDEX only — no ALTER/DROP of existing tables), and run `npx vitest run tests/integration/migration-upgrade.test.ts` to confirm fresh-database and upgraded-database schemas converge (extend that test if migration 0002 is not automatically covered)
- [X] T004 [P] Create `src/server/services/calendar/provider.ts` defining the `CalendarProvider` interface (`fetchEvents(window: CalendarWindow): AsyncIterable<ProviderCalendarEvent[]>`) and the `ProviderCalendarEvent` / `CalendarWindow` types covering the full FR-008 field set: id, seriesMasterId, subject, start/end, isAllDay, isCancelled, location, body + content type, organizer (address, name), attendees (address, name, type required/optional/resource, response status), onlineMeetingUrl, categories, webLink — mirroring `src/server/services/email/provider.ts`
- [X] T005 Write failing unit tests in `tests/unit/calendar-sync-window.test.ts` for `FakeCalendarProvider`: window-overlap semantics (events overlapping any part of the inclusive local-day window are returned, including spans starting before or ending after it; disjoint events excluded; all-day/multi-day spans handled), paging in batches, and the failure-injection knobs (`failImmediately`, `throwAfterEventCount`) — run and confirm they fail
- [X] T006 Implement `FakeCalendarProvider` in `src/server/services/calendar/fake-provider.ts` — seedable from `SeedEvent[]`, reimplementing overlap-window and paging semantics with the same failure-injection knobs as `FakeMailProvider` — until T005's tests pass

**Checkpoint**: Schema migrated, provider contract defined, seedable fake available — user story phases can begin.

---

## Phase 3: User Story 1 - Sync calendar events on demand from the Sync page (Priority: P1) 🎯 MVP

**Goal**: A working calendar sync section on the Sync page — rolling ±30-day prefill, Sync button with in-progress state, persisted run history — backed by the Graph `calendarView` fetch, the sync engine's insert path, run recording, the global single-flight guard across both sync kinds, and the `list-events` MCP tool (US1 scenario 2 asserts an agent can list the synced range).

**Independent Test**: With a seeded fake calendar, sync a range from the Sync page and verify the reported counts, the persisted run history entry, in-range-only storage via `list-events`, and that both Sync buttons disable while any sync runs.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T007 [P] [US1] Write failing unit tests in `tests/unit/calendar-graph-provider.test.ts` (fetch-stub pattern from the email graph-provider tests): `calendarView` URL with server-computed UTC window from `computeSyncWindow`, `$select`/`$orderby`/`$top=100` params, `Prefer: IdType="ImmutableId"` and `Prefer: outlook.timezone="UTC"` headers, `@odata.nextLink` paging loop, UTC `dateTime` → epoch-ms parsing, and 401/403 mapping to `MailboxNotConnectedError`
- [X] T008 [P] [US1] Write failing integration tests in `tests/integration/calendar-sync-runs.test.ts` (real Fastify app + injected `FakeCalendarProvider`, per contracts/http-api.md): POST `/api/calendar-sync/runs` returns 201 `CalendarSyncRunView` with correct new count on success; 400 for missing dates ("A start date and end date are required"), malformed date, and inverted range with no run row recorded; 409 "A sync is already running" during an in-flight sync with no run row; a provider failure still returns 201 with `status: 'failure'` and error text, and a disconnected mailbox records the "connect the mailbox on the Sync page" guidance; GET `/api/calendar-sync/runs` returns runs newest-first and history survives an app rebuild against the same DB; GET `/api/sync/status` reports `{ running: true }` mid-sync and `{ running: false }` after
- [X] T009 [P] [US1] Write failing integration tests (US1 slice) in `tests/integration/calendar-sync.test.ts` (MCP client harness from `tests/integration/helpers/`): after a web-triggered sync of 2026-08-01..2026-08-31 over a fake seeded with two in-range events and one out-of-range event, `list-events` for the range returns exactly the two in-range events in chronological order by `startAt` with the out-of-range event absent; `list-events` validation errors for missing/inverted range; while a gated sync is in flight, a colliding `sync-emails` call returns "A sync is already running" (cross-kind single-flight, FR-006)
- [X] T010 [P] [US1] Write failing component tests: extend `tests/component/sync-page.test.ts` with the calendar section (date pickers prefilled today−30/today+30 on every visit, Sync button, `calendar-sync-history-empty` "No syncs yet" empty state before any run, in-progress indicator + both Sync buttons disabled while a sync runs and while `GET /api/sync/status` reports running, result line with new/updated counts, newest-first history rows showing when/range/source/status/counts/error, email section prefill and history unchanged) and update `tests/component/app-shell.test.ts` for the nav rename "Email Sync" → "Sync"

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `GraphCalendarProvider` in `src/server/services/calendar/graph-provider.ts` (calendarView + paging + header/parse behavior until T007 passes) and add `'Calendars.Read'` to the `SCOPES` constant in `src/server/services/email/graph-auth.ts` (research R4)
- [X] T012 [P] [US1] Implement the sync engine's ingest path — `runCalendarSync` in `src/server/services/calendar/sync.ts`: compute the window via the shared `computeSyncWindow`, iterate provider batches, find-or-create `email_addresses` rows by `lower(value)` (mirroring `findOrCreateAddressId`), insert each event with its participants (organizer + attendees with role/response/displayName) in its own transaction, count new events, and return `{ status: 'complete' | 'interrupted', newCount, updatedCount, error? }` like the email engine (refresh/cancellation semantics land in US5)
- [X] T013 [US1] Implement calendar queries in `src/server/services/calendar/queries.ts`: `listEvents(startDate, endDate)` returning overlap-matched events ascending by `startAt` (ties by `id`) as `EventSummary` rows, plus run-history queries `listCalendarSyncRuns()` (newest-first: `ran_at` DESC, `id` DESC) and `recordCalendarSyncRun(...)`
- [X] T014 [US1] Extend `SyncCoordinator` in `src/server/services/email/sync-coordinator.ts` with `triggerCalendar(...)` (runs `runCalendarSync`, maps the engine result to a success/failure `calendar_sync_runs` row with error text) and `isRunning()`, both sharing the existing private `running` flag so email and calendar syncs from any entry point are mutually exclusive (research R7)
- [X] T015 [US1] Create routes `src/server/routes/calendar-sync.ts` (GET `/api/calendar-sync/runs`, POST `/api/calendar-sync/runs` with handler-level validation so 400s record no run row, 409 on collision) and `src/server/routes/sync-status.ts` (GET `/api/sync/status` → `{ running: SyncCoordinator.isRunning() }`) per contracts/http-api.md
- [X] T016 [US1] Register the `list-events` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md (required `startDate`/`endDate` validated in the handler with the shared error messages, `EventSummary[]` in `structuredContent`, cancelled events included and flagged)
- [X] T017 [US1] Wire the calendar provider: `src/server/index.ts` constructs `GraphCalendarProvider` (injected `getAccessToken`) or `FakeCalendarProvider` when `MAIL_PROVIDER=fake`, seeded from a new `src/server/services/calendar/dev-seed.ts` (seed covering quickstart scenario 1: a few in-range events incl. a series and a fully-populated event); `src/server/app.ts` accepts the calendar provider and passes it to the coordinator, routes, and MCP context — T008/T009 integration tests go green here
- [ ] T018 [P] [US1] Implement the calendar section in `src/client/pages/SyncPage.vue` mirroring the email section with `calendar-`-prefixed test ids: two `NDatePicker`s prefilled every visit to today−30/today+30, Sync button POSTing `/api/calendar-sync/runs`, in-progress indicator, result line, `NEmpty` "No syncs yet" empty state, newest-first history list (when/range/source/status/counts/error), 3-second `GET /api/sync/status` polling disabling both sections' Sync buttons plus immediate local disable on submit — email section markup/prefill/history untouched (research R13)
- [ ] T019 [P] [US1] Rename the nav link and page heading "Email Sync" → "Sync" in `src/client/App.vue` (and the page title in `src/client/pages/SyncPage.vue` if it carries one)

**Checkpoint**: MVP — first sync works end-to-end from the Sync page with persisted history, the single-flight guard spans both kinds, and agents can list synced events. All T007–T010 tests green.

---

## Phase 4: User Story 2 - Agents read complete event details (Priority: P1)

**Goal**: The `get-event` MCP tool returns the full FR-008 detail set for one stored event, proving every detail field round-trips from the source calendar through storage.

**Independent Test**: Seed one event with every detail populated (organizer, required/optional attendees with responses, location, join link, category, body), sync it, fetch it via `get-event`, and verify every field.

### Tests for User Story 2 (write first, confirm they fail)

- [ ] T020 [US2] Write failing integration tests in `tests/integration/calendar-read-tools.test.ts` (real app + fake provider + MCP client): seed the US2 scenario-1 event ("Pricing review", organizer Sam Rivera, required Tyler Satre accepted, optional ana.alvarez no response, Conference Room B, Teams join link, "Orange category", agenda body), sync, then `get-event` returns subject, `startAt`/`endAt` epoch-ms values matching 2026-08-14 10:00–10:30, `isAllDay: false`, `isCancelled: false`, location, `bodyText`, organizer-first participants with address/displayName/role/responseStatus, `onlineMeetingUrl`, `categories: ['Orange category']`, `webLink`, `seriesId: null`; `get-event` with an unknown id returns tool error `Event <id> not found`; also cover the edge cases: an attendee with no display name stores `displayName: ''`, and a solo appointment syncs with organizer only

### Implementation for User Story 2

- [ ] T021 [US2] Implement `getEvent(eventId)` in `src/server/services/calendar/queries.ts` returning the full detail shape of contracts/mcp-tools.md — event fields plus participants (organizer first, then stored order) each joined to its linked person (`person: { id, name } | null`)
- [ ] T022 [US2] Register the `get-event` MCP tool in `src/server/mcp/tools.ts` (`eventId` positive-int input, not-found tool error, full output schema per contracts/mcp-tools.md) — T020 goes green

**Checkpoint**: Agents retrieve complete event detail; US1 and US2 both independently verifiable.

---

## Phase 5: User Story 3 - Events connect to tracked people (Priority: P2)

**Goal**: Participant addresses share the existing `email_addresses` records so events link to people case-insensitively, `events-for-person` answers "when did I meet X?", and adding an address to a person retroactively connects already-synced events with no re-sync.

**Independent Test**: Sync an event whose organizer address belongs to an existing person (different case) and whose attendee address belongs to no one; verify the organizer's person link on `get-event`, the unlinked attendee, `events-for-person` output, and that adding the attendee address to a person immediately connects the event.

### Tests for User Story 3 (write first, confirm they fail)

- [ ] T023 [US3] Write failing integration tests in `tests/integration/calendar-read-tools.test.ts`: with person "Sam Rivera" owning sam.rivera@example.com and an event organized by "Sam.Rivera@example.com" (case differs) with unlinked optional attendee ana.alvarez@example.com — `get-event` shows the organizer participant linked to Sam Rivera and the attendee with `person: null`; `events-for-person` for Sam returns the event newest-first with `addresses: [{ address, role: 'organizer', displayName, responseStatus }]`; adding ana.alvarez@example.com to person "Ana Alvarez" via the existing contact-entry flow immediately makes `events-for-person` return the event for Ana with role optional and no re-sync; `events-for-person` paginates with `limit`/`cursor` (mirroring `emails-for-person`), errors `Person <id> not found` and `Invalid cursor`, and includes cancelled events flagged; removing a person's address that only calendar events reference unlinks the address (`person_id` → NULL) rather than deleting it

### Implementation for User Story 3

- [ ] T024 [US3] Implement `eventsForPerson(personId, limit, cursor)` in `src/server/services/calendar/queries.ts` — events where any of the person's linked addresses appears as any participant role, newest-first by `startAt` (ties `id` DESC), keyset pagination via the existing `encodeCursor`/`decodeCursor`, each event carrying the person's matching `addresses` array per contracts/mcp-tools.md
- [ ] T025 [US3] Register the `events-for-person` MCP tool in `src/server/mcp/tools.ts` (`personId`, `limit` 1–200 default 50, optional `cursor`; person-not-found and invalid-cursor tool errors; `nextCursor` in output)
- [ ] T026 [US3] Extend `isEmailAddressReferenced` in `src/server/services/contact-entries.ts` to also check `calendar_event_participants`, so removing or editing an address that events reference unlinks instead of deletes — T023 goes green

**Checkpoint**: The CRM join works — events reach people through shared address records, retroactive linking included.

---

## Phase 6: User Story 4 - Recurring meetings stored as linked occurrences (Priority: P2)

**Goal**: Recurring series sync as individual occurrence rows sharing a `seriesId`, one-offs carry none.

**Independent Test**: Seed a weekly series (5 Monday occurrences in August 2026) plus a one-off, sync the month, verify 6 new events, per-occurrence dates, the shared series identifier, and its absence on the one-off.

### Tests for User Story 4 (write first, confirm they fail)

- [ ] T027 [US4] Write failing integration tests in `tests/integration/calendar-sync.test.ts`: fake seeded with weekly "Team standup" occurrences (2026-08-03/10/17/24/31, each its own event id sharing a `seriesMasterId`) plus one-off "Pricing review" 2026-08-14; syncing 2026-08-01..2026-08-31 reports 6 new; `get-event` on two different standup occurrences returns the same non-null `seriesId` while "Pricing review" returns `seriesId: null`; an individually modified occurrence (moved time, changed location) syncs with its exceptional details while keeping its `seriesId` (moved-occurrence edge case)

### Implementation for User Story 4

- [ ] T028 [US4] Ensure `seriesMasterId` flows provider → engine → storage → every read tool as `seriesId`: add a series-seeding helper to `src/server/services/calendar/fake-provider.ts` (expand a weekly rule into per-occurrence `SeedEvent`s with a shared `seriesMasterId`) and fix any gap in `src/server/services/calendar/sync.ts` / `queries.ts` surfaced by T027 — T027 goes green

**Checkpoint**: Recurring meetings behave as first-class per-occurrence events with series linkage.

---

## Phase 7: User Story 5 - Re-sync refreshes events and preserves history (Priority: P2)

**Goal**: Re-syncing refreshes stored events in place (0 duplicates, exact new/updated counts), marks in-range disappeared or cancelled events cancelled, never deletes, and never touches events outside the synced range.

**Independent Test**: Sync an event, mutate it (and remove another) in the fake calendar, re-sync the same range, verify counts, refreshed fields, the cancelled flag, no duplicates, and out-of-range events untouched.

### Tests for User Story 5 (write first, confirm they fail)

- [ ] T029 [P] [US5] Write failing unit tests in `tests/unit/calendar-refresh-rules.test.ts` for the R9 semantics: identical incoming event → not counted, row untouched; any changed field or participant difference (e.g. response status flip) → counted updated, participants delete-and-reinserted in the event's transaction; stored event overlapping the window but absent from the fetched id set → marked cancelled and counted updated (only if not already cancelled); fetched with `isCancelled: true` → marked cancelled; previously-cancelled event reappearing un-cancelled → refreshed to `is_cancelled = 0`; stored events outside the window → never touched; nothing is ever deleted
- [ ] T030 [P] [US5] Write failing integration tests in `tests/integration/calendar-sync.test.ts`: US5 scenario 1 — after mutating the fake ("Pricing review" moved to 2026-08-15 14:00–14:30, "Room 4", Ana accepted), re-sync reports 0 new / 1 updated, `get-event` shows the new start/end/location/response, and `list-events` returns exactly one "Pricing review"; US5 scenario 2 — removing the 2026-08-17 standup occurrence from the fake then re-syncing leaves it stored and flagged cancelled in `list-events` with the other occurrences unchanged; the moved-out-of-range edge case — an event moved beyond the range is marked cancelled by a range-bounded sync, then refreshed to active by a later sync covering its new date

### Implementation for User Story 5

- [ ] T031 [US5] Implement refresh and cancellation in `src/server/services/calendar/sync.ts` per research R9: upsert by `graph_event_id` comparing the full normalized representation (event fields + participant set) to decide new/updated/untouched, delete-and-reinsert participants on update inside the event's transaction, then the post-ingest cancellation pass over stored events overlapping the window (absent-from-fetch or fetched-cancelled → `is_cancelled = 1`, counted updated when newly cancelled) — T029 and T030 go green

**Checkpoint**: The store survives calendar churn — refresh without duplicates, cancellation without deletion.

---

## Phase 8: User Story 6 - Agents trigger calendar sync via MCP (Priority: P2)

**Goal**: The `sync-calendar` MCP tool runs a sync identically to the web path, recorded with source "MCP"; validation failures sync nothing and record nothing.

**Independent Test**: Call `sync-calendar` with a valid range, with no range, and with start after end; verify the successful run's history entry (source "MCP", counts) and that both failures leave no side effects.

### Tests for User Story 6 (write first, confirm they fail)

- [ ] T032 [US6] Write failing integration tests in `tests/integration/calendar-sync.test.ts`: `sync-calendar` with 2026-08-01..2026-08-31 returns `{ status: 'complete', newCount, updatedCount }` and `GET /api/calendar-sync/runs` shows the run with source `'mcp'` and matching counts; with no dates → tool error "A start and end date are required" wording per contracts/mcp-tools.md, nothing synced, run count unchanged; with start 2026-08-20 / end 2026-08-05 → the invalid-range tool error, no side effects; while a gated sync is in flight, `sync-calendar` returns "A sync is already running"; a fully-failing run (provider `failImmediately`) returns a tool error ending "connect the mailbox on the Sync page." and records a `failure` history row

### Implementation for User Story 6

- [ ] T033 [US6] Register the `sync-calendar` MCP tool in `src/server/mcp/tools.ts` mirroring `sync-emails`: optional-in-schema `startDate`/`endDate` validated in the handler, `SyncCoordinator.triggerCalendar` with source `'mcp'`, `newCount`/`updatedCount` output vocabulary (deliberately not `syncedCount`), tool errors per contracts/mcp-tools.md with no history row on validation failure — T032 goes green

**Checkpoint**: Agents self-serve fresh calendar data through the same engine and history as the web path.

---

## Phase 9: User Story 7 - Unlinked-address discovery spans mail and calendar (Priority: P3)

**Goal**: `list-unlinked-addresses` counts calendar participation — calendar-only addresses join the pool, every row shows message and event counts, resource-only addresses are excluded, ordering and linked-address exclusion unchanged.

**Independent Test**: Seed mail and events with overlapping and disjoint address sets, one linked address and one resource-only address among them; verify rows, both counts, ordering, and both exclusions.

### Tests for User Story 7 (write first, confirm they fail)

- [ ] T034 [US7] Write failing integration tests extending `tests/integration/mcp-unlinked-addresses.test.ts` with the US7 fixture: jordan.smith@example.com in 2 messages + 3 events (display name "Jordan Smith"), news@example.com in 1 message + 0 events, morgan.lee@example.com in 0 messages + 1 event, sam.rivera@example.com linked to a person and attending events, plus a conference-room address appearing only in the `resource` role — the tool returns exactly jordan (2/3), news (1/0), morgan (0/1) in that order with both counts per row, `lastMessageAt: null` for morgan (calendar-only), display names drawn from events when mail has none, sam.rivera absent (linked), the room address absent (resource-only), and an address seen as resource on one event but required on another listed normally

### Implementation for User Story 7

- [ ] T035 [US7] Extend `listUnlinkedAddresses` in `src/server/services/email/queries.ts` per research R11: qualify unlinked addresses seen in mail OR as non-resource event participants, add `eventCount` (`COUNT(DISTINCT event_id)` over non-resource rows), make `lastMessageAt` nullable, pick the most recent non-empty display name across mail (`sent_at`) and events (`start_at`), keep ordering `messageCount DESC` → `lastMessageAt DESC` (nulls last) → `address ASC`
- [ ] T036 [US7] Update the `list-unlinked-addresses` tool's output schema and summary text in `src/server/mcp/tools.ts` to include `eventCount` and nullable `lastMessageAt` per contracts/mcp-tools.md — T034 goes green

**Checkpoint**: All seven stories implemented and independently tested.

---

## Phase 10: Polish & Verification

**Purpose**: The evidence gate — full-suite verification, browser evidence, independent confirmation (constitution Principle III).

- [ ] T037 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` plus every targeted suite listed in quickstart.md, and fix anything red
- [ ] T038 Launch the dev server with `MAIL_PROVIDER=fake npm run dev` (ports 3019/5119) and dispatch the `browser-tester` agent to execute quickstart scenario 1 (US1 acceptance scenarios 1–2: prefill, empty state, sync run, in-progress disable, result counts, history persistence across reload, email section unchanged, nav renamed) capturing screenshots and results to `docs/evidence/019-calendar-sync/`
- [ ] T039 Dispatch the `verifier` agent to independently confirm every acceptance criterion in spec.md has a passing automated check and surface-appropriate evidence (browser evidence for US1 UI criteria, recorded test output for US2–US7 MCP/API criteria), re-running checks itself; fix and re-verify anything it rejects

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. T002 → T003 (schema before migration); T004 → T005 → T006 (types before fake's failing tests before fake). **Blocks all user stories** — every story's tests need the schema and the fake provider.
- **US1 (Phase 3)**: Depends on Foundational. Test tasks T007–T010 are parallel; T011/T012 are parallel after their tests exist; T013 → T014 → T015 (queries before coordinator before routes); T016 needs T013; T017 (wiring) needs T011–T016 and turns the integration tests green; T018/T019 are parallel after T015.
- **US2 (Phase 4)**: Depends on US1 (sync path + MCP registration patterns). T020 → T021 → T022.
- **US3 (Phase 5)**: Depends on US2 (extends `calendar-read-tools.test.ts` and `queries.ts`). T023 → T024 → T025 → T026.
- **US4 (Phase 6)**: Depends on US1 (sync + list/get tools for assertions). T027 → T028. Can run in parallel with US3 (different files except the shared fake helper).
- **US5 (Phase 7)**: Depends on US1 (extends `sync.ts`) and benefits from US4's series fixtures. T029/T030 parallel → T031.
- **US6 (Phase 8)**: Depends on US1 (coordinator, engine) and US5 (counts asserted include updated). T032 → T033.
- **US7 (Phase 9)**: Depends on Foundational + US1's ingest (participants stored); independent of US2–US6. T034 → T035 → T036.
- **Polish (Phase 10)**: Depends on all implemented stories. T037 → T038 → T039.

### Within Each User Story

Failing tests first (red), implementation second (green) — non-negotiable. Queries before tools, engine before routes, server before UI.

### Parallel Opportunities

- Foundational: T004 alongside T002/T003.
- US1 tests: T007, T008, T009, T010 all at once (four different test files).
- US1 implementation: T011 and T012 together (graph-provider.ts vs sync.ts); T018 and T019 together (SyncPage.vue vs App.vue).
- US5 tests: T029 and T030 together.
- Cross-story: US3, US4, and US7 touch mostly disjoint files once US1/US2 land and could be parallelized across sessions, at the cost of merge coordination in `tools.ts` and the shared test files — sequential priority order is the default.

---

## Parallel Example: User Story 1

```bash
# After Phase 2, write all four failing test suites concurrently:
Task: "Failing unit tests for GraphCalendarProvider in tests/unit/calendar-graph-provider.test.ts"        # T007
Task: "Failing HTTP integration tests in tests/integration/calendar-sync-runs.test.ts"                    # T008
Task: "Failing MCP integration tests (US1 slice) in tests/integration/calendar-sync.test.ts"              # T009
Task: "Failing component tests in tests/component/sync-page.test.ts + app-shell.test.ts"                  # T010

# Then implement the two independent server files concurrently:
Task: "GraphCalendarProvider in src/server/services/calendar/graph-provider.ts + SCOPES"                  # T011
Task: "runCalendarSync ingest path in src/server/services/calendar/sync.ts"                               # T012
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline gate) → Phase 2 (schema, migration, provider contract, fake).
2. Phase 3 completely: red tests T007–T010, then green through T019.
3. **STOP and VALIDATE**: run the T007–T010 suites plus quickstart scenario 1 manually — a working first sync with history is the demoable MVP.

### Incremental Delivery

Each subsequent phase is one deployable increment: US2 (full detail reads) → US3 (people linking) → US4 (series) → US5 (refresh/cancellation) → US6 (agent sync) → US7 (discovery). After every phase the full gate must stay green; stopping after any checkpoint leaves a coherent, shippable feature subset.

### Notes

- All server tests run against the injected `FakeCalendarProvider` (research R5); no test touches Microsoft Graph.
- `drizzle/0002_*.sql` is immutable once merged — any later schema fix is a new migration.
- FR-014 is absolute: no Graph write calls anywhere in this feature.
- Commit after each red→green cycle or logical group, Conventional Commits style.
