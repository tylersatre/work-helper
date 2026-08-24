# Tasks: Suppress Address

**Input**: Design documents from `/specs/028-suppress-address/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, quickstart.md

**Tests**: TDD is mandatory per the project constitution (CLAUDE.md: "TDD is mandatory: failing test first, then code"). Every schema change, service-layer function, and MCP tool below is preceded by a failing test task.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing of each story, per spec.md's priorities (US1 = P1, US2/US3/US4 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact — this is a single-project repo (`src/`, `tests/` at repository root)

## Path Conventions

Single project, server-only feature (see plan.md Structure Decision):
- Schema/migration: `src/server/db/schema.ts`, `drizzle/0005_*.sql`
- Service: `src/server/services/address-suppression.ts` (new), plus small edits to `src/server/services/contact-entries.ts`, `src/server/services/people.ts`, `src/server/services/email/queries.ts`
- MCP tools: `src/server/mcp/tools.ts`
- Tests: `tests/integration/mcp-suppress-address.test.ts` (single new file, all 3 tools + auto-clear hook), `tests/integration/migration-upgrade.test.ts` (extended)

All four user stories share the one new test file and the one new service file, since every story is a handful of tightly-related tool/hook additions rather than separate subsystems — task-level granularity (one task per function/tool/hook, in dependency order) replaces file-level parallelism within a story. Almost nothing is marked `[P]`: every task either appends to a shared file another task in the same phase also touches, or has a direct dependency-order relationship (test before implementation) with the task before it.

---

## Phase 1: Setup

No project initialization needed — this feature adds to an existing, fully-configured codebase (no new dependencies, no new config, per plan.md Technical Context). Phase skipped.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one new table every user story's tools read or write — `suppressed_addresses` — shipped as a purely additive, data-preserving migration.

**⚠️ CRITICAL**: T001–T003 MUST be complete before any user story task.

- [X] T001 Extend `tests/integration/migration-upgrade.test.ts` with a failing parity assertion: both a fresh DB and an upgraded production-shaped DB must contain `suppressed_addresses` with columns `id` (PK, autoincrement), `address_id` (FK → `email_addresses.id`, `ON DELETE CASCADE`, not null), `suppressed_at` (integer, not null), and the unique index `suppressed_addresses_address_id_unique` on `address_id` (data-model.md). Run it and confirm it fails.
- [X] T002 Add `suppressedAddresses` to `src/server/db/schema.ts` per data-model.md's exact shape (`id`, `addressId` FK unique `onDelete: 'cascade'`, `suppressedAt`).
- [X] T003 Generate the migration with `npx drizzle-kit generate` producing `drizzle/0005_*.sql`; verify it is purely additive (single `CREATE TABLE` + one `CREATE UNIQUE INDEX`, migrations `0000`–`0004` untouched via `git diff main -- drizzle/`); confirm the T001 test now passes.

**Checkpoint**: `suppressed_addresses` table landed, migration-upgrade test green — user story phases can begin.

---

## Phase 3: User Story 1 - Agent clears noise out of the unlinked-addresses queue (Priority: P1) 🎯 MVP

**Goal**: An authorized agent can flag a currently-unlinked, previously-seen email address via `suppress-address`, and it drops out of `list-unlinked-addresses` on the very next call.

**Independent Test**: Seed a synced store with two unlinked addresses (news@example.com, jordan.smith@example.com), call `list-unlinked-addresses` to see both, suppress news@example.com, call `list-unlinked-addresses` again to confirm only jordan.smith@example.com remains.

### Tests for User Story 1

- [X] T004 [US1] Write failing integration test(s) in NEW `tests/integration/mcp-suppress-address.test.ts` (follow the `tests/integration/mcp-unlinked-addresses.test.ts` pattern: `createDb(':memory:')`, `buildApp({...})`, `connectThroughApproval(...)`, `FakeMailProvider` seeding news@example.com with 1 message and jordan.smith@example.com with 3 messages, both unlinked, plus sam.rivera@example.com seeded and linked to a person named "Sam Rivera") covering `suppress-address`'s full contract up front — since `suppress-address` is implemented whole in T005/T007, every branch of its contract needs a failing test before that implementation lands (Constitution Principle II, Test-First):
  - US1 acceptance scenario 1 (happy path): `list-unlinked-addresses` returns both news@example.com and jordan.smith@example.com; `suppress-address` for news@example.com succeeds; a second `list-unlinked-addresses` call returns only jordan.smith@example.com.
  - FR-004 idempotency (Edge Cases): call `suppress-address` for news@example.com a second time; confirm it succeeds as a no-op and `suppressedAt` in the response is identical (unchanged) between the first and second call.
  - FR-011 case-insensitivity: call `suppress-address` with a differently-cased variant of a seeded address (e.g. `NEWS@Example.com`); confirm it resolves to the same row and the response echoes the stored (synced) casing, not the caller's input casing.
  - US4 acceptance scenario 1 (FR-002): `suppress-address` for never-seen@example.com (never seeded in any synced message) fails with a validation error, and it does not appear in `list-suppressed-addresses`.
  - US4 acceptance scenario 2 (FR-003): `suppress-address` for sam.rivera@example.com (linked to "Sam Rivera") fails with a validation error identifying "Sam Rivera" by name, and it does not appear in `list-suppressed-addresses`.

  Confirm all of the above fail (tool doesn't exist yet).

### Implementation for User Story 1

- [X] T005 [US1] Implement `suppressAddress(db, rawAddress)` in NEW `src/server/services/address-suppression.ts` per data-model.md and contracts/mcp-tools.md §1 (research.md R2, R6, R7, R8, R9): validate with `z.string().trim().min(1, 'An address is required')`; resolve via the existing `findEmailAddressByValue` (case-insensitive); return a typed result distinguishing empty input, no matching `email_addresses` row (`'not-found'`), a row already linked to a person (`'linked'`, carrying the person's name), and success; on success `db.insert(suppressedAddresses).values({ addressId, suppressedAt: Date.now() }).onConflictDoNothing()` then re-read the row so a repeat call returns the original `suppressedAt` (FR-004) and the stored (synced) address casing (FR-009 — not a code dependency here, just consistent output casing).
- [X] T006 [US1] Add the `NOT EXISTS (SELECT 1 FROM suppressed_addresses sa WHERE sa.address_id = ea.id)` exclusion to the qualifying/final `SELECT` in `listUnlinkedAddresses` (`src/server/services/email/queries.ts`, per data-model.md's Query change section and research.md R5), and update that function's doc comment to mention the new exclusion (FR-008).
- [X] T007 [US1] Register the `suppress-address` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §1: input `{ address: string }`, calls `suppressAddress`, success `structuredContent: { address, suppressedAt }` with text `` Suppressed ${address}. ``, errors `An address is required` / `` ${address} has never appeared in synced mail `` / `` ${address} is linked to ${personName} `` as specified. Make T004 pass.

**Checkpoint**: `suppress-address` and the filtered `list-unlinked-addresses` are fully functional and independently testable. This is the MVP slice.

---

## Phase 4: User Story 2 - Agent reviews and audits what's been suppressed (Priority: P2)

**Goal**: An authorized agent can retrieve every currently-suppressed address via `list-suppressed-addresses`, ordered most-recently-suppressed first.

**Independent Test**: Suppress news@example.com, then suppress ads@example.com, call `list-suppressed-addresses`, confirm both appear with ads@example.com before news@example.com.

**Depends on**: Phase 3 (`suppress-address`, to have something to list).

### Tests for User Story 2

- [ ] T008 [US2] Write failing integration tests in `tests/integration/mcp-suppress-address.test.ts` for `list-suppressed-addresses`, covering spec.md US2 acceptance scenarios 1–2 (suppressing news@example.com makes it appear in the list; suppressing ads@example.com afterward puts it before news@example.com, most-recently-suppressed first) and FR-005. Confirm the tests fail (tool doesn't exist yet).

### Implementation for User Story 2

- [ ] T009 [US2] Implement `listSuppressedAddresses(db)` in `src/server/services/address-suppression.ts` per data-model.md and contracts/mcp-tools.md §2: join `suppressedAddresses` to `emailAddresses`, `ORDER BY suppressed_at DESC`, return `Array<{ address: string, suppressedAt: number }>`.
- [ ] T010 [US2] Register the `list-suppressed-addresses` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §2: no input, calls `listSuppressedAddresses`, `structuredContent: { addresses }` with success text `` ${count} suppressed address${count === 1 ? '' : 'es'}. ``. Make T008 pass.

**Checkpoint**: `list-suppressed-addresses` is fully functional and independently testable, alongside US1.

---

## Phase 5: User Story 3 - Agent reverses a suppression that shouldn't have happened (Priority: P2)

**Goal**: An authorized agent can clear a suppression via `unsuppress-address`, after which the address reappears in `list-unlinked-addresses` (if still unlinked) and drops out of `list-suppressed-addresses`.

**Independent Test**: Suppress news@example.com, unsuppress it, confirm it reappears in `list-unlinked-addresses` and no longer appears in `list-suppressed-addresses`.

**Depends on**: Phase 3 (`suppress-address`, to have something to unsuppress). Benefits from Phase 4's `list-suppressed-addresses` for verification but does not strictly require it — the effect is also observable via `list-unlinked-addresses`.

### Tests for User Story 3

- [ ] T011 [US3] Write failing integration tests in `tests/integration/mcp-suppress-address.test.ts` for `unsuppress-address`, covering spec.md US3 acceptance scenario 1 (suppress news@example.com, unsuppress it, `list-unlinked-addresses` includes it again and `list-suppressed-addresses` no longer does) and the Edge Cases no-op behavior (unsuppressing a never-suppressed or unknown address succeeds with `wasSuppressed: false`, no error, FR-007). Confirm the tests fail (tool doesn't exist yet).

### Implementation for User Story 3

- [ ] T012 [US3] Implement `unsuppressAddress(db, rawAddress)` in `src/server/services/address-suppression.ts` per data-model.md and contracts/mcp-tools.md §3 (research.md R6): validate non-empty; resolve via `findEmailAddressByValue` — no matching row returns `{ address: trimmedInput, wasSuppressed: false }` (echoes caller casing, nothing to normalize against); a matching row does `db.delete(suppressedAddresses).where(eq(suppressedAddresses.addressId, id)).run()`, reporting `wasSuppressed` from whether a row actually existed beforehand, and echoes the stored (synced) casing.
- [ ] T013 [US3] Register the `unsuppress-address` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §3: input `{ address: string }`, calls `unsuppressAddress`, `structuredContent: { address, wasSuppressed }` with success text `` Unsuppressed ${address}. `` when cleared or `` ${address} was not suppressed. `` otherwise, error `An address is required`. Make T011 pass.

**Checkpoint**: `unsuppress-address` is fully functional and independently testable, alongside US1 and US2.

---

## Phase 6: User Story 4 - Suppression respects and defers to real linking (Priority: P2)

**Goal**: `suppress-address` refuses a never-seen or already-linked address, and a suppression flag clears itself automatically the instant its address becomes linked to a person — with no reactivation on a later unlink.

**Independent Test**: Attempt to suppress an address already linked to a person (expect failure); separately, suppress an unlinked address, link it to a new person, unlink it again, and confirm it comes back as a normal (non-suppressed) unlinked address.

**Depends on**: Phase 3 (`suppress-address` and its validation branches, tested by T004 and implemented in full by T005/T007 per contracts/mcp-tools.md §1's complete error set — see Notes).

### Tests for User Story 4

- [ ] T014 [US4] Regression checkpoint, not new test authoring: re-run the US4 acceptance scenario 1–2 assertions (never-seen rejection, linked-person rejection identifying "Sam Rivera") that were written as failing tests in T004 (Phase 3) before `suppress-address` was implemented, and confirm they still pass after Phase 6's auto-clear-on-link hooks (T017–T019) land. This gives US4 its own explicit checkpoint for FR-002/FR-003 without re-deriving coverage that already exists.
- [ ] T015 [US4] Write failing integration tests for the auto-clear-on-link hook (spec.md US4 acceptance scenario 3): (a) suppress jordan.smith@example.com (unlinked), call `create-person` with email jordan.smith@example.com linking it to new person "Jordan Smith", confirm the address is linked normally AND `list-suppressed-addresses` no longer includes it; (b) separately, suppress another seeded unlinked address, call `add-contact-entry` to add it to an *existing* person, confirm the same auto-clear. Confirm both fail (no hook exists yet — the address links correctly but the suppression row survives).
- [ ] T016 [US4] Write a failing integration test for no-reactivation (spec.md US4 acceptance scenario 4), continuing from T015(a)'s setup: after jordan.smith@example.com is suppressed then linked to "Jordan Smith" via `create-person`, call `remove-contact-entry` to unlink it from Jordan Smith, then call `list-unlinked-addresses` and confirm jordan.smith@example.com reappears as an ordinary (non-suppressed) entry, with `list-suppressed-addresses` still excluding it. Confirm it fails (until T015's hook lands, the stale suppression row keeps it hidden from `list-unlinked-addresses` after unlink).

### Implementation for User Story 4

- [ ] T017 [US4] Implement `clearSuppressionForAddressId(db, addressId)` in `src/server/services/address-suppression.ts` per research.md R4/R6: `tx.delete(suppressedAddresses).where(eq(suppressedAddresses.addressId, addressId)).run()` — a harmless no-op when no suppression row exists.
- [ ] T018 [US4] Call `clearSuppressionForAddressId` inside the existing transaction in `contact-entries.ts::addEntry`'s `existing.personId === null` link branch (research.md R4, currently ~lines 115–121), so the clear is atomic with the link. Make T015(b) pass.
- [ ] T019 [US4] Call `clearSuppressionForAddressId` inside the existing transaction in `people.ts::createPerson`'s `existingEmail` link branch (research.md R4, currently ~line 133), so the clear is atomic with the link. Make T015(a) and T016 pass.

**Checkpoint**: All functional requirements (FR-001–FR-014) are satisfied — all three tools exist, are fully validated, and the auto-clear/no-reactivation guarantees hold.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification spanning all four user stories, per the project's Definition of Done (CLAUDE.md).

- [ ] T020 [P] Write an integration test in `tests/integration/mcp-suppress-address.test.ts` confirming FR-012: suppress an address, then confirm it still appears normally through a raw participant-data read tool (`get-conversation` or `list-conversations`) — suppression has no effect on synced mail, conversations, or message/event participant data.
- [ ] T021 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` (the same gate the Stop hook runs) and fix any failures across all changed files.
- [ ] T022 Independently confirm (via the `verifier` agent) that every acceptance scenario in spec.md (US1–US4) has a passing automated check, per the project's Definition of Done. No `browser-tester` evidence is expected or required — this feature has no UI surface (spec.md Assumptions; quickstart.md "Expected outcome").

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Skipped — no work needed.
- **Foundational (Phase 2)**: No dependencies. BLOCKS every user story — the `suppressed_addresses` table must exist before any tool can read or write it.
- **US1 (Phase 3)**: Depends on Phase 2 only.
- **US2 (Phase 4)**: Depends on Phase 2 and Phase 3 (needs `suppress-address` to have something to list).
- **US3 (Phase 5)**: Depends on Phase 2 and Phase 3 (needs `suppress-address` to have something to unsuppress).
- **US4 (Phase 6)**: Depends on Phase 2 and Phase 3 (extends `suppress-address`'s validation contract and the two existing link write-sites).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. The foundational increment every other story builds on.
- **US2 (P2)**: Depends on Phase 2 and US1. No dependency on US3 or US4.
- **US3 (P2)**: Depends on Phase 2 and US1. No dependency on US2 or US4.
- **US4 (P2)**: Depends on Phase 2 and US1 (reuses `suppress-address`'s validation, built in US1). No dependency on US2 or US3.

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation (TDD, per CLAUDE.md). T004 (Phase 3) writes failing tests for `suppress-address`'s entire contract — including the FR-002/FR-003 rejection branches and FR-004 idempotency that US4/Phase 6 later re-verify — before T005/T007 implement it, so no code in this feature is written ahead of its failing test. T014 (Phase 6) is a regression re-check, not new coverage authoring; it depends on T004 already existing and passing.
- Service-layer function tasks precede the MCP tool registration tasks that call them.
- Integration test tasks for a story precede that story's implementation tasks.

### Parallel Opportunities

- Within this feature almost nothing is marked `[P]`: US2, US3, and US4 all extend the single new `address-suppression.ts` service file and the single new `mcp-suppress-address.test.ts` test file, and US4's implementation touches the same two files (`contact-entries.ts`, `people.ts`) at different lines — treat these as sequential within one contributor's working tree, even though US2/US3/US4 are logically independent of each other once Phase 3 lands.
- T020 (Polish, FR-012 coverage) is independent of T021/T022 and is marked `[P]`.

---

## Parallel Example: None meaningful

Every task in this feature either has a direct test-before-implementation dependency or shares a file with an adjacent task in the same phase — there is no genuine multi-task parallel batch to illustrate beyond T020 running independently of T021/T022 in Phase 7.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 2: Foundational (`suppressed_addresses` table + migration).
3. Complete Phase 3: User Story 1 (`suppress-address` + filtered `list-unlinked-addresses`).
4. **STOP and VALIDATE**: Run the new integration test file, confirm US1's scenario passes independently.
5. Deploy/demo if ready — an agent can already clear noise out of the queue.

### Incremental Delivery

1. Phase 2 (Foundational) + Phase 3 (US1, `suppress-address`) → validate → demo (MVP).
2. Phase 4 (US2, `list-suppressed-addresses`) → validate → demo.
3. Phase 5 (US3, `unsuppress-address`) → validate → demo.
4. Phase 6 (US4, validation regression + auto-clear-on-link + no-reactivation) → validate → demo (suppression is now safe to use liberally).
5. Phase 7 (Polish: FR-012 coverage + full verification gate + `verifier` agent) → PR.

### Suggested MVP Scope

**User Story 1** (`suppress-address` + the `list-unlinked-addresses` filter) is the smallest increment that delivers the feature's entire point — spec.md's own words: "This is the entire point of the feature — without it, `list-unlinked-addresses` keeps regrowing with addresses nobody will ever link."

---

## Notes

- All 3 MCP tools are registered in the single existing `src/server/mcp/tools.ts` file and are automatically behind the `mcp-authentik-auth` OAuth gate (FR-013) — no auth-specific task is needed (research.md R10).
- `suppress-address`'s full validation contract (empty input, never-seen rejection, linked rejection, idempotent re-suppress, case-insensitive matching) is implemented together in Phase 3 (T005/T007), with T004 writing failing tests for every branch of that contract first — including the FR-002/FR-003 rejection scenarios and FR-004 idempotency that spec.md assigns to US4/Edge Cases — so nothing in this feature is implemented ahead of its failing test (Constitution Principle II). Phase 6 (US4) then adds T014 as a dedicated regression checkpoint re-confirming FR-002/FR-003 still hold after the genuinely new auto-clear-on-link behavior (T015–T019) lands, rather than authoring that coverage for the first time.
- No client (Vue) changes anywhere in this task list — this feature is server/MCP-only (plan.md Scale/Scope, spec.md Assumptions).
- Every write-tool task must leave zero partial effects on a failed call (FR-014) — validation happens before any mutation, matching the atomic patterns already used by other write tools (contracts/mcp-tools.md, Cross-cutting notes).
- Verify each story's tests fail before implementing (except T014, see above), and pass after — do not retrofit tests to already-written code (CLAUDE.md TDD mandate).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
