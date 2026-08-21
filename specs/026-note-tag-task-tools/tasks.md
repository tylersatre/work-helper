# Tasks: MCP Note, Tag & Task Tools

**Input**: Design documents from `/specs/026-note-tag-task-tools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, quickstart.md

**Tests**: TDD is mandatory per the project constitution (CLAUDE.md: "TDD is mandatory: failing test first, then code"). Every service-layer function and MCP tool below is preceded by a failing test task.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing of each story, per spec.md's priorities (US1/US2/US3 = P1, US4 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact — this is a single-project repo (`src/`, `tests/` at repository root)

## Path Conventions

Single project, server-only feature (see plan.md Structure Decision):
- Services: `src/server/services/tasks.ts`, `src/server/services/tags.ts`
- MCP tools: `src/server/mcp/tools.ts`
- Tests: `tests/integration/mcp-note-tag-task-tools.test.ts` (single new file, all 9 tools)

All four user stories share this one test file and these two service files, since every story is a handful of tightly-related tool registrations rather than separate subsystems — task-level granularity (one task per tool/function, in dependency order) replaces file-level parallelism within a story. Tasks across different user stories touch disjoint tool names in the same files, so true `[P]` parallelism is limited to tasks operating on genuinely independent code (e.g., US1's note work vs. US4's title work can proceed in parallel days even though both touch `tasks.ts`, since they're different functions) — marked `[P]` only where file-level conflicts are truly absent (i.e., never within the same file in this feature, since every task appends to a shared services/tools file). Where two tasks touch the same file, they are left unmarked and ordered.

---

## Phase 1: Setup

No project initialization needed — this feature adds to an existing, fully-configured codebase (no new dependencies, no new config, per plan.md Technical Context). Phase skipped.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared resolution helpers that every tag-identifying tool (US2, US3) depends on. Nothing in US1 or US4 depends on this phase — they can start immediately in parallel with this phase.

**⚠️ CRITICAL**: T001–T002 MUST be complete before any task in US2 or US3.

- [X] T001 Write failing unit test for `resolveExistingTag(db, input)` in `tests/unit/services/tags.test.ts` (or the existing tags service test file) — covering: resolves by `tagId`, resolves by `tagName` case-insensitively, returns `{ ok: false, error: 'tag-not-found' }` for an unmatched id or name, returns `{ ok: false, error: 'invalid-name' }` for an empty/whitespace `tagName`. Confirm the test fails (function doesn't exist yet).
- [X] T002 Implement `resolveExistingTag(db, input: TagIdentifier): { ok: true; tag: TagRecord } | { ok: false; error: 'tag-not-found' | 'invalid-name' }` (`TagIdentifier` per data-model.md — exactly one of `tagId`/`tagName`) in `src/server/services/tags.ts`, reusing the existing `findTagByNameCaseInsensitive` lookup (never inserting a new row) per research.md R4. Make T001 pass.

**Checkpoint**: `resolveExistingTag` ready — US2 (rename/recolor/delete-tag) and US3 (attach/detach-tag) can now proceed.

---

## Phase 3: User Story 1 - Agent deletes an outdated task note (Priority: P1) 🎯 MVP

**Goal**: An authorized agent can permanently delete one task note by its id via a `delete-note` MCP tool; the task's other notes are untouched.

**Independent Test**: Seed a task with two notes, call `delete-note` with one note's id, confirm only that note disappears from the detail view and `get-task`'s notes list, before and after a reload.

### Tests for User Story 1

- [X] T003 [US1] Write failing unit test for `deleteNoteById(db, noteId)` in the existing tasks service test file — covering: deletes the note and returns `{ ok: true, taskId }`, leaves the task's other notes untouched, returns `{ ok: false, error: 'note-not-found' }` for an unknown note id. Confirm it fails (function doesn't exist yet).
- [X] T004 [US1] Write failing integration test(s) in `tests/integration/mcp-note-tag-task-tools.test.ts` (create the file; follow the `tests/integration/mcp-move-tools.test.ts` pattern — in-memory SQLite via `createDb(':memory:')`, `buildApp({...})`, `connectThroughApproval(...)`) for the `delete-note` tool: calling it with an existing note's id deletes only that note (confirmed via a follow-up `get-task` call), and calling it with a nonexistent note id fails with a "note not found" error and changes nothing (spec.md US1 acceptance scenarios 1–2, FR-001, FR-002). Confirm the tests fail (tool doesn't exist yet).

### Implementation for User Story 1

- [X] T005 [US1] Implement `deleteNoteById(db, noteId)` in `src/server/services/tasks.ts`, returning `{ ok: true; taskId: number } | { ok: false; error: 'note-not-found' }` per data-model.md and research.md R2 (looks up the note directly by id, no task-scoping parameter). Make T003 pass.
- [X] T006 [US1] Register the `delete-note` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §1: input `{ noteId: number }` (`z.number().int().positive()`), calls `deleteNoteById`, returns `structuredContent: { deleted: true, taskId }` with success text `` Deleted note ${noteId} from task "${taskTitle}". ``, and on `note-not-found` returns `toolError(`Note ${noteId} not found`)`. Make T004 pass.

**Checkpoint**: `delete-note` is fully functional and independently testable. This is the MVP slice.

---

## Phase 4: User Story 2 - Agent builds and maintains the tag vocabulary (Priority: P1)

**Goal**: An authorized agent can create, rename, recolor, and delete tags via `create-tag`, `rename-tag`, `recolor-tag`, and `delete-tag`, with every change visible on the Tags page, `list-tags`, and every task/person the tag is attached to.

**Independent Test**: Call `create-tag`, `rename-tag`, `recolor-tag`, and `delete-tag` in sequence against a fresh tag; confirm the resulting name/color/absence via `list-tags` at each step.

**Depends on**: Phase 2 (`resolveExistingTag`) for T012, T013, and T014 (and T015 transitively, via the T012 variant it calls). T007, T010, and T011 (`create-tag`) do not depend on Phase 2 — creating a tag resolves nothing.

### Tests for User Story 2

- [X] T007 [US2] Write failing unit test for the extended `createTag(db, rawName, rawColor?)` signature in the tags service test file — covering: creates with an explicit valid color, creates with an auto-assigned color when `rawColor` is omitted (existing behavior preserved), rejects an empty name, rejects a case-insensitive duplicate name, rejects an invalid (non-hex) `rawColor` with an `'invalid-color'` error variant. Confirm it fails on the new color-handling branches.
- [X] T008 [US2] Write failing unit test for the `deleteTag` detach-count variant in the tags service test file — covering: deleting a tag attached to N people and M tasks returns `{ ok: true, peopleDetached: N, tasksDetached: M }` and cascades the detach, deleting an unknown tag id returns `{ ok: false, error: 'tag-not-found' }`. Confirm it fails (variant doesn't exist yet).
- [X] T009 [US2] Write failing integration tests in `tests/integration/mcp-note-tag-task-tools.test.ts` for `create-tag`, `rename-tag`, `recolor-tag`, and `delete-tag`, covering every acceptance scenario in spec.md US2 (scenarios 1–5: create with explicit color + case-insensitive duplicate rejection; create with auto color + empty-name rejection; rename by id + empty-name rejection, verified via `list-tags`; recolor by name, verified via `list-tags`; delete by name reporting `peopleDetached`/`tasksDetached`, then a second delete of the same name fails not-found) and FR-006 through FR-014. Confirm the tests fail.

### Implementation for User Story 2

- [X] T010 [US2] Extend `createTag(db, rawName, rawColor?)` in `src/server/services/tags.ts` per research.md R11 — validate `rawColor` with `tagColorSchema` when supplied, fall back to `nextTagColor(lastCreatedTagColor(db))` when omitted, add `'invalid-color'` to `CreateTagResult`'s error variant. Make T007 pass.
- [X] T011 [US2] Register the `create-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §3: input `{ name: string, color?: string }`, calls the extended `createTag`, returns `structuredContent: { id, name, color }`, errors `A name is required` / `That tag name is already in use` / `A valid color is required` as specified.
- [X] T012 [US2] Add the `deleteTag` detach-count variant in `src/server/services/tags.ts` per research.md R6 and data-model.md — resolve the tag via `resolveExistingTag`, count `personTags`/`taskTags` rows for that tag id before the cascade-deleting `deleteTag(db, id)` call, return `{ ok: true; peopleDetached: number; tasksDetached: number } | { ok: false; error: 'tag-not-found' }`. Make T008 pass.
- [X] T013 [US2] Register the `rename-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §4: input `{ tagId?: number, tagName?: string, name: string }`, validates exactly one of `tagId`/`tagName` is given, resolves via `resolveExistingTag`, calls `updateTag(db, id, { name })`, returns `structuredContent: { id, name, color }`, errors `Provide either tagId or tagName, not both` / `Tag not found` / `A name is required` / `That tag name is already in use` as specified.
- [X] T014 [US2] Register the `recolor-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §5: input `{ tagId?: number, tagName?: string, color: string }`, validates exactly one of `tagId`/`tagName` is given, resolves via `resolveExistingTag`, calls `updateTag(db, id, { color })`, returns `structuredContent: { id, name, color }`, errors `Provide either tagId or tagName, not both` / `Tag not found` / `A valid color is required` as specified.
- [X] T015 [US2] Register the `delete-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §6: input `{ tagId?: number, tagName?: string }`, validates exactly one of `tagId`/`tagName` is given, calls the detach-count `deleteTag` variant (T012), returns `structuredContent: { deleted: true, peopleDetached, tasksDetached }` with success text `` Deleted tag "${name}" — detached from ${peopleDetached} person(s) and ${tasksDetached} task(s). ``, errors `Provide either tagId or tagName, not both` / `Tag not found`. Make T009 pass (together with T011, T013, T014).
- [X] T016 [US2] Register the `list-tags` MCP read tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §9 and research.md R7: no input, calls existing `listTags(db)`, returns `structuredContent: { tags: [{ id, name, color, peopleCount, tasksCount }] }` with success text `` ${count} tag(s). ``. (FR-023 — supporting read infrastructure the US2 integration tests in T009 rely on to assert tag state.)

**Checkpoint**: `create-tag`, `rename-tag`, `recolor-tag`, `delete-tag`, and `list-tags` are fully functional and independently testable, alongside US1.

---

## Phase 5: User Story 3 - Agent applies and removes tags on tasks and people (Priority: P1)

**Goal**: An authorized agent can attach and detach an existing tag on a task or a person via `attach-tag`/`detach-tag`, identified by id or name; attach never creates a tag, detach never deletes one.

**Independent Test**: Create a tag, attach it to a task by name and a person by id, confirm both show the chip via `list-tags`/`get-task`/`get-person`, detach from the task, confirm the person keeps it and the tag still exists.

**Depends on**: Phase 2 (`resolveExistingTag`). Benefits from Phase 4's `list-tags` for full verification but does not strictly require it — `get-task`/`get-person` (already existing read tools) are sufficient to verify attach/detach effects.

### Tests for User Story 3

- [X] T017 [US3] Write failing integration tests in `tests/integration/mcp-note-tag-task-tools.test.ts` for `attach-tag` and `detach-tag`, covering every acceptance scenario in spec.md US3 (scenarios 1–4: attach to a task by name and a person by id, both showing the chip via `get-task`/`get-person`; attach with an unknown tag name fails with "no such tag exists" and attach with an unknown task id fails not-found, no auto-create; detach from a task leaves the person's attachment and the tag itself intact; re-attaching an already-attached tag is a no-op with no duplicate/error) and FR-015 through FR-019. Confirm the tests fail (tools don't exist yet).

### Implementation for User Story 3

- [X] T018 [US3] Register the `attach-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §7 and research.md R5/R9: input `{ tagId?: number, tagName?: string, taskId?: number, personId?: number }`; validate exactly one of `tagId`/`tagName` and exactly one of `taskId`/`personId` are given (before any lookup); resolve the tag via `resolveExistingTag` (never auto-create); verify the task/person exists; insert into `taskTags`/`personTags` with `onConflictDoNothing()` (no-op on duplicate, FR-018); return `structuredContent: { tags: string[] }` (the target's full current tag names, via `getTagsForTask`/`getTagsForPerson`); errors `Provide either tagId or tagName, not both` / `Provide either taskId or personId, not both` / `No such tag exists — call create-tag first` / `` Task ${taskId} not found `` / `` Person ${personId} not found `` as specified.
- [X] T019 [US3] Register the `detach-tag` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §8: input `{ tagId?: number, tagName?: string, taskId?: number, personId?: number }`; same pair-validation as T018; resolve the tag via `resolveExistingTag`; verify the task/person exists; delete the one `(recordId, tagId)` row from `taskTags`/`personTags` (never touching the tag row or other records' attachments); return `structuredContent: { tags: string[] }` (the target's remaining tag names); errors as specified in contracts/mcp-tools.md §8. Make T017 pass (together with T018).

**Checkpoint**: `attach-tag`/`detach-tag` are fully functional and independently testable, alongside US1 and US2.

---

## Phase 6: User Story 4 - Agent fixes a task's title (Priority: P2)

**Goal**: An authorized agent can rename a task's title via `update-task`, given the task's id and a new title; the new title is visible on the board, the detail view, `get-task`, and the board-listing tool.

**Independent Test**: Call `update-task` with a new title, confirm the board card, detail view, `get-task`, and board-listing tool all show the new title, before and after a reload.

**Depends on**: Nothing — independent of Phases 2, 4, and 5. Can be implemented any time after Phase 1 (in parallel with US1–US3).

### Tests for User Story 4

- [X] T020 [US4] Write failing unit test for `updateTaskTitle(db, taskId, rawTitle)` in the existing tasks service test file — covering: updates the title and returns `{ ok: true, task }` with the new title, rejects an empty title with `'invalid-title'`, rejects a whitespace-only title with `'invalid-title'`, returns `'task-not-found'` for an unknown task id. Confirm it fails (function doesn't exist yet).
- [X] T021 [US4] Write failing integration tests in `tests/integration/mcp-note-tag-task-tools.test.ts` for the `update-task` tool, covering spec.md US4 acceptance scenarios 1–2 (renames a task, reflected in `get-task` and the board-listing tool; empty title, whitespace-only title, and unknown task id all rejected leaving the title unchanged) and FR-003 through FR-005. Confirm the tests fail (tool doesn't exist yet).

### Implementation for User Story 4

- [X] T022 [US4] Implement `updateTaskTitle(db, taskId, rawTitle)` in `src/server/services/tasks.ts` per research.md R3 — validate `rawTitle` with the existing `titleSchema`, return `{ ok: true; task } | { ok: false; error: 'task-not-found' | 'invalid-title' }`. Make T020 pass.
- [X] T023 [US4] Register the `update-task` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md §2: input `{ taskId: number, title: string }`, calls `updateTaskTitle`, returns `structuredContent` in the existing `taskSummarySchema` shape (`{ id, title, lane, position, createdAt }`) with success text `` Renamed task ${taskId} to "${newTitle}". ``, errors `` Task ${taskId} not found `` / `Title is required` as specified. Make T021 pass.

**Checkpoint**: `update-task` is fully functional and independently testable, alongside US1–US3. All nine tools now exist.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification spanning all four user stories, per the project's Definition of Done (CLAUDE.md).

- [X] T024 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` (the same gate the Stop hook runs) and fix any failures across all changed files.
- [X] T025 Run the `browser-tester` agent against the running dev server (`npm run dev`) to capture evidence under `docs/evidence/026-note-tag-task-tools/` for every UI-visible surface named in FR-020: seed a task/tag/person, trigger each of the nine tools via direct MCP/API calls per quickstart.md §2, and confirm the kanban board, task/person detail views, and Tags page each reflect the effect immediately and after a reload.
- [X] T026 Independently confirm (via the `verifier` agent) that every acceptance scenario in spec.md (US1–US4) has both a passing automated check and the browser evidence from T025, per the project's Definition of Done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Skipped — no work needed.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 4 (US2) and Phase 5 (US3) only — does NOT block Phase 3 (US1) or Phase 6 (US4).
- **US1 (Phase 3)**: No dependencies on Phase 2. Can start immediately.
- **US2 (Phase 4)**: Depends on Phase 2 (`resolveExistingTag`).
- **US3 (Phase 5)**: Depends on Phase 2 (`resolveExistingTag`). Independently testable from US2, though both read/write the shared `tags`/`taskTags`/`personTags` tables.
- **US4 (Phase 6)**: No dependencies on Phase 2 or any other user story. Can start immediately.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on Phase 2 or any other story.
- **US2 (P1)**: Depends on Phase 2. No dependency on US1, US3, or US4.
- **US3 (P1)**: Depends on Phase 2. No dependency on US1, US2, or US4 (though US3's independent test is more meaningful once US2's `create-tag` exists to seed a tag — in practice US2 and US3 are implemented together or US2 first).
- **US4 (P2)**: No dependency on Phase 2 or any other story.

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation (TDD, per CLAUDE.md).
- Service-layer function tasks precede the MCP tool registration tasks that call them.
- Integration test tasks for a story precede that story's tool-registration tasks.

### Parallel Opportunities

- Phase 2 (T001–T002) can run in parallel with Phase 3 (US1) and Phase 6 (US4), since neither depends on `resolveExistingTag`.
- Once Phase 2 completes, Phase 4 (US2) and Phase 5 (US3) can both start — though both append to `src/server/mcp/tools.ts` and touch the shared `tags.ts`/`taskTags`/`personTags` code paths, so treat them as sequential within one contributor's working tree even though they are logically independent.
- T007 and T008 cover independent functions but both extend the tags service test file, so they are sequenced (T007 then T008), not parallel — per this file's [P] convention.
- T003 (US1) and T020 (US4) cover independent functions but both extend the tasks service test file, so sequence them (either order), not parallel — per this file's [P] convention.
- All four user-story implementation phases (3, 4, 5, 6) can proceed in parallel across contributors once Phase 2 is done, since each targets distinct tool names, even though several share the same two files (`tools.ts`, `tags.ts`, `tasks.ts`) and therefore need serialized commits, not necessarily serialized development.

---

## Parallel Example: Foundational + US1 + US4 (no shared dependency)

```bash
# These two can start immediately and in parallel — different test files, no shared dependency:
Task: "T001 Write failing unit test for resolveExistingTag in tests for tags.ts"
Task: "T003 Write failing unit test for deleteNoteById in tests for tasks.ts"
# T020 (US4) also has no cross-story dependency, but it extends the same tasks service test file as T003 — start it once T003 lands.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 3: User Story 1 (`delete-note`) — does not require Phase 2.
3. **STOP and VALIDATE**: Run the new integration test file, confirm `delete-note`'s scenarios pass independently.
4. Deploy/demo if ready — `delete-note` alone is a complete, useful capability.

### Incremental Delivery

1. Phase 3 (US1, `delete-note`) → validate → demo (MVP).
2. Phase 2 (Foundational) + Phase 4 (US2, tag CRUD + `list-tags`) → validate → demo.
3. Phase 5 (US3, attach/detach-tag) → validate → demo (now the full tag vocabulary is usable end to end).
4. Phase 6 (US4, `update-task`) → validate → demo.
5. Phase 7 (Polish: full verification gate + browser evidence + `verifier` agent) → PR.

### Suggested MVP Scope

**User Story 1** (`delete-note`) is the smallest, most self-contained increment — a single tool, one service function, no dependency on the Foundational phase. It is explicitly called out as the simplest capability in spec.md's own "Why this priority" rationale.

---

## Notes

- All 9 MCP tools are registered in the single existing `src/server/mcp/tools.ts` file and are automatically behind the `mcp-authentik-auth` OAuth gate (FR-021) — no auth-specific task is needed (research.md R10).
- No new database migration is needed for any task in this list — every table already exists (research.md R1).
- No client (Vue) changes anywhere in this task list — this feature is server/MCP-only (plan.md Scale/Scope).
- Every write-tool task must leave zero partial effects on a failed call (FR-022) — validation and existence checks happen before any mutation, matching the atomic patterns already used by `attachTagToTask`/`renameCompany`/`deleteCompany` (contracts/mcp-tools.md, Cross-cutting notes).
- Verify each story's tests fail before implementing, and pass after — do not retrofit tests to already-written code (CLAUDE.md TDD mandate).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
