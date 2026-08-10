# Tasks: Email Sync Improvements

**Input**: Design documents from `/specs/012-email-sync-improvements/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, contracts/mcp-tools.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires a failing test before the code that makes it pass. Every implementation task below is preceded by its red test task; run the test, watch it fail, then implement.

**Organization**: Tasks are grouped by user story (US1 P1 → US4 P4) so each story is an independently testable increment. Research decisions are referenced as R# (research.md); functional requirements as FR-### (spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4, mapping to spec.md user stories
- All paths are relative to the worktree root `/Users/tyler/work-helper/.claude/worktrees/tidy-sparking-kahan`

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline in this worktree before any change.

- [X] T001 Run the full verification gate `npm run lint && npm run typecheck && npm test && npm run build` from the worktree root and confirm all four pass before touching code (quickstart.md "Full verification gate")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema for all four stories (one in-place edit + one dev-DB reset, per dev-phase data policy) and the widened `SyncResult` counts that both the run-history recording (US1) and refresh counting (US4) depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write failing integration tests in tests/integration/db.test.ts (extend) that insert and read back: a `sync_runs` row with all columns of data-model.md (ranAt, startDate, endDate, source, status, newCount, updatedCount, error); an `email_attachments` row (messageId FK, name, nullable contentType, sizeBytes); an `email_messages` row carrying the new metadata columns (free-text sourceFolder e.g. `'Projects'`, receivedAt, isRead, importance, flagStatus, categories JSON, webLink, internetMessageId); and an `email_participants` row with displayName — run them and confirm they fail
- [X] T003 Implement the schema changes in src/server/db/schema.ts per data-model.md: new `sync_runs` table (+ `sync_runs_ran_at` index), new `email_attachments` table (+ `email_attachments_message_id` index), extend `email_messages` (sourceFolder enum → text, sentAt redefined as always-sent-time per R5, new receivedAt/isRead/importance/flagStatus/categories/webLink/internetMessageId with the defaults from data-model.md), add `email_participants.displayName` (NOT NULL DEFAULT `''`); delete/recreate the dev database (no migration files, dev-phase policy); T002 tests pass
- [X] T004 Write failing tests for the widened sync result: extend tests/integration/email-sync.test.ts to expect `runSync` returning `{ status, newCount, updatedCount, error? }` (existing scenarios: newCount equals today's syncedCount, updatedCount 0) and extend its `sync-emails` MCP tool assertions to expect the additive `updatedCount` output field alongside the unchanged `status`/`syncedCount`/`error` (contracts/mcp-tools.md, R8) — run and confirm failure
- [X] T005 Implement the `SyncResult` shape `{ status, newCount, updatedCount, error? }` in src/server/services/email/sync.ts (rename syncedCount → newCount internally; updatedCount hardcoded 0 until US4) and map the `sync-emails` tool output in src/server/mcp/tools.ts (`syncedCount` = newCount, additive `updatedCount`, input schema and validation untouched per FR-014); T004 tests pass

**Checkpoint**: Schema and result shape ready — user story phases can begin.

---

## Phase 3: User Story 1 - Trigger a sync from the web (Priority: P1) 🎯 MVP

**Goal**: An Email Sync page (nav link, date pickers prefilled since the last successful run, single-flight Sync button, busy state, result, persistent run history) plus the shared `SyncCoordinator` that records every run — web- and MCP-triggered — in `sync_runs`.

**Independent Test**: Against a seeded `FakeMailProvider` app, open the page, run a sync, and check the result, prefill on return, validation, failure display, and run history (quickstart scenarios US1-1 … US1-6 and the already-running / empty-range edge cases) — no capture-field work needed.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T006 [P] [US1] Write failing integration tests in tests/integration/email-sync-runs.test.ts (new) against a real Fastify app + in-memory/file SQLite + FakeMailProvider covering contracts/http-api.md: GET /api/email-sync/runs returns `{ runs: [] }` when empty; POST with a valid range returns 201 with a `SyncRunView` (status success, source web, counts) and the run is listed newest-first (`ranAt` DESC, `id` DESC) by GET — including after rebuilding the app against the same DB file (FR-007 restart survival); POST with missing dates or start>end returns 400 with the contract's `{ error: { message } }` and records no row (FR-004); a run against a failing provider returns 201 with status failure + error text and the row persists (FR-008); a POST while a run is in flight returns 409 "A sync is already running" and records nothing (FR-006); a range containing no messages returns 201 success with 0 new / 0 updated and a history row (edge case); and a provider that fails partway through (after storing some messages) yields 201 with status failure, error text, and the partial newCount in the history row, after which a later overlapping POST stores the remaining messages with no duplicates (FR-008, mid-run-failure edge case)
- [X] T007 [P] [US1] Extend tests/integration/email-sync.test.ts with failing `sync-emails` MCP tool assertions: an executed tool run inserts a `sync_runs` row with source `'mcp'` and its counts (US1 scenario 6, FR-007); a tool call arriving while a sync is active returns a tool error "A sync is already running" and records nothing (FR-006); a mailbox-unreachable tool failure keeps its existing tool-error response and now also records a `failure` run with the error text (contracts/mcp-tools.md behavior deltas)
- [X] T008 [P] [US1] Write failing component tests in tests/component/sync-page.test.ts (new, jsdom + @testing-library/vue) for SyncPage.vue: prefill with no runs = start 30 days before today, end today (FR-003); prefill with a newest successful run = its endDate → today (US1 scenario 3); inline validation messages for missing dates and start>end with no POST fired (FR-004); Sync button disabled + in-progress indicator while the POST is pending (FR-005); success result (new/updated counts) and failure result (error text) rendered from the returned run; run history list rendered newest-first with when/range/source/status/counts; styled "No syncs yet" empty state (FR-002)
- [X] T009 [P] [US1] Extend tests/component/app-shell.test.ts with failing assertions: the top nav includes an "Email Sync" link routing to /sync, marked active (same `aria-current` pattern as Board/People/Tags) while on it (FR-001)

### Implementation for User Story 1

- [X] T010 [US1] Implement `SyncCoordinator` in src/server/services/email/sync-coordinator.ts (new) per R4: in-process `running` flag; `trigger({ startDate, endDate, source })` rejects with an already-running error while set (recording nothing), validates via the existing `computeSyncWindow` (validation failures record nothing), otherwise runs the sync and inserts exactly one `sync_runs` row on completion — status success, or failure with error text and partial counts (missing/unreachable mailbox and interruptions included); makes T007's coordinator-level assertions pass
- [X] T011 [P] [US1] Add `listSyncRuns` to src/server/services/email/queries.ts returning all runs newest-first (`ranAt` DESC, `id` DESC) shaped as the contract's `SyncRunView`
- [X] T012 [US1] Implement src/server/routes/email-sync.ts (new) per contracts/http-api.md — GET /api/email-sync/runs → `{ runs }`; POST /api/email-sync/runs → 201 with the recorded run (success or failure), 400 on validation rejection, 409 on already-running, app-wide `{ error: { message } }` shape — and register the routes plus construct/decorate the shared `SyncCoordinator` in src/server/app.ts, passing it into the MCP tools context; T006 tests pass
- [X] T013 [US1] Reroute the `sync-emails` tool through the shared coordinator with source `'mcp'` in src/server/mcp/tools.ts — input schema, validation messages, and date semantics byte-identical (FR-014); already-running → tool error, executed runs (success and failure) recorded (R8); T007 tests pass
- [X] T014 [P] [US1] Add the `/sync` route rendering SyncPage.vue in src/client/router.ts and the "Email Sync" nav link with active-section handling in src/client/App.vue (R11); T009 tests pass
- [X] T015 [US1] Implement src/client/pages/SyncPage.vue (new) per R11: two naive-ui `NDatePicker` fields handling dates as `YYYY-MM-DD` strings at the API boundary, prefill derived client-side from GET runs (newest success run's endDate, else today−30; end = today), inline validation before POST, `NButton` with `loading` during the pending POST, result display from the returned run, run history list with when/range/source/status/counts/error and a styled "No syncs yet" empty state; T008 tests pass
- [X] T016 [US1] Run the US1 slices and the full suite green: `npx vitest run tests/integration/email-sync-runs.test.ts tests/integration/email-sync.test.ts tests/component/sync-page.test.ts tests/component/app-shell.test.ts` then `npm test`

**Checkpoint**: US1 fully functional — sync is triggerable from the web with persistent history. MVP deliverable.

---

## Phase 4: User Story 2 - Capture the full picture of each message (Priority: P2)

**Goal**: Sync stores the full FR-009 metadata (display names, both timestamps, read state, importance, flag, categories, attachment metadata, folder display name, Outlook web link, internet message ID) and the MCP read tools expose it, including conversation-level unread/attachment indicators and participants.

**Independent Test**: Sync a seeded message exercising every captured field (via the MCP sync tool or the coordinator directly) and fetch it through get-conversation / list-conversations / emails-for-person — no Sync page involvement (quickstart US2-1, US2-2).

### Tests for User Story 2 (write first, confirm they fail)

- [X] T017 [P] [US2] Extend tests/integration/helpers/fake-mail-provider.ts so seeded messages can carry the full metadata: recipient/sender display names (`{ address, name }`), independent sentDateTime and receivedDateTime, isRead, importance, flagStatus, categories, hasAttachments, webLink, internetMessageId, and per-message attachment metadata served via `fetchAttachmentMetadata` (R3) — defaults keeping every existing seed valid
- [X] T018 [P] [US2] Write failing integration tests in tests/integration/email-sync.test.ts (extend): syncing the seeded "Quote attached" message (US2 scenario 1 — Sam Rivera, sent 09:00 / received 09:01, unread, importance high, flagged, category "Orange category", attachment quote.pdf PDF 52 KB) stores every FR-009 field — participant displayNames on the participant rows, distinct sentAt/receivedAt, isRead false, importance high, flagStatus flagged, categories, an `email_attachments` row (name/contentType/sizeBytes, no contents), sourceFolder `'Inbox'` display name, webLink, internetMessageId; and a message with no attachments, normal importance, no flag, no categories, and an address-only sender syncs cleanly with empty/default fields (FR-011)
- [X] T019 [P] [US2] Write failing integration tests in tests/integration/email-read-tools.test.ts and tests/integration/mcp-read-tools.test.ts (extend) per contracts/mcp-tools.md: `get-conversation` messages carry receivedAt, free-string sourceFolder, isRead, importance, flagStatus, categories, webLink, internetMessageId, attachments[], and participants with displayName; `emails-for-person` messages carry the same additive fields and addresses gain displayName; `list-conversations` entries carry hasUnread, hasAttachments, and the distinct participants array with person links (FR-010, R10, US2 scenario 2)
- [X] T020 [P] [US2] Extend tests/unit/email-graph-provider.test.ts with failing assertions: the message list `$select` includes the R1 properties (isRead, importance, flag, categories, hasAttachments, webLink, internetMessageId, receivedDateTime, sentDateTime); recipient mapping keeps `emailAddress.name` (empty string when absent); `fetchAttachmentMetadata` issues `GET /me/messages/{id}/attachments?$select=name,contentType,size` (never contentBytes) and maps nullable contentType

### Implementation for User Story 2

- [X] T021 [US2] Extend src/server/services/email/provider.ts: `MailRecipient { address, name }`, `MailMessage` gains isRead/importance/flagStatus/categories/hasAttachments/webLink/internetMessageId (data-model.md provider contract), `MailAttachmentMeta`, and `fetchAttachmentMetadata(messageId)` on `MailProvider`
- [X] T022 [US2] Extend src/server/services/email/graph-provider.ts: widen the list `$select` per R1, map recipient names and all new fields, implement `fetchAttachmentMetadata` per R3; T020 tests pass
- [X] T023 [US2] Extend `ingestMessage`/`runSync` in src/server/services/email/sync.ts to store the new metadata columns, write participant displayName on first-sync participant rows, and insert `email_attachments` rows (fetched only when hasAttachments, R3) — sentAt always `sentDateTime`, receivedAt always `receivedDateTime` (R5); T018 tests pass
- [X] T024 [US2] Extend src/server/services/email/queries.ts and the read-tool output schemas in src/server/mcp/tools.ts: per-message metadata + attachments + participant displayName in getConversation and emailsForPerson; derived hasUnread/hasAttachments plus the distinct participants array in listConversations (R10); T019 tests pass
- [X] T025 [US2] Run the US2 slices and the full suite green: `npx vitest run tests/integration/email-sync.test.ts tests/integration/email-read-tools.test.ts tests/integration/mcp-read-tools.test.ts tests/unit/email-graph-provider.test.ts` then `npm test`

**Checkpoint**: US1 and US2 both work — synced mail carries its full picture through the MCP read tools.

---

## Phase 5: User Story 3 - Sync all meaningful folders (Priority: P3)

**Goal**: Sync enumerates the whole folder tree, skips Junk/Deleted Items/Drafts subtrees, covers Archive and custom folders at any depth, and records each message's source folder display name.

**Independent Test**: Seed messages across Inbox, Archive, a custom "Projects" folder, Junk, Drafts, and Deleted Items; sync a covering range; assert 3 new with the right folder names and the excluded three absent (quickstart US3-1).

### Tests for User Story 3 (write first, confirm they fail)

- [X] T026 [P] [US3] Write failing unit tests in tests/unit/email-folder-pruning.test.ts (new) for the sync service's folder-exclusion policy (R2): flattening a `MailFolderNode` tree keeps Inbox, Sent Items, Archive, and custom folders at any nesting depth, and prunes `junkemail`/`deleteditems`/`drafts` nodes **with all their descendants**
- [X] T027 [P] [US3] Extend tests/integration/helpers/fake-mail-provider.ts with a folder tree: `listFolders()` returning `MailFolderNode[]` (well-known tags + custom folders, nestable), seeds addressable to a folder, and `fetchMessages` scoped to the requested folder id with the per-folder window field of R6
- [X] T028 [P] [US3] Write failing integration tests in tests/integration/email-sync.test.ts (extend) for US3 scenario 1: six seeded messages (Inbox "Hello", Archive "Board minutes", custom Projects "Site survey", Junk "You won a prize", Drafts "Half-written", Deleted Items "Old news"), one covering sync → result 3 new; get-conversation shows sourceFolder `'Inbox'` / `'Archive'` / `'Projects'`; the Junk/Drafts/Deleted Items messages appear nowhere in list-conversations (FR-012); plus excluded-folder messages stay excluded even with in-range dates (edge case)
- [X] T029 [P] [US3] Extend tests/unit/email-graph-provider.test.ts with failing assertions for R2/R6: `listFolders` resolves well-known ids via `GET /me/mailFolders/{well-known-name}?$select=id` for inbox/sentitems/archive/junkemail/deleteditems/drafts, enumerates via `GET /me/mailFolders?$top=100` + recursive `childFolders` requests honoring `@odata.nextLink` paging, and tags matching nodes; `fetchMessages` filters/orders by `sentDateTime` for the sentitems folder and `receivedDateTime` for every other folder

### Implementation for User Story 3

- [X] T030 [US3] Extend src/server/services/email/provider.ts with `WellKnownFolder`, `MailFolderNode`, `listFolders(): Promise<MailFolderNode[]>`, and the folder-parameterized `fetchMessages(folder: { id, wellKnown }, window)` signature (data-model.md provider contract)
- [X] T031 [US3] Implement Graph folder enumeration in src/server/services/email/graph-provider.ts per R2 (well-known id resolution, recursive paged tree walk, wellKnown tagging) and the per-folder window field per R6; T029 tests pass
- [X] T032 [US3] Extend src/server/services/email/sync.ts to list folders, prune excluded subtrees (the policy under unit test in T026 lives here, not in providers), iterate every remaining folder, and record each stored message's folder displayName as sourceFolder; T026 and T028 tests pass
- [X] T033 [US3] Run the US3 slices and the full suite green: `npx vitest run tests/unit/email-folder-pruning.test.ts tests/unit/email-graph-provider.test.ts tests/integration/email-sync.test.ts` then `npm test`

**Checkpoint**: US1–US3 work — filed and archived mail is no longer invisible.

---

## Phase 6: User Story 4 - Keep stored metadata fresh on re-sync (Priority: P4)

**Goal**: A run that finds an already-stored message refreshes its metadata to mailbox-current state (attachments replaced wholesale), never touches subject/body/participants, never duplicates, and counts it as updated.

**Independent Test**: Sync a message, mutate its read state and folder in the fake mailbox, re-sync an overlapping range, and check what changed, what didn't, and the 0 new / 1 updated counts (quickstart US4-1).

### Tests for User Story 4 (write first, confirm they fail)

- [ ] T034 [P] [US4] Write failing unit tests in tests/unit/email-refresh-rules.test.ts (new) for the refresh field rules (R7): the refreshed set is exactly sourceFolder, sentAt, receivedAt, isRead, importance, flagStatus, categories, webLink, internetMessageId + attachment rows; subject, bodyOriginal/bodyContentType/bodyText, conversationId, graphMessageId, createdAt, and participant rows are never written on refresh
- [ ] T035 [P] [US4] Write failing integration tests in tests/integration/email-sync.test.ts (extend) for US4 scenario 1 and FR-013: sync "Quote attached" unread in Inbox; mark it read and move it to Archive in the FakeMailProvider; re-sync an overlapping range → result 0 new / 1 updated, `sync-emails` tool output shows the updatedCount, stored row now isRead true + sourceFolder `'Archive'` while subject/body/participants/sentAt/receivedAt are byte-identical, conversation message count unchanged (no duplicate), attachment rows replaced wholesale; plus the overlapping-prefill edge: two runs over overlapping ranges store each message once (SC-004)
- [ ] T036 [US4] Implement refresh-on-existing in src/server/services/email/sync.ts `ingestMessage` per R7: on a `graphMessageId` hit, update the metadata columns to fetched values, delete-and-reinsert the message's email_attachments rows, leave the snapshot columns and participants untouched, and count the message as updated (every found already-stored message counts, changed or not); wire updatedCount through `runSync`'s result replacing the Phase 2 hardcoded 0; T034 and T035 tests pass
- [ ] T037 [US4] Run the US4 slices and the full suite green: `npx vitest run tests/unit/email-refresh-rules.test.ts tests/integration/email-sync.test.ts` then `npm test`

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish, Evidence & Verification

**Purpose**: Constitution Principle III — every acceptance criterion gets surface-appropriate evidence, independently confirmed.

- [ ] T038 Build the dev seeding path (confirmed absent — `FakeMailProvider` exists only under tests/integration/helpers and `npm run dev` has no fake/seed mode): make `npm run dev` (API :3012, UI :5112) able to serve the app against a seeded FakeMailProvider for the browser-evidence scenarios (e.g. an env flag selecting the fake provider + a seed module reusing the integration-test harness), including an unreachable-mailbox configuration for US1 scenario 5. May start any time after T016 — do not defer discovery of this work to Phase 7
- [ ] T039 Run the full verification gate `npm run lint && npm run typecheck && npm test && npm run build` and confirm all four pass (the Stop-hook gate enforces the same)
- [ ] T040 Dispatch the `browser-tester` agent against http://localhost:5112 to execute US1 acceptance scenarios 1–5 (nav + empty state, seeded run + history reload, prefill on return, validation rejections, failure display) and save screenshots + results to docs/evidence/email-sync-improvements/
- [ ] T041 Record automated-check output (vitest run logs for the mapped scenarios in quickstart.md's table) covering the MCP-only criteria — US1 scenario 6, US2-1/US2-2, US3-1, US4-1, and the already-running / empty-range / mid-run-partial-failure edge cases — into docs/evidence/email-sync-improvements/
- [ ] T042 Dispatch the `verifier` agent to independently re-run the gate and cross-check the evidence in docs/evidence/email-sync-improvements/ against every acceptance criterion and FR in spec.md before reporting the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. T002 → T003; T004 → T005. **Blocks all user stories** (schema + SyncResult shape).
- **US1 (Phase 3)**: Depends on Phase 2. Test tasks T006–T009 first (parallel); then T010 → T011/T012 → T013 (server chain), T014 → T015 (client chain, parallel with the server chain), T016 last.
- **US2 (Phase 4)**: Depends on Phase 2 (schema); independent of US1's page (uses the MCP/coordinator trigger). T017–T020 first (parallel); then T021 → T022/T023 → T024 → T025.
- **US3 (Phase 5)**: Depends on Phase 2 and on US2's provider/capture surface (T021–T023) since folder iteration feeds the same ingest path. T026–T029 first (parallel); then T030 → T031/T032 → T033.
- **US4 (Phase 6)**: Depends on US2 (the metadata being refreshed must be captured first). T034/T035 first (parallel); then T036 → T037.
- **Polish (Phase 7)**: Depends on all four stories, except T038 which may start any time after T016 (US1 complete) and should be tackled early since the dev seeding path must be built, not merely verified. T038 → T040; T039 anytime after T037; T042 strictly last.

### Story Independence Notes

- US1 is independently testable with today's two-folder, minimal-metadata sync — history, counts, and the page need nothing from US2–US4.
- US2 is independently testable through the MCP sync tool + read tools without the Sync page.
- US3 and US4 both build on US2's provider/ingest extensions (declared dependency, matching spec priority order) but each has its own isolated test.

### Parallel Opportunities

- Phase 3: T006, T007, T008, T009 together (four different test files); then T011 ∥ T014 and the client chain (T014–T015) ∥ the server chain (T010–T013).
- Phase 4: T017, T018, T019, T020 together (helper + three test files).
- Phase 5: T026, T027, T028, T029 together.
- Phase 6: T034 ∥ T035.
- Note: tests/integration/email-sync.test.ts and fake-mail-provider.ts are touched in multiple phases — parallelism applies within a phase, not across phases.

## Parallel Example: User Story 1

```bash
# Red first — launch all four US1 test tasks together (different files):
Task T006: failing integration tests in tests/integration/email-sync-runs.test.ts
Task T007: failing MCP sync-tool assertions in tests/integration/email-sync.test.ts
Task T008: failing component tests in tests/component/sync-page.test.ts
Task T009: failing nav assertions in tests/component/app-shell.test.ts

# Then green — server chain (T010 → T011/T012 → T013) in parallel with client chain (T014 → T015)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline) + Phase 2 (schema + SyncResult) — T001–T005.
2. Phase 3 (US1) — T006–T016.
3. **STOP and VALIDATE**: `npx vitest run tests/integration/email-sync-runs.test.ts tests/component/sync-page.test.ts tests/component/app-shell.test.ts`, then run the app and sync from the page. This alone delivers the core ask: sync without an MCP client, with visible history.

### Incremental Delivery

1. US1 → validate → MVP: web-triggered sync + run history.
2. US2 → validate → full metadata through the read tools.
3. US3 → validate → all meaningful folders covered.
4. US4 → validate → overlapping re-syncs keep metadata fresh.
5. Phase 7 evidence + verifier → PR.

Each story leaves the suite green and the app shippable; commit after each task or logical red→green pair (Conventional Commits).
