# Tasks: Card–Email Links

**Input**: Design documents from `/specs/020-card-email-links/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, contracts/http-api.md, quickstart.md

**Tests**: Included — TDD is NON-NEGOTIABLE per the constitution (Principle II). Every implementation task is preceded by a task that writes its failing test; code written before its failing test is discarded.

**Organization**: Tasks are grouped by user story so each story is an independently completable, independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US5)
- Every task names its exact file path(s)

## Path Conventions

Single TypeScript web app at repository root: Vue SPA in `src/client/`, Fastify API in `src/server/`, MCP server in `src/server/mcp/`, shared types in `src/shared/`, migrations in `drizzle/`, tests in `tests/integration/` and `tests/component/`.

---

## Phase 1: Setup

**Purpose**: Confirm the worktree starts from a green baseline so every later red is caused by this feature's failing-first tests.

- [X] T001 Verify baseline gate passes in the worktree: run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; all four must pass before any feature work begins

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `task_conversations` join table, its additive migration, and the shared summary types — every user story depends on this storage layer existing.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Extend `tests/integration/migration-upgrade.test.ts` with a failing parity assertion: both a fresh DB and an upgraded production-shaped DB must contain `task_conversations` with composite PK (`task_id`, `conversation_id`), FKs to `tasks.id` and `email_conversations.id` (both `ON DELETE CASCADE`), and the `task_conversations_conversation_id` index (data-model.md); run it and confirm it fails
- [X] T003 Add the `taskConversations` table to `src/server/db/schema.ts`, mirroring the `taskCompanies` shape (`schema.ts:225-236`): `taskId` FK → `tasks.id` cascade, `conversationId` FK → `email_conversations.id` cascade, composite primary key on the pair, index on `conversationId` (research D1)
- [X] T004 Generate the migration with `npx drizzle-kit generate` producing `drizzle/0004_*.sql`; review the SQL is purely additive (single `CREATE TABLE` + index, migrations `0000`–`0003` untouched); confirm the T002 parity test now passes (research D8)
- [X] T005 [P] Add `LinkedConversationSummary` (`{ id, subject, participants: EmailParticipantSummary[], latestMessageAt }`) and `LinkedCardSummary` (`{ id, title, lane }`) interfaces to `src/shared/types.ts` per data-model.md — new interfaces only; `TaskDetail`/`EmailConversationDetail` are extended in US1 alongside the services that populate them

**Checkpoint**: Migration parity test green, schema exports `taskConversations`, shared summary types exist — user story implementation can begin.

---

## Phase 3: User Story 1 — Agent links a conversation to a card and the link is visible everywhere (Priority: P1) 🎯 MVP

**Goal**: An authorized agent calls `link-conversation-to-task`; the link then appears in the `get-task` and `get-conversation` MCP responses, both HTTP detail endpoints, and both web detail views (many-to-many, persisted).

**Independent Test**: Seed a card and a `FakeMailProvider`-synced conversation, call the link tool as an authorized agent, then verify both MCP detail responses and both web detail views show the link, including after a page reload.

### Tests for User Story 1 (write first — must FAIL before implementation)

- [X] T006 [P] [US1] Create `tests/integration/task-conversation-links.test.ts` with failing service + HTTP tests: `linkConversationToTask` inserts one join row and returns `{ ok: true, task }`; `conversationsForTask` returns `LinkedConversationSummary[]` with earliest-message subject, `participantsForConversation` rollup, `MAX(sent_at)` as `latestMessageAt`, ordered `latestMessageAt DESC, id DESC`; `cardsForConversation` returns `{ id, title, lane }[]` ordered `title COLLATE NOCASE`; `getTaskDetail` includes `conversations`; `getConversation` includes `cards`; `GET /api/tasks/:id` and `GET /api/emails/conversations/:id` (via `app.inject()`) include the new fields and `[]` when unlinked; links survive re-querying on a reopened DB (FR-011); seed conversations via `FakeMailProvider` sync per research D10
- [X] T007 [P] [US1] Create `tests/integration/mcp-conversation-link-tools.test.ts` with failing MCP tests via the real SDK `Client` through `connectThroughApproval`: `link-conversation-to-task` happy path returns full task detail (same output schema as `get-task`) with the conversation in `conversations` and text ``Linked conversation "<subject>" to task "<title>".``; `get-task` and `get-conversation` responses carry the link fields; the many-to-many scenario from US1 acceptance scenario 2 (card with two conversations, conversation with two cards — every view lists all); an unauthenticated `tools/call` to the new tool is rejected at the transport (research D9); seed via `FakeMailProvider` + `create-task`
- [X] T008 [P] [US1] Create `tests/component/linked-conversations.test.ts` with failing @testing-library/vue tests: given `conversations` props, `LinkedConversations.vue` renders one entry per conversation showing subject (via `subjectOrPlaceholder`), participant names (person name where linked, else non-empty display name, else address), and `latestMessageAt` via `absoluteLocal`
- [X] T009 [P] [US1] Create `tests/component/linked-cards.test.ts` with failing @testing-library/vue tests: given `cards` props, `LinkedCards.vue` renders one entry per card showing title and lane

### Implementation for User Story 1

- [X] T010 [US1] Create `src/server/services/task-conversations.ts` with `linkConversationToTask(db, taskId, conversationId)` (validate task exists, then conversation, then no existing pair — in that order; plain insert, no `onConflictDoNothing`; returns `LinkConversationResult` per data-model.md), `conversationsForTask(db, taskId)`, and `cardsForConversation(db, conversationId)` reusing the earliest-subject / `MAX(sent_at)` / `participantsForConversation` query shapes from `src/server/services/email/queries.ts` — note `participantsForConversation` is currently module-private in `queries.ts`; add `export` to it rather than duplicating the query (research D2, D4, D5); make T006's service tests pass
- [X] T011 [US1] Extend `getTaskDetail` in `src/server/services/tasks.ts` to include `conversations: conversationsForTask(...)` and add `conversations: LinkedConversationSummary[]` to `TaskDetail` in `src/shared/types.ts`; `GET /api/tasks/:id` picks it up with no route change (contracts/http-api.md); make T006's task-detail + HTTP tests pass
- [X] T012 [US1] Extend `getConversation` in `src/server/services/email/queries.ts` to include `cards: cardsForConversation(...)` and add `cards: LinkedCardSummary[]` to `EmailConversationDetail` in `src/shared/types.ts`; `GET /api/emails/conversations/:id` picks it up with no route change; make T006's conversation-detail + HTTP tests pass (depends on T011 for the shared-types file)
- [X] T013 [US1] In `src/server/mcp/tools.ts`, register `link-conversation-to-task` (inputs `taskId`, `conversationId`, positive ints; success returns `taskDetailOutputSchema`) and extend `taskDetailOutputSchema` with the `conversations` array and the `get-conversation` output schema with the `cards` array per contracts/mcp-tools.md; make T007's happy-path and detail-field tests pass
- [X] T014 [P] [US1] Create `src/client/components/LinkedConversations.vue`: read-only list of `RouterLink` entries to `/emails/:id`, each showing subject, participant names, and latest-message date; props in, navigation out, no callbacks and no buttons (research D7); make T008's entry tests pass
- [X] T015 [P] [US1] Create `src/client/components/LinkedCards.vue`: read-only list of `RouterLink` entries to `/tasks/:id`, each showing title and lane; no callbacks and no buttons; make T009's entry tests pass
- [X] T016 [US1] Add a failing assertion to `tests/component/task-detail.test.ts` that the task detail page renders an "Emails" section, then add the section to `src/client/pages/TaskDetailPage.vue` hosting `LinkedConversations` with the detail response's `conversations`, following the existing `task-detail-section` stacking (research D7)
- [X] T017 [US1] Add a failing assertion to `tests/component/email-conversation-page.test.ts` that the conversation page renders a "Cards" section, then add the section to `src/client/pages/EmailConversationPage.vue` hosting `LinkedCards` with the detail response's `cards`
- [X] T018 [US1] Run the US1 suites and confirm green: `npx vitest run tests/integration/task-conversation-links.test.ts tests/integration/mcp-conversation-link-tools.test.ts tests/component/linked-conversations.test.ts tests/component/linked-cards.test.ts tests/component/task-detail.test.ts tests/component/email-conversation-page.test.ts` plus `npm run typecheck`

**Checkpoint**: User Story 1 fully functional — an agent can link, and the link is visible in all four surfaces. MVP deliverable.

---

## Phase 4: User Story 2 — Tyler traces links in the web app (Priority: P2)

**Goal**: Styled empty states when nothing is linked, one-click cross-navigation between linked entries, and a strictly read-only UI (no link create/remove controls anywhere).

**Independent Test**: With a seeded linked pair and a seeded unlinked pair, open both detail views and verify the populated sections, the styled empty states, and the cross-navigation clicks.

### Tests for User Story 2 (write first — must FAIL before implementation)

- [X] T019 [P] [US2] Extend `tests/component/linked-conversations.test.ts` with failing tests: empty `conversations` renders the styled "No linked emails" empty state (not a blank gap — SC-005); each entry's link resolves to `/emails/<id>` (FR-009); the component renders no button or any control that creates/removes links (FR-010)
- [X] T020 [P] [US2] Extend `tests/component/linked-cards.test.ts` with failing tests: empty `cards` renders the styled "No linked cards" empty state; each entry's link resolves to `/tasks/<id>`; no write controls rendered

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement the empty state and section styling in `src/client/components/LinkedConversations.vue`: muted styled "No linked emails" message matching the host page's section conventions (dark-theme scoped CSS, no pure black, muted rgba secondary text — research D7); make T019 pass
- [X] T022 [P] [US2] Implement the empty state and section styling in `src/client/components/LinkedCards.vue`: muted styled "No linked cards" message, same conventions; make T020 pass

**Checkpoint**: Both sections show deliberate empty states, navigate on click, and offer no write controls — User Stories 1 and 2 both independently pass.

---

## Phase 5: User Story 3 — Agent unlinks a conversation without losing anything (Priority: P2)

**Goal**: `unlink-conversation-from-task` removes only the join row — the card stays on the board, the conversation keeps all its messages, and the pair can be re-linked.

**Independent Test**: Seed a card linked to two conversations, unlink both via the MCP tool, then verify both empty states return and the card and conversations are otherwise intact.

### Tests for User Story 3 (write first — must FAIL before implementation)

- [X] T023 [P] [US3] Extend `tests/integration/task-conversation-links.test.ts` with failing tests: `unlinkConversationFromTask` deletes exactly one join row and returns `{ ok: true, task }`; after unlinking, task/conversation/message counts equal their pre-link values (SC-004); the card row and all conversation messages are unchanged (FR-012); the same pair can be re-linked afterwards
- [X] T024 [P] [US3] Extend `tests/integration/mcp-conversation-link-tools.test.ts` with failing tests: `unlink-conversation-from-task` happy path returns full task detail with the conversation absent from `conversations` and text ``Unlinked conversation "<subject>" from task "<title>".``; after unlinking both of a card's conversations, `get-task` shows `conversations: []` and each `get-conversation` shows `cards: []`

### Implementation for User Story 3

- [X] T025 [US3] Add `unlinkConversationFromTask(db, taskId, conversationId)` to `src/server/services/task-conversations.ts`: validate task exists, then conversation, then the link row exists — in that order; delete the one join row; returns `UnlinkConversationResult` per data-model.md; make T023 pass
- [X] T026 [US3] Register `unlink-conversation-from-task` in `src/server/mcp/tools.ts` (same input schema as the link tool; success returns `taskDetailOutputSchema`) per contracts/mcp-tools.md; make T024 pass

**Checkpoint**: Links are fully reversible and unlinking is non-destructive — Stories 1–3 all pass independently.

---

## Phase 6: User Story 4 — Bad link requests fail clearly and change nothing (Priority: P3)

**Goal**: Duplicate links, unknown ids, and unlinking a non-linked pair each fail with the exact contract error message and leave stored links byte-for-byte unchanged.

**Independent Test**: Seed one existing link, replay the same link call and a call with a fabricated conversation id, and verify both errors and the unchanged single entry.

### Tests for User Story 4 (write first — must FAIL before implementation)

- [X] T027 [US4] Extend `tests/integration/mcp-conversation-link-tools.test.ts` with failing error-path tests per contracts/mcp-tools.md: duplicate link → `isError` with `Task <taskId> is already linked to conversation <conversationId>` (FR-005); link/unlink with nonexistent conversation id → `Conversation <conversationId> not found`; with nonexistent task id → `Task <taskId> not found` (FR-006, spec edge case); unlink of a not-linked pair → `Task <taskId> is not linked to conversation <conversationId>`; after every error the `task_conversations` rows are exactly as before and `get-task` still lists exactly one linked conversation (SC-003)

### Implementation for User Story 4

- [X] T028 [US4] Complete the error branches: ensure `linkConversationToTask`/`unlinkConversationFromTask` in `src/server/services/task-conversations.ts` return `task-not-found` / `conversation-not-found` / `already-linked` / `link-not-found` per data-model.md, and both tools in `src/server/mcp/tools.ts` map each to the contract message via the house `toolError` helper (research D2, D3); make T027 pass

**Checkpoint**: Every invalid attempt errors specifically and mutates nothing — agent automation is trustworthy.

---

## Phase 7: User Story 5 — Agent creates a card from an email and links it (Priority: P3)

**Goal**: The composed workflow — existing `create-task` (unchanged) followed by `link-conversation-to-task` — yields a card in the board's first lane ("To Do") with the conversation linked both ways.

**Independent Test**: With a seeded unlinked conversation, call `create-task` then the link tool as an authorized agent, and verify the new card's lane, its `conversations` field, and the conversation's `cards` field.

### Tests for User Story 5

- [X] T029 [US5] Extend `tests/integration/mcp-conversation-link-tools.test.ts` with the composed-flow test: `create-task` with title "Send Sam the quote" (no conversation parameter exists on the tool — FR-014) then `link-conversation-to-task` for the seeded conversation; assert the new card sits in the "To Do" lane via `list-board`, `get-task` lists the conversation, and `get-conversation` lists the new card with lane "To Do" (US5 acceptance scenario). This composes only shipped behavior, so it may pass immediately — that is the assertion, not a TDD violation; if it fails, fix the US1/US3 code it exposes
- [X] T030 [US5] Add regression assertions to `tests/integration/mcp-conversation-link-tools.test.ts`: with links present, the `list-board` response contains no link/conversation data and the `list-conversations` response contains no card/link data (FR-013) — response shapes identical to their pre-feature contracts

**Checkpoint**: The end-to-end agent workflow the feature exists for is proven, and the list surfaces are pinned unchanged.

---

## Phase 8: Polish & Evidence Gate

**Purpose**: Cross-cutting edge cases, the full verification gate, and the constitution's evidence requirements (Principle III).

- [X] T031 [P] Extend `tests/integration/task-conversation-links.test.ts` with the cascade edge case: delete a card that has links → its `task_conversations` rows are gone, the conversations and all their messages remain intact (spec edge case; `pragma foreign_keys = ON` cascade per research D1); the new-synced-message edge case: after syncing a new reply into a linked conversation via `FakeMailProvider`, the link survives and `conversationsForTask` reflects the updated `latestMessageAt`; and the many-links edge case: a card linked to 5+ conversations and a conversation linked to 5+ cards each return every entry in the detail responses — no truncation (FR-015, spec edge case)
- [X] T032 Run the full gate and fix anything red: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (quickstart.md)
- [X] T033 Launch the dev server (`npm run dev`, API 3020 / UI 5120) and dispatch the `browser-tester` agent through the quickstart scenario walk (empty states → link → populated sections with subject/participants/date and title/lane → cross-navigation clicks → no write controls → unlink → empty states return, all with reloads); evidence lands in `docs/evidence/020-card-email-links/`
- [X] T034 Record the automated-check output for MCP-only criteria (tool errors, detail fields, unchanged list responses, unauthenticated rejection) into `docs/evidence/020-card-email-links/` alongside the browser evidence
- [X] T035 Dispatch the `verifier` agent to independently re-check every acceptance criterion in `specs/020-card-email-links/spec.md` against the evidence and re-run the checks; fix and re-verify anything it rejects

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. Internally: T002 (failing test) → T003 (schema) → T004 (migration, makes T002 green); T005 is parallel to T003/T004.
- **US1 (Phase 3)**: Depends on Foundational. Tests T006–T009 first (parallel), then T010 → T011 → T012 → T013 (server chain; T011/T012 share `src/shared/types.ts` and T010's service), T014/T015 in parallel after T008/T009, T016 after T014 and T011, T017 after T015 and T012, T018 last.
- **US2 (Phase 4)**: Depends on US1's components (T014, T015). T019/T020 parallel, then T021/T022 parallel.
- **US3 (Phase 5)**: Depends on US1's service and tools (T010, T013). T023/T024 parallel, then T025 → T026.
- **US4 (Phase 6)**: Depends on US1 and US3 (both tools must exist). T027 → T028.
- **US5 (Phase 7)**: Depends on US1 (link tool + detail fields). T029 → T030.
- **Polish (Phase 8)**: T031 after US3; T032–T035 after all stories, in order (gate → browser evidence → recorded output → verifier).

### User Story Dependencies

- **US1 (P1)**: Only Foundational — the MVP.
- **US2 (P2)**: Builds on US1's components; independently testable with seeded links.
- **US3 (P2)**: Inverse of US1; needs US1's service/tool registration but tests independently.
- **US4 (P3)**: Error paths across both tools — needs US1 + US3.
- **US5 (P3)**: Pure composition of US1 + existing `create-task`; no new capability.

### Parallel Opportunities

- Phase 2: T005 alongside T003/T004.
- Phase 3: T006, T007, T008, T009 together (four different new test files); later T014 ∥ T015.
- Phase 4: T019 ∥ T020, then T021 ∥ T022.
- Phase 5: T023 ∥ T024.
- Phase 8: T031 can start as soon as US3 is done, in parallel with US4/US5 work.
- After Foundational, US2 UI polish and US3 unlink work touch disjoint files and could proceed in parallel once US1's shared files (components, service, tools.ts) exist.

---

## Parallel Example: User Story 1

```text
# After Phase 2, launch all four failing-test tasks together:
Task T006: tests/integration/task-conversation-links.test.ts
Task T007: tests/integration/mcp-conversation-link-tools.test.ts
Task T008: tests/component/linked-conversations.test.ts
Task T009: tests/component/linked-cards.test.ts

