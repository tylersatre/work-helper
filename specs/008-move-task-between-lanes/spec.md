# Feature Specification: Move Task Between Lanes

**Feature Branch**: `008-move-task-between-lanes`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "@docs/product/features/move-task-between-lanes.md" (Tyler-authored PRD, feature interview resolved 2026-08-08)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move a card to another lane (Priority: P1)

As Tyler, I drag a task card from one lane and drop it in another lane so the task's board position reflects its real status. Today tasks pile up in the first lane because there is no way to move them; after this story, a card can progress through To Do, In Progress, Waiting, and Done — in any direction, any number of times — and the board remembers where I put it.

**Why this priority**: This is the entire reason the feature exists. Without lane-to-lane movement the kanban board is a static list; with it, the board becomes a working tool even before within-lane ordering exists.

**Independent Test**: Can be fully tested by dragging a single card from To Do into another lane, reloading the page, and confirming the card is in the destination lane and nowhere else. Delivers a usable "tasks progress across the board" workflow on its own.

**Acceptance Scenarios**:

1. **Given** a card "Follow up with Sam" in To Do and the other lanes empty, **When** I drag "Follow up with Sam" and drop it in the empty In Progress lane, **Then** "Follow up with Sam" appears in In Progress and no longer appears in To Do — and it is still in In Progress after a page reload.
2. **Given** "Follow up with Sam" now in In Progress, **When** I drag it and drop it in Done, **Then** it appears in Done and in no other lane — proving a card can keep moving lane to lane, not just leave the first one — and it is still in Done after a page reload.
3. **Given** To Do contains, top to bottom: "Book venue", "Order catering", **When** I drag "Book venue" and release it outside any lane, **Then** the board is unchanged — To Do still shows "Book venue" above "Order catering", and no card has changed lane or position.

---

### User Story 2 - Place a card exactly where it is dropped (Priority: P2)

As Tyler, I control the top-to-bottom order of cards by dragging: I can reorder cards within a lane, and when I drop a card into another lane it lands exactly where I dropped it (top, bottom, or between two specific cards). The board shows every card exactly where I put it, and that arrangement survives a reload.

**Why this priority**: Manual order is how the board expresses priority. Story 1 makes cards mobile; this story makes their position meaningful. It builds directly on the same drag interaction.

**Independent Test**: Can be fully tested by dragging cards within one lane and into a populated lane, reloading, and confirming the exact top-to-bottom order everywhere. Delivers value on its own as within-board prioritization.

**Acceptance Scenarios**:

1. **Given** In Progress contains "Write proposal" above "Review budget", and To Do contains "Draft Q3 goals", **When** I drag "Draft Q3 goals" and drop it between "Write proposal" and "Review budget", **Then** In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget" — and this order survives a page reload.
2. **Given** To Do contains, top to bottom: "Book venue", "Order catering", "Send invites", **When** I drag "Send invites" and drop it above "Book venue" in the same lane, **Then** To Do shows, top to bottom: "Send invites", "Book venue", "Order catering" — and this order survives a page reload.

---

### User Story 3 - The rest of the app respects board placement (Priority: P3)

As Tyler, everywhere else that touches tasks stays consistent with the board: newly created tasks land at a predictable place (bottom of the first lane), the task detail view shows the task's current lane without offering a second way to change it, and an authorized agent reading the board over MCP sees the same lanes and the same top-to-bottom order I see.

**Why this priority**: These are consistency guarantees around the core interaction. They matter for trust in the board — but only once Stories 1 and 2 make placement real.

**Independent Test**: Can be tested by creating a task and checking where it lands, opening a moved task's detail view, and calling the MCP board-listing tool after arranging the board — each check independent of the others.

**Acceptance Scenarios**:

1. **Given** To Do contains, top to bottom: "Book venue", "Order catering", **When** I create a new task "Send invites", **Then** To Do shows, top to bottom: "Book venue", "Order catering", "Send invites" — new cards append at the bottom of the first lane.
2. **Given** a card "Follow up with Sam" in To Do, **When** I move it to Waiting and open its detail view, **Then** the detail view shows "Waiting" as the task's lane, read-only — there is no control there to change it.
3. **Given** the board arranged via UI drags so that To Do shows "Book venue" above "Order catering" and In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget", **When** an authorized agent calls the MCP tool that lists the board, **Then** the response shows each task under its current lane, with the tasks in each lane in the same top-to-bottom order as the board.

---

### Edge Cases

