# Tasks: Email Sync

**Input**: Design documents from `/specs/007-email-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-email-tools.md, contracts/people-email-linking.md, quickstart.md

**Tests**: Included and mandatory — the constitution's Principle II (Test-First) requires a failing test before the code that makes it pass. Within every story, write the test tasks first, confirm they fail, then implement.

**Organization**: Tasks are grouped by user story (US1 sync, US2 read tools, US3 person linking) in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: New dependencies for Graph auth and body-text derivation

- [ ] T001 Install new dependencies: `npm install @azure/msal-node html-to-text` and `npm install -D @types/html-to-text`; confirm `npm run lint && npm run typecheck` still pass with the updated `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema restructure, migration squash, and the `MailProvider` test seam that every user story's tests depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The schema rename is a refactor under green — the existing People/contact-entries suites are the safety net and MUST pass at the end of this phase.

- [ ] T002 Restructure schema in `src/server/db/schema.ts` per data-model.md: rename `person_emails` → `email_addresses` with `person_id` now nullable (FK → people.id, `onDelete: 'set null'`), keeping the unique `lower(value)` index and the unique partial `(person_id) WHERE is_primary = 1` index; add `email_conversations` (unique `graph_conversation_id`), `email_messages` (unique `graph_message_id`; indexes on `(conversation_id, sent_at)` and `sent_at`; columns `source_folder`, `subject` default `''`, `body_original`, `body_content_type`, `body_text`, `sent_at`, `created_at`), and `email_participants` (unique `(message_id, address_id, role)`; index on `address_id`; `address_id` FK with no cascade)
- [ ] T003 Squash migrations per research R8: delete all files under `drizzle/` (SQL + `meta/`), regenerate a single fresh `0000_*` baseline with `npx drizzle-kit generate`, delete `tests/integration/migration-carry-over.test.ts`, and recreate dev DBs (`rm -f data/*.db`); `createDb`/`migrate()` in `src/server/db/index.ts` stays unchanged
- [ ] T004 Update all `person_emails` references to `email_addresses` across `src/server/services/contact-entries.ts`, `src/server/services/people.ts`, `src/server/routes/people.ts`, and any `src/shared` types — person email reads now filter `person_id = ?` so unlinked rows never surface; no behavior change yet (linking rules are US3). Gate: full existing suite green via `npm test`
- [ ] T005 [P] Define the mail seam in `src/server/services/email/provider.ts`: `MailFolder` (`'inbox' | 'sent'`), normalized `MailMessage` shape mirroring the Graph `$select` fields (id, conversationId, subject, body content + contentType, sentDateTime, receivedDateTime, from/to/cc/bcc recipients), and `MailProvider` interface `fetchMessages(folder, windowUtc): AsyncIterable<MailMessage[]>` per research R6
- [ ] T006 Add optional `mailProvider?: MailProvider` to the `buildApp` options in `src/server/app.ts` and thread it through to the MCP tool registration in `src/server/mcp/tools.ts` (tests inject the fake; `src/server/index.ts` wires the real one later in US1)
- [ ] T007 [P] Create `FakeMailProvider` in `tests/integration/helpers/fake-mail-provider.ts`: seeded in-memory messages with folder/timestamps/conversation ids/recipients, folder + UTC-window filtering, paged yields, and a configurable mid-pagination throw plus an immediate-failure mode to exercise FR-016 paths

**Checkpoint**: Schema restructured, baseline regenerated, existing suites green, test seam in place — user stories can begin

---

## Phase 3: User Story 1 - On-Demand Date-Range Sync (Priority: P1) 🎯 MVP

**Goal**: `sync-emails` MCP tool pulls Inbox + Sent messages for a local-timezone date range into permanent conversation-grouped snapshots — idempotent, interruption-safe, read-only toward the mailbox

**Independent Test**: Seed `FakeMailProvider` with messages inside/outside the range and across folders, call `sync-emails` through a real OAuth'd MCP client, and verify the reported count and stored set match exactly the in-range Inbox + Sent messages; re-run overlapping ranges and simulate mailbox deletion to verify idempotency and snapshot permanence (spec US1 Independent Test)

### Tests for User Story 1 (write first — confirm each fails before implementing) ⚠️