# After T010–T013 land, build both components together:
Task T014: src/client/components/LinkedConversations.vue
Task T015: src/client/components/LinkedCards.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline gate) → Phase 2 (table + migration + types).
2. Phase 3 in full: failing tests, service, detail fields, MCP tool, components, page sections.
3. **STOP and VALIDATE**: run T018's suite list; an agent can link and the link is visible on all four surfaces — this alone is shippable value.

### Incremental Delivery

1. Foundation → US1 (MVP: link + visibility) → validate.
2. US2 (empty states + navigation + read-only pinning) → validate.
3. US3 (unlink, non-destructive) → validate.
4. US4 (error discipline) → US5 (composed create-then-link flow + list-surface pinning) → validate.
5. Phase 8: edge cases, full gate, browser-tester + recorded evidence, verifier confirmation, then PR.

Each story lands green on its own; the branch is PR-able after any checkpoint from US1 onward.

---

## Notes

- TDD discipline: within every story, the test task(s) run and FAIL before the implementation tasks start; the verification gate hook re-runs the full suite on Stop.
- T011 and T012 both edit `src/shared/types.ts` and both call into T010's service — keep them sequential.
- T013, T026, and T028 all edit `src/server/mcp/tools.ts` — sequential across phases, never parallel.
- Commit after each task or logical group (Conventional Commits); one feature branch, one PR.
- Evidence over assertion: no story is "done" at its checkpoint until Phase 8's browser-tester/recorded-output/verifier tasks confirm it.
