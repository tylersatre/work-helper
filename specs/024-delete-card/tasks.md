---

description: "Task list for delete-card"

---

# Tasks: delete-card

**Input**: Design documents from `/specs/024-delete-card/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md), [quickstart.md](./quickstart.md)

**Tests**: TDD is mandatory per `CLAUDE.md` — every implementation task below is preceded by a failing test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. No Setup phase is listed — this feature adds no new dependencies or project scaffolding.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The `deleteTask` service function and `DELETE /api/tasks/:id` route that every user story exercises — US1's confirm action calls it, US2's cancel path proves it is *not* called, and US3's cascade/MCP-visibility guarantees are properties of it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Write failing integration tests in `tests/integration/task-delete.test.ts` covering: (a) `DELETE /api/tasks/:id` on an existing card returns 200 and the card is gone from `GET /api/board` (US1); (b) the delete cascades to remove the card's own `task_people`, `task_notes`, `task_tags`, `task_companies`, `task_conversations` rows while the linked `people` row and `email_conversations`/`email_messages` rows remain queryable and unchanged (US3, FR-007); (c) `DELETE /api/tasks/:id` on a non-existent or already-deleted id returns 404 `Task not found`, not a 500 (edge case); (d) the MCP `list-board` tool's response no longer includes a card deleted via the route above, calling the tool handler through the existing MCP test harness pattern from `tests/integration/mcp-read-tools.test.ts` (US3, FR-008); (e) no delete-task tool is registered in `src/server/mcp/tools.ts` (FR-009). Confirm all assertions fail against current code before proceeding.
- [X] T002 Implement `deleteTask(db, id): DeleteTaskResult` in `src/server/services/tasks.ts`, following the existing `deleteNote`/`unlinkPerson` discriminated-union result pattern in the same file — confirm the row exists, then `db.delete(tasks).where(eq(tasks.id, id))`, relying on the schema's cascading foreign keys for child rows (depends on T001).
- [X] T003 Implement `DELETE /api/tasks/:id` in `src/server/routes/tasks.ts`, calling `deleteTask` and returning `{ ok: true }` (200) or `{ error: { message: 'Task not found' } }` (404) per `contracts/http-api.md` (depends on T002). Run T001 and confirm it now passes.

**Checkpoint**: `tests/integration/task-delete.test.ts` passes in full — the delete route, cascade behavior, and MCP visibility are all proven before any UI work starts.

---

## Phase 2: User Story 1 - Delete a card with confirmation (Priority: P1) 🎯 MVP

**Goal**: A delete control in the card detail view header opens a confirmation modal naming the card; confirming deletes it and returns to the board.

**Independent Test**: Open a card's detail view, click delete, confirm in the dialog, and verify the card no longer appears in any lane on the board.

### Implementation for User Story 1

- [X] T004 [P] [US1] Create `DeleteCardConfirm.vue` in `src/client/components/DeleteCardConfirm.vue` — a modal accepting the card's title as a prop, showing the title and a "this can't be undone" warning, with Cancel and Delete (confirm) buttons that emit `cancel`/`confirm` events (FR-002, FR-003).
- [X] T005 [US1] In `src/client/pages/TaskDetailPage.vue`, add a delete control (`data-testid="delete-card-button"`) in the header next to the existing lane pills (FR-001); wire its click to show `DeleteCardConfirm`; wire the modal's `confirm` event to call `DELETE /api/tasks/:id` and navigate to the board (`/`) on `response.ok` or a 404 result, or show an inline `role="alert"` error (matching the existing `laneError`/`tagError` precedent) and keep the modal open on any other failure (FR-005, FR-006; depends on T003, T004).
- [X] T006 [US1] Run the `browser-tester` agent against quickstart.md's US1 scenario: open a card's detail view, confirm the delete control appears near the title, click it, confirm the modal shows the card's title and permanence warning with the card not yet deleted, confirm the deletion, and verify navigation back to the board with the card gone from every lane. Save screenshots to `docs/evidence/024-delete-card/`.

**Checkpoint**: User Story 1 is fully functional and independently testable — a card can be deleted end-to-end with confirmation.

---

## Phase 3: User Story 2 - Cancel a delete in progress (Priority: P2)

**Goal**: Canceling the confirmation modal leaves the card and detail view completely untouched.

**Independent Test**: Open the confirmation box for a card, dismiss it (via cancel or equivalent), and verify the card still exists and the detail view is unchanged.

### Implementation for User Story 2

- [X] T007 [US2] In `src/client/pages/TaskDetailPage.vue`, wire `DeleteCardConfirm`'s `cancel` event to close the modal without making any network call, leaving all detail view state (title, lane, links) unchanged (FR-004; depends on T004, T005).
- [X] T008 [US2] Run the `browser-tester` agent against quickstart.md's US2 scenario: open the confirmation modal, click cancel, verify the modal closes with no delete request made and the detail view for the same card is unchanged. Save screenshots to `docs/evidence/024-delete-card/`.

**Checkpoint**: User Stories 1 and 2 both work independently — delete-with-confirm and cancel-with-no-side-effects are both proven.

---

## Phase 4: User Story 3 - Deleting a card leaves linked data untouched (Priority: P2)

**Goal**: Deleting a card removes only the card and its own links; linked people and conversations survive untouched, and the deletion is visible through MCP read tools.

**Independent Test**: Link a card to a conversation and a person, delete the card, then verify the conversation still appears on the Emails page, the person still exists, and an MCP board listing no longer includes the deleted card.

### Implementation for User Story 3

> The cascade and MCP-visibility guarantees this story requires are already proven by T001's automated assertions (Phase 1) — this phase's remaining work is UI-surfaced evidence for the parts T001 cannot observe (the Emails and People pages) plus a recorded artifact for the MCP-surfaced acceptance criterion.

- [X] T009 [US3] Run the `browser-tester` agent against quickstart.md's US3 scenario: link a card to a conversation and a person, delete the card via the confirmation flow, and verify the conversation still appears on the Emails page and the person still exists on the People page, unaffected. Save screenshots to `docs/evidence/024-delete-card/`.
- [X] T010 [US3] Record the `npm test` output for `tests/integration/task-delete.test.ts`'s MCP `list-board` exclusion assertion (T001d) as recorded automated-check evidence in `docs/evidence/024-delete-card/` — this acceptance criterion (spec.md US3 scenario 2) is reachable only through the MCP tool, not the browser.

**Checkpoint**: All three user stories are independently functional and evidenced — US1 (delete+confirm), US2 (cancel), US3 (linked-data isolation + MCP visibility).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T011 Run `npm run typecheck`, `npm run lint`, and `npm test` and confirm all pass, per quickstart.md's Automated checks section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Phase 1 (T003). No dependency on US2 or US3.
- **User Story 2 (Phase 3)**: Depends on Phase 1 and on T004/T005 from US1 (the modal and its wiring already exist; US2 only adds the cancel path). Independently testable once T007 lands.
- **User Story 3 (Phase 4)**: Depends on Phase 1 (T001's cascade/MCP assertions already prove the backend guarantee) and on T005 (the delete flow must exist to exercise it in the browser).
- **Polish (Phase 5)**: Depends on all desired user stories being complete.

### Within Each Phase

- Tests before implementation (T001 before T002/T003).
- Service before route (T002 before T003).
- Component before page wiring (T004 before T005).
- Implementation before its browser evidence task.

### Parallel Opportunities

- T004 (`DeleteCardConfirm.vue`) can be built in parallel with nothing else in Phase 2 — it's the only [P] task, since T005 depends on it and T003.
- Phase 1 tasks are strictly sequential (test → service → route) since each depends on the prior.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (delete service + route, fully tested).
2. Complete Phase 2: User Story 1 (delete control, modal, confirm flow).
3. **STOP and VALIDATE**: Run T006's browser evidence; confirm SC-001 (delete in under 10 seconds) and SC-003 (card gone from every board view).
4. Deploy/demo if ready — this alone satisfies the feature's core value ("clean up cards I no longer need").

### Incremental Delivery

1. Phase 1 → backend foundation ready and fully tested.
2. Phase 2 (US1) → delete-with-confirm works end-to-end → MVP.
3. Phase 3 (US2) → cancel is proven lossless → confirmation step is trustworthy.
4. Phase 4 (US3) → linked-data isolation and MCP visibility are evidenced.
5. Phase 5 → final automated-check pass across the whole slice.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Verify T001 fails before implementing T002/T003 (TDD, per `CLAUDE.md`).
- This feature has no MCP tool changes to test beyond confirming none exists (T001e) — FR-009 is enforced by absence, not by a new contract.
- Evidence for each story goes in `docs/evidence/024-delete-card/`, per the Definition of Done in `CLAUDE.md`.
