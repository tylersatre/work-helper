# Tasks: MCP Mark Emails Read

**Input**: Design documents from `/specs/022-mcp-mark-emails-read/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, quickstart.md

**Tests**: TDD is mandatory (constitution Principle II) — every implementation task is preceded by a failing-test task. Tests must be run and observed failing before the corresponding implementation task begins.

**Organization**: Tasks are grouped by user story, in priority order (P1 stories first): US1, US2, US5 are P1; US3, US4 are P2. US5 (whole-call failure) comes before the P2 stories because agents write to Tyler's real mailbox — the safety contract is as critical as the happy path. The permission/provider plumbing (research R2/R3/R8) is Foundational because every story's tests run through it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)

## Path Conventions

Single TypeScript project at repo root: `src/server/`, `tests/unit/`, `tests/integration/` (per plan.md Structure Decision).

---

## Phase 1: Setup

**Purpose**: Confirm the worktree starts from a green baseline so every later red test is attributable to this feature.

- [X] T001 Verify green baseline in the worktree: run `npm run lint && npm run typecheck && npm test && npm run build` and confirm all pass before any feature work

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The auth scope split, the widened `MailProvider` seam (real + fake), and the integration harness — every user story's tests depend on all of it. No schema change, no migration.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Note on Principle II**: T006 and T007 are test scaffolding (the fake mailbox's knobs and the integration harness), not product code — their behavior is pinned by the story tests that exercise them (T008–T021), which is the red→green evidence for this phase. The product-code tasks here (T004, T005) each follow their own failing tests (T002, T003) as usual.

- [X] T002 [P] Failing unit tests in tests/unit/email-graph-auth.test.ts for the scope split and write-token path (research R2): (a) device-code sign-in requests `SIGN_IN_SCOPES = ['Mail.Read', 'Mail.ReadWrite', 'Calendars.Read', 'offline_access']`; (b) `getAccessToken()` and `verifyConnection()` still acquire with `READ_SCOPES = ['Mail.Read', 'Calendars.Read', 'offline_access']` — pre-feature sign-ins keep syncing (behavior unchanged); (c) new `getWriteAccessToken()` acquires silently with `WRITE_SCOPES = ['Mail.ReadWrite']` and returns the token; (d) probe classification — write-scope acquisition fails but read-scope succeeds ⇒ new `MailWritePermissionError`; write and read both fail ⇒ `MailboxNotConnectedError('expired', detail)`; no cached account ⇒ `MailboxNotConnectedError('never-signed-in')`. Observe failing (new members don't exist yet)
- [X] T003 [P] Failing unit tests in tests/unit/email-graph-provider.test.ts for the Graph write (research R3, via `vi.stubGlobal('fetch', ...)`): (a) `setMessageReadState(graphMessageId, isRead)` issues `PATCH https://graph.microsoft.com/v1.0/me/messages/{graphMessageId}` with body exactly `{ isRead }` (nothing else — FR-007), `Content-Type: application/json`, the `Prefer: IdType="ImmutableId"` header, and a bearer token from the injected `getWriteAccessToken`; (b) HTTP 200 ⇒ `'updated'`; (c) HTTP 404 ⇒ `'not-found'`; (d) HTTP 401/403 and network errors ⇒ throw (becomes a per-message `failed` outcome upstream); (e) `verifyWriteAccess()` calls `getWriteAccessToken` and propagates its typed errors, resolving when a token is returned. The exact-body assertion in (a) is the deliberate automated proxy for FR-007's global "read state is the only mailbox write" clause — the rest of that clause is review-enforced. Observe failing
- [X] T004 Implement the auth changes in src/server/services/email/graph-auth.ts per research R2: split the single `SCOPES` list (graph-auth.ts:5) into `SIGN_IN_SCOPES`/`READ_SCOPES`/`WRITE_SCOPES`; add `MailWritePermissionError`; add `getWriteAccessToken(): Promise<string>` to the `MailboxAuth` interface with the two-step probe classification (write-scope silent acquisition, on failure classified by a read-scope probe); point `beginSignIn` at `SIGN_IN_SCOPES` and leave `getAccessToken`/`verifyConnection` on `READ_SCOPES`; extend `FakeMailboxAuth` in src/server/services/email/fake-mailbox-auth.ts to satisfy the widened interface. Run T002 and confirm it passes
- [X] T005 Extend the provider seam per research R3: add `verifyWriteAccess(): Promise<void>` and `setMessageReadState(graphMessageId: string, isRead: boolean): Promise<'updated' | 'not-found'>` to the `MailProvider` interface in src/server/services/email/provider.ts; implement both in `GraphMailProvider` (src/server/services/email/graph-provider.ts), widening `authorizedFetch` (graph-provider.ts:121) to accept method/body/token (or adding a sibling) while reusing its error mapping; add `getWriteAccessToken` to `GraphMailProviderOptions` and wire the closure into the `GraphMailProvider` construction in src/server/index.ts (index.ts:91). Run T003 and confirm it passes (typecheck stays red until T006 extends the fake — land T005 and T006 together before running the full gate)
- [X] T006 Extend `FakeMailProvider` in src/server/services/email/fake-provider.ts per research R8: a mutable per-message read-state map seeded from `SeedMessage.isRead`; `setMessageReadState` mutating the map, honoring two new knobs (a set of graph ids treated as mailbox-deleted ⇒ `'not-found'`, a set of graph ids whose write throws ⇒ mid-list rejection); `verifyWriteAccess` driven by a `writeAccess: 'ok' | 'not-connected' | 'expired' | 'no-write-permission'` knob throwing the same typed errors as graph-auth.ts; a read accessor (current read state per graph id) plus a recorded-writes log so tests can assert "read in the mailbox" and "no write was issued"; `fetchMessages` serving `isRead` from the mutable map so a later sync sees the post-mark mailbox (US4). Confirm `npm run typecheck` and the existing suites pass
- [X] T007 Create tests/integration/mcp-mark-read-tools.test.ts scaffold following the tests/integration/email-read-tools.test.ts pattern (real Fastify app via `buildApp` on an ephemeral port, `:memory:` SQLite, stub identity provider, real `@modelcontextprotocol/sdk` client over StreamableHTTP, mail seeded through `FakeMailProvider` + the `sync-emails` tool) with the spec's conversations ("Quote attached" — one unread flagged "Orange category" Inbox message from sam.rivera@example.com received 2026-08-06; "Pricing question" — Sam's question 2026-08-04 unread, Tyler's reply 2026-08-05 in Sent read, Sam's follow-up 2026-08-06 unread; "Lunch Thursday" — one unread message), plus shared helpers: a `set-email-read-state` caller and a multi-surface assertion helper reading `get-conversation`, `list-conversations`, `GET /api/emails/conversations` (the web pages' data source), the fake mailbox's read-state accessor, and the `GET /api/email-sync/runs` row count. Isolation model: fresh app and re-seeded mail per test (`beforeEach`/`afterEach`, exactly as email-read-tools.test.ts does) — every test starts from the seed's read states, so any test whose precondition differs from the seed (e.g. "already read" in T009/T019) establishes it itself with a prior tool call inside the test. Harness compiles and connects (trivial smoke assertion passes)

**Checkpoint**: Auth split and provider seam proven at unit level, harness connects — user story tests can now be written.

---

## Phase 3: User Story 1 - Agent marks a message read, mailbox and work-helper agree instantly (Priority: P1) 🎯 MVP

**Goal**: A new `set-email-read-state` MCP tool marks one synced message read — mailbox written first, store updated in the same call, every read surface agreeing immediately, no sync run created, nothing else about the message changed.

**Independent Test**: Seed one unread synced message, call the tool with its id and state read, confirm mailbox state, query-tool responses, the web data source, untouched sync history, and that no other message attribute changed.

### Tests for User Story 1 (write first, observe failing)

- [X] T008 [P] [US1] Failing integration test for US1-AS1 in tests/integration/mcp-mark-read-tools.test.ts: seed and sync "Quote attached"; first pin FR-010's negative clause — fetch the conversation via `get-conversation` and `GET /api/emails/conversations/:id`, and link it to a task via `create-task` + `link-conversation-to-task`, then assert the message is still unread in the store and the fake mailbox with the recorded-writes log empty (fetching, opening, and linking never change read state); then call `set-email-read-state` with the message's id and `state: "read"`; assert the result's `structuredContent` is `{ state: 'read', outcomes: [{ messageId, status: 'marked' }], markedCount: 1, alreadyCount: 0, notFoundCount: 0, failedCount: 0 }` with summary text per contracts/mcp-tools.md; the message is read in the fake mailbox (accessor); `get-conversation` shows `isRead: true`; `list-conversations` and `GET /api/emails/conversations` show no unread indicator for "Quote attached"; flag, category, folder, subject, and body are unchanged on every surface; and `GET /api/email-sync/runs` has zero new rows (FR-001, FR-003, FR-004, FR-007, FR-009, FR-010, FR-011)
- [X] T009 [P] [US1] Failing integration test for US1-AS2 in tests/integration/mcp-mark-read-tools.test.ts: with the "Quote attached" message already read in mailbox and store, call the tool again with `state: "read"`; assert the call succeeds with outcome `already-in-state` (`alreadyCount: 1`), the fake's recorded-writes log shows no write was issued, and mailbox and store are unchanged (FR-005)

### Implementation for User Story 1

- [X] T010 [US1] Create the `setEmailReadState(db, provider, messageIds, state)` service in src/server/services/email/read-state.ts per research R4: `provider.verifyWriteAccess()` preflight (typed errors propagate — no outcomes); then sequentially per id in input order: load `id`, `graphMessageId`, `isRead` from `email_messages` — no row ⇒ outcome `not-found`; stored `isRead` already equals the requested state ⇒ outcome `already-in-state` (no Graph call, no store write — duplicates resolve here); else `provider.setMessageReadState(...)` — `'updated'` ⇒ update only that row's `is_read` and outcome `marked`; `'not-found'` ⇒ outcome `failed` with reason "The mailbox no longer has this message", store untouched; thrown error ⇒ outcome `failed` with the error's message as reason, store untouched, loop continues; no wrapping transaction, never touching `SyncCoordinator` (FR-003, FR-006, FR-011, research R9)
- [X] T011 [US1] Register the `set-email-read-state` tool in src/server/mcp/tools.ts per contracts/mcp-tools.md and research R5–R7: description per contract; `inputSchema` `{ messageIds: z.array(z.number().int().positive()), state: z.string() }`; hand-validate count 1–50 and state ∈ {read, unread} before any work (exact sentences pinned in US5); treat an absent `context.mailProvider` as the not-connected branch; map preflight errors to whole-call `toolError(...)` results; on success return `structuredContent` `{ state, outcomes, markedCount, alreadyCount, notFoundCount, failedCount }` and the count-built summary text; `McpToolsContext` unchanged. Run T008/T009 and confirm they pass

**Checkpoint**: The core loop works — an agent can flip one message's read state with the mailbox and every work-helper surface agreeing instantly.

---

## Phase 4: User Story 2 - Agent marks many messages in one call with an outcome per message (Priority: P1)

**Goal**: One call takes up to 50 message ids and one state, returning an outcome per id in input order — marked, already-in-state, not-found, or failed with a reason — with successes standing regardless of other ids' failures.

**Independent Test**: Seed a mix of unread, read, mailbox-deleted, and nonexistent ids, call the tool once with the mixed list, confirm each reported outcome and each message's resulting state in mailbox and store.

### Tests for User Story 2 (write first, observe failing)

- [X] T012 [P] [US2] Failing integration test for US2-AS1 in tests/integration/mcp-mark-read-tools.test.ts: one call with all three "Pricing question" message ids and `state: "read"` → outcomes in input order report Sam's question `marked`, Tyler's Sent-folder reply `already-in-state` (Sent messages are valid individual targets — spec edge case), Sam's follow-up `marked` (`markedCount: 2, alreadyCount: 1`); both of Sam's messages read in the fake mailbox; `get-conversation` shows all three read; no unread indicator for "Pricing question" on either list surface (FR-004)
- [X] T013 [P] [US2] Failing integration test for US2-AS2 in tests/integration/mcp-mark-read-tools.test.ts: one call with the "Quote attached" id, Sam's follow-up id, and 999999 → the call succeeds with the two real messages `marked` and 999999 `not-found` (`notFoundCount: 1`); the two real messages are read in mailbox and store; the not-found id changed nothing (FR-006)
- [X] T014 [P] [US2] Failing integration tests for US2-AS3 and batch edge cases in tests/integration/mcp-mark-read-tools.test.ts: (a) seed and sync "Lunch Thursday", then set its graph id in the fake's deleted-ids knob; one call with the "Quote attached" id + the "Lunch Thursday" id → "Quote attached" `marked` (read in mailbox and store) and "Lunch Thursday" `failed` with a reason saying the mailbox no longer has this message, its stored state still unread, the success standing (FR-006); (b) mid-list rejection — a three-id call where the second id's graph id is in the fail-write knob → first `marked` and stays marked, second `failed` with the error's reason, third still processed and `marked` (nothing transactional, nothing rolled back); (c) the same id twice in one list → first occurrence `marked`, second `already-in-state`

### Implementation for User Story 2

- [X] T015 [US2] Verify the T010/T011 implementation satisfies T012–T014 (sequential input-order outcomes, per-message autonomy, duplicate short-circuit are all R4 properties); fix any gaps in src/server/services/email/read-state.ts or src/server/mcp/tools.ts until T012–T014 pass with T008/T009 still green

**Checkpoint**: Batch triage is safe for automated callers — every id gets an outcome, successes never roll back.

---

## Phase 5: User Story 5 - A call the mailbox can't take fails with nothing changed (Priority: P1)

**Goal**: Whole-call failures — mailbox not connected, sign-in expired, pre-feature sign-in lacking write permission, or invalid input — return no per-message outcomes, change nothing anywhere, and carry the exact contracted sentences directing to the Sync page.

**Independent Test**: Call the tool in each failure state (three write-access knob values, absent provider, 51 ids, empty list, invalid state) and confirm each error's exact content and that mailbox and store are unchanged.

### Tests for User Story 5 (write first, observe failing)

- [X] T016 [P] [US5] Failing integration tests for US5-AS1 in tests/integration/mcp-mark-read-tools.test.ts: with "Quote attached" seeded unread, set the fake's `writeAccess` knob to `'not-connected'`, `'expired'`, and `'no-write-permission'` in turn and call the tool with the message id and `state: "read"` — each call fails whole (`isError: true`, no `structuredContent`, no outcomes) with its exact sentence per contracts/mcp-tools.md: `The mailbox is not connected — connect the mailbox on the Sync page.` / `The mailbox sign-in has expired (<detail>) — reconnect the mailbox on the Sync page.` / `The mailbox sign-in predates read-state changes and lacks permission to change mail — reconnect the mailbox on the Sync page to grant it.`; the message stays unread in mailbox and store each time, and no sync run appears (FR-008); also build an app with no `mailProvider` at all → the not-connected sentence
- [X] T017 [P] [US5] Failing integration tests for US5-AS2 and the auth edge case in tests/integration/mcp-mark-read-tools.test.ts: (a) 51 message ids → `isError: true` with exactly `At most 50 messages per call`; (b) empty `messageIds` → exactly `At least one message id is required`; (c) one valid id with `state: "archived"` → exactly `State must be read or unread`; after each, nothing is marked in the fake mailbox or the store and the recorded-writes log is empty (FR-002); (d) a non-numeric message id → rejected at the SDK/zod boundary before the handler runs; (e) boundary success (SC-002's "up to 50"): exactly 50 message ids — built by repeating the seeded ids, since duplicates are allowed — succeeds with 50 outcomes in input order (first occurrence of each id `marked`, repeats `already-in-state`), no id silently dropped; (f) auth gate — an unauthenticated `set-email-read-state` call (following the tests/integration/mcp-forged-identity.test.ts rejection pattern) is rejected before the tool handler runs, nothing changed (spec edge case "Unauthenticated or unauthorized MCP calls")

### Implementation for User Story 5

- [X] T018 [US5] Pin the exact whole-call error surface in src/server/mcp/tools.ts per research R6/R7: the three hand-validation sentences returned before any work with nothing touched; `MailboxNotConnectedError('never-signed-in')` and absent provider → the not-connected sentence; `MailboxNotConnectedError('expired', detail)` → the expired sentence with detail interpolated; `MailWritePermissionError` → the missing-permission sentence; all via `toolError()` (result-level `isError`, never a protocol error), no outcomes on any of these paths. Run T016/T017 and confirm they pass with all earlier tests still green

**Checkpoint**: All three P1 stories complete — the tool is safe to point at Tyler's real mailbox: happy path, batch semantics, and zero-side-effect failure are all pinned.

---

## Phase 6: User Story 3 - Agent marks a message back to unread (Priority: P2)

**Goal**: The same tool moves a message back to unread, with the mailbox and every work-helper surface reflecting the unread state identically.

**Independent Test**: Seed a read message, call the tool with state unread, confirm mailbox, query tools, and the web data source all show unread.

### Tests for User Story 3 (write first, observe failing)

- [X] T019 [P] [US3] Failing integration test for US3-AS1 in tests/integration/mcp-mark-read-tools.test.ts: with the "Quote attached" message read in mailbox and store, call the tool with its id and `state: "unread"` → outcome `marked` (`structuredContent.state: 'unread'`, summary text `Marked 1 message unread.`); the message is unread in the fake mailbox; `get-conversation` shows `isRead: false`; `list-conversations` and `GET /api/emails/conversations` show the unread indicator for "Quote attached" again

### Implementation for User Story 3

- [X] T020 [US3] Verify the direction-agnostic T010/T011 implementation satisfies T019 (the service takes the requested boolean, nothing is read-only-specific); fix any gaps in src/server/services/email/read-state.ts or src/server/mcp/tools.ts until T019 passes with all earlier tests green

**Checkpoint**: Both directions work — mistaken marks are recoverable and messages can be deliberately resurfaced in the inbox.

---

## Phase 7: User Story 4 - A later sync confirms the mark instead of reverting it (Priority: P2)

**Goal**: An email sync over a range containing a tool-marked message finds the mailbox already agreeing with the store — the mark survives, sync behavior itself unchanged.

**Independent Test**: Mark a message read through the tool, run an email sync over a range including its date, confirm the read state is unchanged afterward.

### Tests for User Story 4 (write first, observe failing)

- [X] T021 [P] [US4] Failing integration test for US4-AS1 in tests/integration/mcp-mark-read-tools.test.ts: mark the "Quote attached" message read through the tool, then run the `sync-emails` tool over a range including 2026-08-06 (the fake's `fetchMessages` serves `isRead` from the mutable map, so the sync sees the post-mark mailbox) → after the run the message still shows read in `get-conversation` and `GET /api/emails/conversations`; the sync run itself appears in `GET /api/email-sync/runs` but the tool call added no run (FR-011, FR-012)

### Implementation for User Story 4

- [X] T022 [US4] Verify T006's map-backed `fetchMessages` and the untouched sync path make T021 pass (no sync code changes — research R9); fix any gaps in src/server/services/email/fake-provider.ts until T021 passes with all earlier tests green

**Checkpoint**: All five stories complete — marks are durable across syncs and the whole spec's behavior is pinned by tests.

---

## Phase 8: Polish & Definition of Done

**Purpose**: Documentation touch-ups, full verification gate, quickstart validation, and the evidence the constitution requires before the feature is reported done.

- [X] T023 [P] Update docs/deploy.md (scope list around line 130) to include `Mail.ReadWrite` with a sentence about the one-time reconnect on the Sync page after this ships — and, in passing, add `Calendars.Read` to that same sentence, which today only names `Mail.Read` (pre-existing drift from calendar-sync; the code's scopes already include it) — and update the scope mention in .env.example (around line 14) to match (research "Documentation touchpoints")
- [X] T024 Run the full gate `npm run lint && npm run typecheck && npm test && npm run build` and record passing output (quickstart.md §1)
- [X] T025 Run the targeted suites `npx vitest run tests/integration/mcp-mark-read-tools.test.ts` and `npx vitest run tests/unit/email-graph-provider.test.ts tests/unit/email-graph-auth.test.ts` and confirm every quickstart.md §2 expected outcome is pinned by a passing test; record output as automated-check evidence for the MCP-only criteria
- [X] T026 Dispatch the `browser-tester` agent against the dev server (`npm run dev` with the fake dev mailbox, API 3022 / UI 5122) to capture web-visibility evidence for the "after a page reload" clauses of US1 and US3 (Emails page list row and conversation detail: unread marker gone after a tool-driven mark read, back after a tool-driven mark unread — the marks driven through `set-email-read-state` against the dev server before each reload), stored in docs/evidence/022-mcp-mark-emails-read/
- [X] T027 Dispatch the `verifier` agent to independently confirm every acceptance criterion has a passing automated check plus surface-appropriate evidence (browser evidence for the web-reload clauses, recorded test output for MCP-only criteria) before reporting the feature done

Note: SC-006 (a real agent marks a real email read, Outlook shows it read, nothing else changed) is Tyler's manual acceptance pass after deploy and reconnect (quickstart.md §5) — deliberately outside the automated tasks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on T001. Blocks all user stories. Within it: T004 after T002; T005 after T003 and T004 (needs `getWriteAccessToken`); T006 after T005 (implements the widened interface — land T005+T006 together to keep typecheck green); T007 after T006 (uses the fake's accessor/knobs).
- **US1 (Phase 3)**: Depends on T007.
- **US2 (Phase 4)**: Depends on US1 (T010/T011) — exercises the same service and tool.
- **US5 (Phase 5)**: Depends on US1 (T011) — pins the tool's validation and preflight wording; independent of US2's batch tests, so it can run in parallel with Phase 4.
- **US3 (Phase 6)**: Depends on US1 (T010/T011) — same tool, opposite direction; independent of US2/US5.
- **US4 (Phase 7)**: Depends on US1 (a mark to survive) and T006 (map-backed `fetchMessages`); independent of US2/US3/US5.
- **Polish (Phase 8)**: T023 anytime after Phase 2; T024/T025 after all user stories; T026 after T024; T027 last (verifier confirms the evidence).

### Within Each User Story

- Failing tests are written and observed failing before their implementation task (constitution Principle II — code written before its failing test is discarded, not retrofitted).
- Service (T010) before tool registration (T011).

### Parallel Opportunities

- T002 + T003 (different unit test files) in parallel.
- T008 + T009, T012 + T013 + T014, T016 + T017 (independent test cases, same new integration file — write together or in either order).
- Once US1 is green, Phases 4–7 touch disjoint test cases and mostly verify the same implementation — US2, US5, US3, and US4 test-writing can proceed in parallel, with their verify/fix tasks serialized only where they edit the same files (read-state.ts, tools.ts).
- T023 (docs) in parallel with any user story phase.

---

## Implementation Strategy

### MVP First

1. Phases 1–2 (baseline + auth/provider/fake plumbing + harness), then Phase 3 (US1).
2. For a mailbox-safe MVP, additionally run Phase 5 (US5) — the tool then has the happy path plus whole-call failure with zero side effects, needing nothing from US2/US3/US4.
3. Validate: `npx vitest run tests/integration/mcp-mark-read-tools.test.ts`.

### Incremental Delivery

1. US1 → an agent can mark one message read, everywhere at once (core value).
2. US2 → batch calls with per-message outcomes (real triage).
3. US5 → exact whole-call failure contract (safe against the real mailbox).
4. US3 → the unread direction (recovery/resurface).
5. US4 → durability across sync pinned.
6. Phase 8 → docs, gate, evidence, verifier — then PR.

Each checkpoint leaves the suite green and the branch shippable; commit after each task or logical red→green pair (Conventional Commits).
