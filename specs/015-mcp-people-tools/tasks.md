# Tasks: MCP People Tools

**Input**: Design documents from `/specs/015-mcp-people-tools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, quickstart.md

**Tests**: TDD is NON-NEGOTIABLE for this project (constitution Principle II): every behavior lands red→green — the failing test task precedes its implementation task, and the failing run must be observed before implementation begins.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is an independently completable, independently testable increment. All MCP tool implementation tasks touch the same file (`src/server/mcp/tools.ts`), so no two of those are ever parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Confirm a green starting point — this feature adds no project scaffolding, no dependency, no schema change, and no migration.

- [X] T001 Confirm green baseline before any change: run `npm run lint && npm run typecheck && npm run test && npm run build` at the repo root and verify all four pass, so every later red test is red because of this feature's TDD step, not pre-existing breakage. Also confirm `config/person-fields.json` defines `"Nickname"` (the field configuration the unknown-field tests validate against).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None required — intentionally empty. Everything the stories need is already shipped: the mcp-authentik-auth bearer gate at `POST /mcp` (FR-001, research D10), the `McpServer` registry in `src/server/mcp/tools.ts`, the services (`createPerson`, `updatePerson`, `addEntry`, `markPrimary`, `removeEntry`), the DB invariants (unique-value and one-primary indexes, data-model.md), and the MCP integration-test harness (`tests/integration/helpers/oauth-client.ts` + the `mcp-read-tools.test.ts` pattern). Shared tool-layer shapes (`contactEntrySchema`, `personDetailSchema`, person-detail assembly, the extra-field-name guard) are built inside US1 — their first consumer — under TDD, and reused by US3/US4/US5.

**Checkpoint**: T001 green — user story implementation can begin.

---

## Phase 3: User Story 1 - Agent creates a person (Priority: P1) 🎯 MVP

**Goal**: An authorized agent creates a fully populated person (names, at most one email, at most one phone, extra configured fields) via a new `create-person` MCP tool — indistinguishable from a UI-created person, linking an unlinked synced address when the email matches, rejecting invalid input with holder-identifying duplicate errors (FR-002–FR-007).

**Independent Test**: With a seeded synced store and a field configuration defining "Nickname", call `create-person` with valid and invalid inputs and confirm via the People page, the person record, and existing person-query capabilities that exactly the valid calls produced people, with all values intact after a reload.

### Tests for User Story 1 (write first, observe failure)

- [X] T002 [P] [US1] Add failing service-seam tests to `tests/integration/people.test.ts`: `createPerson` returning `{ ok: false, error: 'email-conflict' }` also carries `holder: { id, name }` identifying the person who holds the email (matched case-insensitively, e.g. seeded `sam.rivera@example.com` vs input `Sam.Rivera@example.com` → holder name "Sam Rivera"), and the `phone-conflict` variant likewise carries the holder for an exact-text phone match (data-model.md `CreatePersonResult`). Run the file and record the failures.
- [X] T003 [P] [US1] Create `tests/integration/mcp-people-write-tools.test.ts` (MCP harness per `tests/integration/mcp-read-tools.test.ts` + `tests/integration/helpers/oauth-client.ts`; synced-mail seeding per `tests/integration/email-person-linking.test.ts`) with failing `create-person` tests: (AS1) full create — firstName "Jordan", lastName "Smith", email, phone, extraFields `{ Nickname: "Jo" }` → success text `Created person "Jordan Smith".`, `structuredContent` matches `personDetailSchema` (scalars + `emails`/`phones` arrays each with one primary entry), and a follow-up `get-person` returns the same person; (AS2) creating with an email present in synced mail but unlinked links the existing `email_addresses` row (same row id, stored casing preserved) and `emails-for-person` now returns the seeded message; (AS3) duplicate email in different case fails with `That email is already in use by Sam Rivera`, no person created; (AS4) whitespace-only firstName fails with `First and last name are required`, and an unconfigured extra field fails with `Unknown field "Favorite Color"`, no person created either time; duplicate phone fails with `That phone number is already in use by …` naming the holder; edge cases — names-only create (no email, no phone) succeeds; explicitly blank/whitespace `email` or `phone` fails with `A value is required` (contracts error catalog); a tokenless `POST /mcp` call cannot reach the tool (401, nothing created — research D10). Run the file and record the failures.

### Implementation for User Story 1

- [X] T004 [US1] Enrich `createPerson` conflict results in `src/server/services/people.ts`: extend the email-conflict lookup (via `findEmailAddressByValue` in `src/server/services/contact-entries.ts`, which already returns `personId`) and the phone-conflict lookup to resolve the holding person and return `holder: { id, name }` with `name` = `"${firstName} ${lastName}"` (research D3); REST routes in `src/server/routes/people.ts` keep their existing messages and simply ignore `holder` (zero UI change). T002 tests go green; existing suites stay green.
- [X] T005 [US1] Implement `create-person` in `src/server/mcp/tools.ts` per `contracts/mcp-tools.md`: add the shared `contactEntrySchema` and `personDetailSchema` zod shapes and a person-detail assembly helper (loads a person with full `emails`/`phones` entry lists, `extraFields`, `tags`); input schema with MCP-strict optional contacts (`z.string().trim().min(1, 'A value is required').optional()` — research D6); validation order names → extra-field names (reject any key not in `context.personFields`, listing every offending name quoted and comma-separated — research D4) → contact-value presence → uniqueness with holder-naming messages; call the `createPerson` service; return success text plus `structuredContent`, errors as `{ content: [{ type: 'text', text }], isError: true }`. T003 tests go green.
- [X] T006 [US1] Capture browser evidence for US1's UI-surface criteria via the `browser-tester` agent against the dev server (`npm run dev`, API http://localhost:3015, UI http://localhost:5115) after driving the MCP calls against that server, filed under `docs/evidence/mcp-people-tools/`: agent-created person listed on the People page; their record showing the email and phone (each marked primary) and Nickname "Jo", still intact after a page reload (SC-001, FR-014); the seeded conversation's detail view showing the address linked to the new person, and the person record's email section showing the seeded conversation "Quote attached" (AS2).

**Checkpoint**: `create-person` fully functional — an agent can create first-class people. MVP deliverable.

---

## Phase 4: User Story 2 - Agent discovers unlinked synced addresses (Priority: P2)

**Goal**: A new zero-argument `list-unlinked-addresses` MCP tool returns every synced-mail address linked to no person — message count across all roles, most recently seen display name, most recent message date — ordered by message count descending, complete and unsuppressed, reflecting link changes immediately (FR-015–FR-017).

**Independent Test**: Seed a synced store with linked and unlinked addresses at differing message counts, call the discovery capability, create a person for one listed address, and call it again — confirming content, ordering, and the address's disappearance. (Run standalone before US1, the "create a person" step can link via the shipped `createPerson` service; in priority order it uses the `create-person` tool per the spec scenario.)

### Tests for User Story 2 (write first, observe failure)

- [X] T007 [US2] Create `tests/integration/mcp-unlinked-addresses.test.ts` (same MCP harness and synced-mail seeding patterns as T003) with failing tests: (AS1) with sam.rivera@example.com linked (5 messages), jordan.smith@example.com unlinked (3 messages, display name "Jordan Smith", most recent 2026-08-05) and news@example.com unlinked (1 message, most recent 2026-08-06), the tool lists jordan before news with `{ address, messageCount, displayName, lastMessageAt }` values as seeded and sam absent; after creating person "Jordan Smith" with that email via `create-person`, a second call no longer lists jordan while news remains (FR-016); full drain (SC-003) — continue creating a person for every remaining listed address via `create-person` only (no UI action, no direct service call) until a final call returns `{ addresses: [] }`, then confirm `emails-for-person` for each created person returns their address's seeded messages; ordering — messageCount DESC, then lastMessageAt DESC, then address ASC for ties; display name is the most recently seen non-empty one (seed the same address with an older name and a newer name — the newer wins) and the bare address when mail never carried a name; nothing suppressed — the mailbox owner's own address appears like any other unlinked address (FR-017); empty store and all-linked store both return `{ addresses: [] }`, not an error; the call succeeds with `arguments` omitted entirely (contracts); a tokenless call is rejected with 401. Run the file and record the failures.

### Implementation for User Story 2

- [X] T008 [US2] Implement `listUnlinkedAddresses(db)` in `src/server/services/email/queries.ts` per research D7: one SQL aggregate over `email_addresses` rows with `person_id IS NULL` joined through `email_participants` to `email_messages`, returning `UnlinkedAddressSummary` rows (data-model.md) — `address` (stored casing), `messageCount` = `COUNT(DISTINCT message_id)` across all roles, `lastMessageAt` = `MAX(sent_at)` epoch ms, `displayName` picked via the `ORDER BY (display_name = '') ASC, sent_at DESC` pattern already used in `participantsForConversation` with the bare address as fallback — ordered `messageCount DESC, lastMessageAt DESC, address ASC`.
- [X] T009 [US2] Register `list-unlinked-addresses` in `src/server/mcp/tools.ts` per `contracts/mcp-tools.md`: zero-arg input schema that also accepts a call omitting `arguments`; output `{ addresses: [...] }`; success text `Found N unlinked address(es).`. T007 tests go green. (No browser task — US2 is MCP-only; recorded vitest output is its evidence.)

**Checkpoint**: The sweep's worklist exists — an agent can enumerate and drain unlinked addresses end to end with US1.

---

## Phase 5: User Story 3 - Agent manages a person's email addresses and phone numbers (Priority: P3)

**Goal**: Three new MCP tools — `add-contact-entry`, `mark-contact-primary`, `remove-contact-entry` — maintain a person's contact lists under exactly the UI's semantics: one primary per type whenever entries exist, promotion on primary removal, synced-address linking on add, holder-identifying duplicate rejection, synced mail never touched (FR-009–FR-013).

**Independent Test**: Take seeded people with known contact lists, perform add / mark-primary / remove sequences including duplicate attempts, and confirm each person's record (and its reload-persistence) after every step.

### Tests for User Story 3 (write first, observe failure)

- [X] T010 [P] [US3] Add failing service-seam tests to `tests/integration/contact-entries.test.ts`: `addEntry` returning `{ ok: false, error: 'conflict' }` also carries `holder: { id, name }` (data-model.md `EntryMutationResult`) — for an email held by another person (case-insensitive match), a phone held by another person (exact text), and the edge case where the target person already holds the value themselves (holder identifies that same person). Run the file and record the failures.
- [X] T011 [P] [US3] Extend `tests/integration/mcp-people-write-tools.test.ts` with failing tests for the three contact tools: (AS1) add email → both listed, original still primary; mark new one primary → marker moved; remove original → only the new address remains, primary; (AS2) adding an email that exists unlinked in synced mail links the existing row — `emails-for-person` now returns the previously synced messages with the address's role tagged — and adding an email held by "Sam Rivera" fails with `That email is already in use by Sam Rivera` leaving the target's lists unchanged; (AS3) add phone + mark primary persists, and adding a phone held by "Ana Alvarez" fails with `That phone number is already in use by Ana Alvarez`; edge cases — adding a value the target person already holds (including the same email in different letter case) fails with the duplicate message naming that same person as the holder (spec edge case, MCP-layer counterpart of T010's service-seam case); marking the current primary again succeeds as a no-op; removing the primary while others remain promotes one automatically (lowest id per data-model.md); removing the last entry of a type is valid and leaves none; removing a mail-referenced address reverts it to unlinked (`emails-for-person` stops returning its messages, `email_messages`/`email_participants` rows untouched, and it reappears in `list-unlinked-addresses`); blank value on add fails with `A value is required`; unknown person → `Person 42 not found`; unknown entry id or an entry belonging to a different person → `Entry 7 not found`; every mutation response is `{ personId, type, entries }` with the full post-change list. Run and record the failures.

### Implementation for User Story 3

- [X] T012 [US3] Enrich `addEntry`'s conflict result in `src/server/services/contact-entries.ts`: on conflict, resolve the holding person (email via the existing case-insensitive row lookup, phone via the exact-text lookup) and return `holder: { id, name }` (research D3); REST routes keep their existing messages and ignore `holder`. T010 tests go green; existing suites stay green.
- [X] T013 [US3] Implement `add-contact-entry`, `mark-contact-primary`, and `remove-contact-entry` in `src/server/mcp/tools.ts` per `contracts/mcp-tools.md`: each takes `personId` + `type: 'email' | 'phone'` (+ `value` or `entryId`), dispatches to `addEntry` / `markPrimary` / `removeEntry` with the matching entry table, returns `{ personId, type, entries }` with the contracts' success texts, and maps service errors to the catalog messages (`Person N not found`, `Entry N not found`, `A value is required`, holder-naming duplicates). T011 tests go green.
- [X] T014 [US3] Capture browser evidence for US3's UI-surface criteria via the `browser-tester` agent (same setup as T006), filed under `docs/evidence/mcp-people-tools/`: a person's record showing the contact lists after add / mark-primary / remove sequences with primary markers matching what the agent set, still true after a page reload (SC-005, FR-014).

**Checkpoint**: Full contact-list management — real multi-address, multi-phone records are now maintainable by an agent.

---

## Phase 6: User Story 4 - Agent edits a person's names and extra fields (Priority: P4)

**Goal**: A new `update-person` MCP tool partially edits first name, last name, and extra configured field values under creation's validation rules — omitted inputs keep current values, provided `extraFields` merge, empty-string clears a field, contact lists unreachable through this path (FR-008, FR-013; research D5).

**Independent Test**: Edit a seeded person's last name and an extra field value and confirm the People page and record after a reload; attempt an edit blanking a required name and confirm rejection with the person unchanged.

### Tests for User Story 4 (write first, observe failure)

- [X] T015 [US4] Extend `tests/integration/mcp-people-write-tools.test.ts` with failing `update-person` tests: (AS1) changing lastName to "Smith-Lee" and Nickname to "JS" succeeds with text `Updated person "Jordan Smith-Lee".` and `structuredContent` per `personDetailSchema`, firstName untouched; (AS2) setting lastName to `""` (and a whitespace-only name) fails with `First and last name are required` and `get-person` shows the person unchanged; an unconfigured extra-field key fails with `Unknown field "…"` leaving the person unchanged; provided `extraFields` keys merge over current ones — omitted keys survive, an empty-string value clears that field; a call providing only `personId` is a valid no-op returning the current person; unknown person → `Person 42 not found`. Run and record the failures.

### Implementation for User Story 4

- [X] T016 [US4] Implement `update-person` in `src/server/mcp/tools.ts` per `contracts/mcp-tools.md` and research D5: input `personId` + optional `firstName` / `lastName` / `extraFields`; provided names must be non-blank; validate extra-field names with the US1 guard; load the current person, merge provided values over current state, call the unchanged `updatePerson` service (whose `normalizeExtraFields` dropping empty values is exactly the clear semantics); return the shared person-detail shape. T015 tests go green.
- [X] T017 [US4] Capture browser evidence for US4's UI-surface criteria via the `browser-tester` agent (same setup as T006), filed under `docs/evidence/mcp-people-tools/`: the People page showing the edited name and the person record showing the updated Nickname, both still true after a page reload (FR-008, FR-014).

**Checkpoint**: Agents can maintain existing records, not just create them.

---

## Phase 7: User Story 5 - Full contact lists on person fetch (Priority: P5)

**Goal**: `get-person` returns every email address and phone number with the primary of each type marked (additive `emails`/`phones` arrays alongside the existing scalars), while `search-people` result rows stay primary-only (FR-018, FR-019; research D9).

**Independent Test**: Seed a person with two addresses and two phones, fetch them by id and find them via search, and compare which contact values each response carries.

### Tests for User Story 5 (write first, observe failure)

- [X] T018 [US5] Extend `tests/integration/mcp-read-tools.test.ts` with failing tests: for a seeded person with addresses sam.rivera@example.com (primary) + sam.personal@example.com and phones "555-0100" (primary) + "555-0101", `get-person` returns `emails` and `phones` arrays of `{ id, value, isPrimary }` with exactly one primary each while keeping the existing scalar `email` / `phone` primaries, `extraFields`, and `tags`; `search-people` for "sam" still returns rows carrying only the primary email and phone with no `emails`/`phones` arrays (FR-019). Run and record the failures.

### Implementation for User Story 5

- [X] T019 [US5] Expand the `get-person` handler in `src/server/mcp/tools.ts` to return the shared person-detail shape via the US1 assembly helper (output schema updated to `personDetailSchema`), leaving `search-people` untouched. T018 tests go green; pre-existing `mcp-read-tools.test.ts` scalar assertions stay green (backward compatibility, research D9). (No browser task — US5 is MCP-only; recorded vitest output is its evidence.)

**Checkpoint**: All five stories complete — the agent's read picture matches its write powers.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification, evidence recording, and independent confirmation per the constitution's definition of done.

- [X] T020 Run the quickstart's feature-suite command — `npx vitest run tests/integration/mcp-people-write-tools.test.ts tests/integration/mcp-unlinked-addresses.test.ts tests/integration/mcp-read-tools.test.ts tests/integration/people.test.ts tests/integration/contact-entries.test.ts` — and record the passing output under `docs/evidence/mcp-people-tools/` as the automated-check evidence for MCP-only criteria (SC-002, SC-003, SC-004, FR-015–FR-019).
- [X] T021 Run the full verification gate `npm run lint && npm run typecheck && npm run test && npm run build` and confirm all four green, including every pre-existing suite untouched — demonstrating REST routes, UI behavior, and `search-people` unchanged (FR-019, FR-020, SC-006 parity boundary; quickstart checklist).
- [X] T022 Dispatch the `verifier` agent to independently re-check every acceptance criterion in `specs/015-mcp-people-tools/spec.md` against both evidence kinds (recorded automated output + browser evidence in `docs/evidence/mcp-people-tools/`) before reporting the feature done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Intentionally empty — nothing blocks the stories beyond T001.
- **User Stories (Phases 3–7)**: Execute in priority order US1 → US2 → US3 → US4 → US5. Every MCP implementation task (T005, T009, T013, T016, T019) edits `src/server/mcp/tools.ts`, so stories serialize at the tool registry even though their test files differ.
- **Polish (Phase 8)**: After all user stories.

### User Story Dependencies

- **US1 (P1)**: Independent — also builds the shared tool-layer shapes (`contactEntrySchema`, `personDetailSchema`, person-detail assembly, extra-field guard) that US3/US4/US5 reuse.
- **US2 (P2)**: Independent of US1's implementation; its link-reactivity test (T007) uses the `create-person` tool per the spec scenario, so in practice it runs after US1 (standalone fallback: link via the shipped `createPerson` service).
- **US3 (P3)**: Independent at the service seam (T010/T012); its tools (T013) reuse US1's shared shapes.
- **US4 (P4)**: Reuses US1's guards and person-detail shape.
- **US5 (P5)**: Reuses US1's person-detail assembly.

### Within Each User Story

- Test tasks are written and observed failing before their implementation tasks (constitution Principle II — code written before its failing test is discarded).
- Service-seam enrichment (T004, T012) before the MCP tool that formats its holder into an error message.
- Browser-evidence tasks (T006, T014, T017) after the story's implementation is green.

### Parallel Opportunities

- **US1**: T002 and T003 (different test files, both red-first) can be written in parallel.
- **US3**: T010 and T011 (different test files) can be written in parallel.
- Everything touching `src/server/mcp/tools.ts` or the same test file is strictly sequential; browser-evidence tasks can overlap with the next story's test-writing once their story is green.

---

## Parallel Example: User Story 1

```bash
# Write both red test suites for User Story 1 together:
Task: "Add failing conflict-holder tests to tests/integration/people.test.ts"          # T002
Task: "Create tests/integration/mcp-people-write-tools.test.ts with failing create-person tests"  # T003