- [ ] T008 [P] [US1] Unit test in `tests/unit/email-sync-window.test.ts`: `YYYY-MM-DD` range → UTC window as whole days in the server's local timezone (start local midnight, exclusive end local midnight-after-end), endpoint-day inclusivity incl. the 23:30-local edge case, rejection of malformed dates and start-after-end (research R4; FR-001, FR-002). The suite pins an explicit non-UTC timezone (e.g. `TZ=America/Denver` via vitest env config, set before any date code loads) — on UTC CI the local-vs-UTC edge case is otherwise vacuous
- [ ] T009 [P] [US1] Unit test in `tests/unit/email-body-text.test.ts`: plain-text derivation — `text` bodies pass through as-is, `html` bodies convert via `html-to-text` (links inline, wrapping disabled), empty bodies stay empty (research R5; FR-003)
- [ ] T010 [P] [US1] Unit test in `tests/unit/email-graph-provider.test.ts` against stubbed `fetch` with Graph-shaped fixtures: URL building per folder (`mailFolders/{inbox|sentitems}/messages` with `$select`/`$filter` on `receivedDateTime` vs `sentDateTime`/`$orderby`/`$top=100`), `Prefer: IdType="ImmutableId"` on every request, `@odata.nextLink` following, GET-only, and mapping of auth/network failures to a clear connection error (research R2, R4; FR-015, FR-016)
- [ ] T011 [P] [US1] Integration test in `tests/integration/email-sync.test.ts` via real app + OAuth'd MCP client + `FakeMailProvider`: US1 scenarios 1–4 (range pull from Inbox+Sent only with junk/out-of-range excluded and reported count 3; overlapping re-run stores exactly the 1 new message with prior conversations unchanged; missing/partial range → validation error, nothing synced; mailbox deletion never alters the store), plus start-after-end rejection, empty-body/blank-subject storage, same-address-multiple-roles, a Sent message with a bcc recipient stored with role `bcc`, unreachable-mailbox error with store unchanged, and mid-run interruption returning `{ status: "interrupted", syncedCount }` with kept progress and a completing re-run (FR-001–FR-006, FR-015, FR-016; SC-001, SC-002, SC-005). Stored-set assertions go directly against the `email_conversations`/`email_messages`/`email_participants` tables — list-conversations does not exist until US2; the spec scenarios' list-conversations phrasing is re-verified through the real tool in T020

### Implementation for User Story 1

- [ ] T012 [US1] Implement exported helpers in `src/server/services/email/sync.ts`: local-day window calculation (makes T008 green) and body-text derivation via `html-to-text` (makes T009 green)
- [ ] T013 [US1] Implement the ingest pipeline in `src/server/services/email/sync.ts`: iterate provider pages per folder; per message one SQLite transaction — skip if `graph_message_id` exists, find-or-create conversation by `graph_conversation_id`, insert message snapshot (original body + derived `body_text`, folder-appropriate `sent_at`), find-or-create `email_addresses` by `lower(value)` never touching `person_id`, insert participants (exactly one `from`, skip empty addresses, dedupe per `(message, address, role)`); return `{ status, syncedCount, error? }` distinguishing complete / interrupted / failed-before-storing (research R10; FR-003–FR-006, FR-009, FR-010, FR-016)
- [ ] T014 [US1] Register the `sync-emails` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-email-tools.md: zod input (`startDate`/`endDate` required `YYYY-MM-DD`, end not before start), `structuredContent` output `{ status, syncedCount, error? }`, connection failures as `isError` pointing at `npm run mail:signin`, behind the existing bearer auth (FR-001, FR-005, FR-014, FR-016) — makes T011 green
- [ ] T015 [P] [US1] Implement `src/server/services/email/graph-auth.ts`: MSAL public client (authority `common`), device-code flow, `acquireTokenSilent` for sync-time tokens, file token-cache plugin at `MAIL_TOKEN_CACHE_PATH` (default `./data/mail-token-cache.json`), delegated `Mail.Read` + `offline_access`; silent failure surfaces as the "mailbox sign-in required — run npm run mail:signin" error (research R1)
- [ ] T016 [P] [US1] Implement `GraphMailProvider` in `src/server/services/email/graph-provider.ts`: native `fetch` against Graph REST v1.0 with an injected token getter, per research R2 request building and paging — makes T010 green
- [ ] T017 [US1] Wire the real provider in `src/server/index.ts`: construct `GraphMailProvider` from env (`MS_CLIENT_ID`, `MAIL_TOKEN_CACHE_PATH`) and pass it to `buildApp`; absent config yields the clear connection/sign-in error path rather than a crash
- [ ] T018 [P] [US1] Create `scripts/mail-signin.ts` (device-code sign-in CLI: prints verification URL + code, waits, writes the token cache) and add the `"mail:signin": "tsx scripts/mail-signin.ts"` script to `package.json` (research R1)

**Checkpoint**: `sync-emails` fully functional against the fake in tests and wired for Graph in real runs — MVP delivered

