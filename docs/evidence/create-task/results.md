# Create Task — User Story 1 Acceptance Evidence

**Feature**: 001-create-task
**Date tested**: 2026-08-06
**Base URL**: http://localhost:5173

## Scenario 1 (US1-1, SC-004): Empty board shows all configured lanes in order

**Given** the kanban board is configured with lanes "To Do", "In Progress", "Waiting", "Done" (in that order) and no tasks exist yet,
**When** Tyler opens the kanban board,
**Then** he sees all four lanes displayed left to right in that order, each empty.

**Result**: PASS

Navigated to http://localhost:5173 with a fresh/empty database. The board rendered four lane headings left to right in the exact order "To Do", "In Progress", "Waiting", "Done", and each lane's list was empty (no cards).

**Evidence**: us1-scenario1-empty-board.png

## Scenario 2 (US1-2, SC-001): Create a task; it lands in the first lane

**Given** the kanban board is open and no tasks exist yet,
**When** Tyler enters "Follow up with Sam" as a task title and submits,
**Then** a new card titled "Follow up with Sam" appears in the "To Do" lane — the first configured lane.

**Result**: PASS

Typed "Follow up with Sam" into the Title field and clicked "Add task". A card titled "Follow up with Sam" appeared in the "To Do" lane immediately (well under 5 seconds — the accessibility snapshot showed the new card in the very next snapshot taken right after the click, with no additional wait needed). Other lanes remained empty.

**Evidence**: us1-scenario2-first-task-created.png

## Scenario 3 (US1-3, FR-006): Second task joins the lane without disturbing the first

**Given** the "To Do" lane already contains a card titled "Follow up with Sam",
**When** Tyler creates a new task titled "Draft Q3 goals",
**Then** the "To Do" lane shows both cards, and "Follow up with Sam" is unchanged.

**Result**: PASS

With "Follow up with Sam" already showing in "To Do", typed "Draft Q3 goals" into the Title field and clicked "Add task". The "To Do" lane then showed both cards, in order: "Follow up with Sam" (unchanged) followed by "Draft Q3 goals". The "In Progress", "Waiting", and "Done" lanes remained empty and unaffected.

**Evidence**: us1-scenario3-second-task-added.png

## Summary

| Scenario | Result |
|---|---|
| 1 — Empty board shows four lanes in order (US1-1, SC-004) | PASS |
| 2 — Create first task, appears in To Do (US1-2, SC-001) | PASS |
| 3 — Create second task, both cards shown, first unchanged (US1-3, FR-006) | PASS |

All three User Story 1 acceptance scenarios pass. No application code was modified during this verification.

## User Story 2

### Scenario 4 (US2-1, SC-002): Tasks survive reload

**Given** Tyler has just created a task titled "Follow up with Sam" (and previously also "Draft Q3 goals"),
**When** he reloads the page,
**Then** the "To Do" lane still shows the previously created cards.

**Result**: PASS

Navigated to http://localhost:5173, then reloaded the page (fresh navigation to the same URL, forcing a re-fetch from the server rather than relying on any in-memory/browser state). After the reload, the accessibility snapshot and the screenshot both showed the "To Do" lane still containing both previously created cards, "Follow up with Sam" and "Draft Q3 goals", in the same order as before. The "In Progress", "Waiting", and "Done" lanes remained empty. This confirms the tasks were persisted server-side (in the database) rather than only held in browser memory.

**Evidence**: us2-scenario4-persists-after-reload.png

## Summary (User Story 2)

| Scenario | Result |
|---|---|
| 4 — Tasks survive reload (US2-1, SC-002) | PASS |

User Story 2's acceptance scenario passes. No application code was modified during this verification. No new tasks were created during this run; the two cards shown were already present in the database from a prior evidence run.

## User Story 3

### Scenario 5 (US3-1, SC-003): Empty / whitespace-only title is rejected

**Given** the kanban board is open (two pre-existing cards "Follow up with Sam" and "Draft Q3 goals" in "To Do"),
**When** Tyler tries to submit the create-task form with an empty or whitespace-only title,
**Then** no new card is created and he sees a validation message telling him a title is required.

**Result**: PASS

- **Empty title submit**: Clicked "Add task" with the title field blank. The "Title is required" message appeared; the "To Do" lane still showed exactly the same two cards. No `POST /api/tasks` request was made — client-side validation blocked it before any network call.
- **Whitespace-only title submit**: Typed three spaces into the title field and clicked "Add task". The same "Title is required" message appeared; the board was unchanged (still exactly two cards). Again no API call was made.
- **Server-side enforcement**: Issued direct `fetch()` calls from the page to `POST /api/tasks` with `{"title":""}` and `{"title":"   "}` to exercise the server layer independently of the client guard. Both returned `400 Bad Request` with body `{"error":{"message":"Title is required"}}`, confirmed via the browser's network request log. Reloading the page afterward showed the "To Do" lane still contains only the original two cards — nothing was persisted from the rejected attempts.

**Evidence**: us3-scenario5-validation-message.png (shows the "Title is required" message under the create-task form, with "To Do" still showing only the original two cards)

## Summary (User Story 3)

| Scenario | Result |
|---|---|
| 5 — Empty/whitespace title rejected client- and server-side (US3-1, SC-003) | PASS |

User Story 3's acceptance scenario passes: empty and whitespace-only titles are rejected both client-side (with a visible message, no network call) and server-side (400 response, nothing persisted). No application code was modified during this verification.

## Overall

All five acceptance scenarios across User Stories 1, 2, and 3 pass with both automated test coverage (`npm test`) and independent browser evidence captured above.