# Then implement sequentially: T004 (service enrichment) → T005 (create-person tool) → T006 (browser evidence)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (T001 baseline).
2. Phase 3: US1 red tests (T002, T003) → observed failures → service enrichment (T004) → `create-person` tool (T005) → browser evidence (T006).
3. **STOP and VALIDATE**: `create-person` alone already lets an agent build the People list from known addresses — deployable as an MVP increment.

### Incremental Delivery

1. US1 → agents create first-class people (MVP).
2. US2 → the sweep worklist: discover-then-create end to end (SC-003 achievable).
3. US3 → multi-email/multi-phone records maintainable.
4. US4 → name and field maintenance.
5. US5 → full read parity for verification-by-agent.
6. Polish (T020–T022) → recorded evidence + verifier confirmation, then PR.

Each story leaves every prior suite green; the feature is shippable at any checkpoint boundary.

---

## Notes

- No schema change and no migration anywhere in this feature (research D11) — if any task appears to need DDL, stop and re-check the plan.
- `src/shared/validation.ts` is listed in plan.md as "MODIFIED (if needed)"; research D6 resolved the strict contact-value schema to live at the tool layer in `src/server/mcp/tools.ts`, so tasks touch the shared schemas only if implementation reveals a genuine need.
- FR-013 (no in-place value edit) and FR-020 (no person deletion) are satisfied by omission — no task registers such tools; T021 confirms no agent power the UI lacks.
- Commit after each red→green pair or logical group (Conventional Commits); the feature lands as one PR from `015-mcp-people-tools`.