---

## Phase 4: User Story 2 - Browse Synced Email by Conversation (Priority: P2)

**Goal**: `list-conversations` (keyset-paged, newest activity first) and `get-conversation` (full thread, chronological, role-tagged participants with linked-person info)

**Independent Test**: After a seeded sync through `FakeMailProvider`, call `list-conversations` and verify ordering/counts/dates/subject derivation and exactly-once paging; call `get-conversation` and verify message order, plain-text bodies, and role tags against the seeded data (spec US2 Independent Test)

### Tests for User Story 2 (write first — confirm each fails before implementing) ⚠️

- [ ] T019 [P] [US2] Unit test in `tests/unit/email-cursor.test.ts`: opaque keyset cursor codec — base64 JSON round-trip of sort keys, strictly-after filtering semantics, invalid/corrupt cursor rejection (research R9; FR-007, FR-013)
- [ ] T020 [P] [US2] Integration test in `tests/integration/email-read-tools.test.ts` after seeded syncs: US2 scenarios 1–2 (ordering by latest message with "Lunch Thursday" before "Pricing question", message count 2 and latest date 2026-07-11 from the grouped Sent reply, thread subject from earliest message; get-conversation chronological messages with subject/sentAt/bodyText/sourceFolder and from/to/cc/bcc role tags — bcc via the T011-seeded Sent message — incl. `person: null` for unlinked addresses), re-verifying US1 scenario 1's listing assertion (exactly the expected conversations) through the real list-conversations tool; keyset paging with `limit`, `nextCursor` only while more remain, no duplicates ever and exactly-once for conversations unchanged during paging — under a mid-pagination sync insert, assert the bumped conversation is absent from the remaining pages of that sequence but first on a fresh listing (per the scoped contract guarantee); limit bounds 1–200 default 50; invalid cursor → tool error; unknown conversationId → "Conversation N not found" (FR-007, FR-008; SC-003)

### Implementation for User Story 2

- [ ] T021 [US2] Implement `src/server/services/email/queries.ts`: cursor codec (makes T019 green), `listConversations` (per-conversation aggregate of count / `max(sent_at)` / earliest-message subject, ordered `(latestMessageAt DESC, id DESC)`, keyset-filtered) and `getConversation` (messages `(sent_at ASC, id ASC)` with participants joined through `email_addresses` to `people` for `person` info) per data-model.md query shapes (FR-007, FR-008, FR-010)
- [ ] T022 [US2] Register `list-conversations` and `get-conversation` MCP tools in `src/server/mcp/tools.ts` per contracts/mcp-email-tools.md (zod inputs, `structuredContent` outputs, tool errors for invalid cursor / unknown conversation, existing auth gate) — makes T020 green (FR-014)

**Checkpoint**: Synced mail is readable — list, drill-down, bodies, roles all verified

---

## Phase 5: User Story 3 - Connect Synced Email to People (Priority: P3)

**Goal**: Shared address records link synced mail to tracked people — case-insensitive matching, People-page add links existing unlinked records, `emails-for-person` returns all correspondence across a person's addresses

**Independent Test**: Seed people with known addresses, sync messages involving matching / case-variant / unknown addresses via `FakeMailProvider`, then verify link status in `get-conversation`, the People-page add/uniqueness flows over REST, and `emails-for-person` results with per-address roles (spec US3 Independent Test)

### Tests for User Story 3 (write first — confirm each fails before implementing) ⚠️

- [ ] T023 [US3] Integration test in `tests/integration/email-person-linking.test.ts` via MCP client + People REST: US3 scenarios 1–4 (case-insensitive from-address linked to "Sam Rivera" while ana appears cc/unlinked; People-page add of an existing unlinked address returns 201, links the existing record keeping its stored casing, and `emails-for-person` immediately includes the previously synced mail with role "cc"; adding an address owned by another person → 409 "That email is already in use" with the record unchanged; two-address person gets both emails each identifying the involved address and its role), plus: edit-to-existing-unlinked-value → 409 (contracts/people-email-linking.md), remove of a participant-referenced address unlinks while an unreferenced one deletes, person delete applies the same rule, unlinked rows never in People API responses, `is_primary` set iff the person had no email, emails-for-person keyset paging exactly-once and unknown personId → "Person N not found" (FR-009–FR-013; SC-004)

### Implementation for User Story 3