- A card dragged and dropped back onto its own current position stays exactly where it was — no change, no error.
- Dropping into an empty lane works the same as dropping into a populated one (the card becomes that lane's only card).
- A drag released outside any lane — including over the page background or header — leaves the board unchanged (Story 1, Scenario 3).
- If saving a move fails, the board must not keep showing a placement that will not survive a reload; the card returns to its last saved position and the user can see the move did not take.
- Several moves performed in quick succession all persist — the final arrangement after a reload matches the final arrangement on screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to drag a task card from its current lane and drop it into any other configured lane; the card then appears in the destination lane and no longer appears in the source lane.
- **FR-002**: A card MUST be movable between any pair of configured lanes, in any direction, any number of times — no lane is a dead end and no lane transition is restricted.
- **FR-003**: A dropped card MUST land at the exact position where it was dropped in the destination lane: top, bottom, or between the two cards it was dropped between.
- **FR-004**: Users MUST be able to reorder cards within a single lane by dragging a card to a new position in the same lane.
- **FR-005**: Every card's lane and within-lane position MUST persist: after a page reload the board shows the same lanes, cards, and top-to-bottom order as before the reload.
- **FR-006**: A card MUST appear in exactly one lane at all times — never duplicated across lanes, never absent from the board because of a move.
- **FR-007**: Releasing a drag outside any lane MUST leave the board completely unchanged (no lane change, no order change).
- **FR-008**: Newly created tasks MUST appear at the bottom of the first configured lane, below all existing cards in that lane.
- **FR-009**: The task detail view MUST display the task's current lane as read-only information; it MUST NOT offer any control to change the lane.
- **FR-010**: The existing MCP board-listing tool MUST report each task under its current lane, with tasks in each lane in the same top-to-bottom order as the board UI; no new MCP tools are added.
- **FR-011**: Lanes MUST continue to come from the existing lane configuration (To Do, In Progress, Waiting, Done per create-task), and every lane MUST be treated identically — no completed styling, archiving, auto-clearing, or other special behavior for Done or any other lane.
- **FR-012**: Drag-and-drop with a desktop mouse MUST be the only mechanism for moving or reordering cards — no move menus, buttons, or keyboard-driven moving.

### Key Entities

- **Task (card)**: A task as shown on the kanban board. For this feature it gains a user-controlled placement: which lane it is in and its position within that lane. Its face (what the card displays) is unchanged.
- **Lane**: A named column from the existing lane configuration, holding an ordered top-to-bottom list of cards. All lanes behave identically.
- **Board**: The set of configured lanes in their configured order; the single source of truth for task placement, mirrored by the MCP board listing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can move a task from one lane to any other lane in a single drag interaction, with no additional steps, menus, or confirmations.
- **SC-002**: 100% of completed drags (lane moves and within-lane reorders) result in the card sitting exactly where it was dropped, both immediately and after a page reload.
- **SC-003**: 100% of cancelled drags (released outside any lane) leave the board in exactly its prior state.
- **SC-004**: At any moment, every task appears in exactly one lane — zero duplicated or lost cards across any sequence of moves.
- **SC-005**: The MCP board listing matches the board UI exactly — same lane membership and same within-lane order for 100% of tasks — whenever an authorized agent reads it.
- **SC-006**: New tasks land at the bottom of the first lane 100% of the time, so creation never disturbs an existing arrangement.

## Assumptions

- The configured lanes are To Do, In Progress, Waiting, Done, sourced from the lane configuration established by the create-task feature; lane management itself is unchanged by this feature.
- "An authorized agent" means an MCP client authenticated per the mcp-server feature; MCP access control is unchanged by this feature.
- work-helper is a single-user app (Tyler); simultaneous conflicting edits from multiple browser sessions are not a scenario this feature must arbitrate.
- Desktop mouse interaction only; touch and mobile drag support are explicitly out of scope for this slice.
- Moving or reordering tasks via MCP is out of scope — MCP remains read-only with respect to placement in this slice; write tools stay in the `mcp-tool-expansion` stub.
- Automatic sorting or filtering of cards is out of scope (future `kanban-sort-filter` work); manual order is the only order.
- Card faces are unchanged (future `kanban-card-indicators` work); cards look the same, they just move.
- If a move cannot be saved, reverting the card to its last saved position with a visible indication is acceptable behavior; silent divergence between screen and saved state is not.
- A visual drop indicator during a drag and the additive `position` field in MCP task outputs are design-level support for FR-003 and FR-010 respectively (settled at planning) — implementation detail, not new scope.