- [ ] T024 [US3] Implement the linking rules in `src/server/services/contact-entries.ts` per research R7 / data-model behavior rules: add finds `lower(value)` — existing unlinked row → link it (set `person_id`, `is_primary` iff person has no other email), row linked to anyone → today's conflict, absent → insert linked; edit conflicts on any existing row (linked or unlinked); remove unlinks (`person_id = NULL`, `is_primary = false`) when any `email_participants` row references the address, deletes otherwise, with primary reassignment as today (FR-011, FR-012)
- [ ] T025 [US3] Apply the unlink-or-delete rule to person deletion in `src/server/services/people.ts` using the shared helper from T024, per contracts/people-email-linking.md (FR-011)
- [ ] T026 [P] [US3] Implement `emailsForPerson` in `src/server/services/email/queries.ts`: distinct messages having any participant whose address `person_id = ?`, ordered `(sent_at DESC, id DESC)` keyset-paged, each with conversationId/subject/sentAt and the matching `(address, role)` pairs restricted to that person's addresses (FR-013)
- [ ] T027 [US3] Register the `emails-for-person` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-email-tools.md (person lookup error, limit/cursor handling, empty result for a mail-less person) — makes T023 green (FR-013, FR-014)

**Checkpoint**: All three stories independently verified — the CRM connects correspondence to contacts

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full verification gate, browser evidence, and independent confirmation per the constitution's Definition of Done

- [ ] T028 Run the full quickstart automated validation: `npm run lint && npm run typecheck && npm test && npm run build`; confirm `tests/integration/migration-carry-over.test.ts` is gone (not failing) and all pre-existing suites still pass unchanged (quickstart; FR-011 "keeps working exactly as today", FR-014 auth gate)
- [ ] T029 Produce browser evidence via the `browser-tester` agent into `docs/evidence/email-sync/` per quickstart: US3-2 (People page adds an address that exists as an unlinked synced record → saves normally, screenshot), US3-3 ("already in use" rejection, screenshot), and the add/edit/remove/primary regression pass on a person's emails after the schema change
- [ ] T030 Run the `verifier` agent to independently re-check every acceptance criterion (automated suites + browser evidence) before reporting the feature done — constitution Principle III

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. Internal order: T002 → T003 → T004 (schema before regeneration before reference updates); T005 → T006 and T005 → T007 (seam before its consumers); T005/T007 can run parallel to T002–T004
- **US1 (Phase 3)**: Depends on Phase 2. Tests T008–T011 first (all [P]); then T012 → T013 → T014 (same-file chain in `sync.ts` then the tool); T015/T016/T018 are a parallel Graph track (T016 and T018 use T015's auth only via injection; T017 needs T015 + T016)
- **US2 (Phase 4)**: Depends on Phase 2 and on US1's ingest pipeline (its tests seed the store through `sync-emails` + `FakeMailProvider`, matching the spec's "Given the User Story 1 sync has completed"). T019/T020 first, then T021 → T022
- **US3 (Phase 5)**: Depends on Phase 2, US1 (seeding) and US2 (`get-conversation` is the surface where link status is asserted). T023 first, then T024 → T025 with T026 in parallel, then T027
- **Polish (Phase 6)**: Depends on all user stories. T028 → T029 → T030 (verifier last, over the evidence)

### Parallel Opportunities

- Phase 2: T005 + T007 alongside the T002–T004 schema chain
- US1: all four test tasks T008–T011 together; then the `sync.ts`→tool chain (T012–T014) in parallel with the Graph track (T015, T016, T018)
- US2: T019 + T020 together
- US3: T026 alongside T024/T025
- Across stories: sequential P1 → P2 → P3 is recommended — US2/US3 tests seed through US1's sync pipeline, so cross-story parallelism buys little here

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 (foundation, existing suites green)
2. Phase 3: US1 tests red → implementation green
3. **STOP and VALIDATE**: `npm test` — email-sync suite + all pre-existing suites pass; sync is the shippable core (the CRM holds the correspondence)

### Incremental Delivery

1. Add US2 → read tools make the store queryable → validate independently
2. Add US3 → person linking completes the CRM payoff → validate independently
3. Phase 6 gate + browser evidence + verifier → PR from `007-email-sync` → CI review → Tyler acceptance (real-mailbox pass per quickstart, SC-006)

---

## Notes

- Every story's test tasks are written and confirmed failing before their implementation tasks — code written before its failing test is discarded, not retrofitted (constitution Principle II)
- `sync.ts` tasks T012/T013 touch one file and are deliberately not [P]; same for the three `tools.ts` registrations (T014, T022, T027), which land in their own story phases sequentially
- Commit after each task or logical group (Conventional Commits); the feature lands as one PR
- SC-006 (real-mailbox < 5 min) is validated in Tyler's manual acceptance pass per quickstart — no automated task exists for it by design (research R11)
