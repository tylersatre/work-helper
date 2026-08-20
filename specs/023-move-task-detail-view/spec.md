# Feature Specification: Move Task from Detail View

**Feature Branch**: `023-move-task-detail-view`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "@docs/product/features/move-task-from-detail-view.md" (Tyler-authored PRD, feature interview resolved 2026-08-20)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move a card's lane from its detail view (Priority: P1)

As Tyler, I open a card's detail view and see its lane rendered as a row of pills — one per configured lane, in order, with the card's current lane visually marked — and I move the card to a different lane by clicking the pill for that lane, with the move taking effect immediately and no confirmation dialog.

**Why this priority**: This is the entire feature. Today the detail view only shows lane as plain text, so changing a card's lane means leaving the detail view, finding the card on the board, and dragging it. This story removes that detour.

**Independent Test**: Can be fully tested by opening a card's detail view, clicking a non-current lane pill, and confirming the card moved on the board and the pill row updated — independent of any other feature.

**Acceptance Scenarios**:

1. **Given** a card "Follow up with Sam" in the "To Do" lane, **When** I open its detail view, **Then** directly under the title, in place of the old "Lane: To Do" text, I see all four configured lanes (To Do, In Progress, Waiting, Done) rendered as a row of pills in that order, "To Do" visually marked as the current lane and the other three shown as clickable move targets — no section header, just the improved control where the text used to be.
2. **Given** the detail view of "Follow up with Sam" showing the lane pills with "To Do" current, **When** I click the "In Progress" pill, **Then** the card moves to In Progress immediately with no confirmation dialog, the pill row updates so "In Progress" is now marked current and "To Do" is no longer marked current, and this is still true after a page reload.
3. **Given** In Progress contains, top to bottom, "Write proposal" and "Review budget", and "Follow up with Sam" is in To Do, **When** I open "Follow up with Sam"'s detail view and click the "In Progress" pill, **Then** the kanban board shows In Progress as, top to bottom, "Write proposal", "Review budget", "Follow up with Sam" — the card lands at the bottom, the same default landing spot used by drag-and-drop and the MCP move tool — and this survives a page reload.
4. **Given** the detail view of "Follow up with Sam" showing "To Do" as its current lane, **When** I click the "To Do" pill (its own current lane), **Then** nothing changes — the card stays in To Do at its existing position, and the pill row is unchanged, proving the current lane's pill is not an actionable move target.
5. **Given** "Follow up with Sam" is in the Waiting lane, **When** I open its detail view and click the "Done" pill, **Then** the card moves directly to Done, skipping In Progress, proving the control can move a card to any lane in one click, not just an adjacent one.

---

### User Story 2 - Moves made here are visible to agents (Priority: P2)

As Tyler, when I move a card using the detail view's lane pills, that move is indistinguishable from any other move — an MCP client reading the board sees the card under its new lane, same as if I had dragged it on the board.

**Why this priority**: This control reuses the existing move operation rather than introducing a parallel path, so any agent or automation reading board state stays correct regardless of how a card got moved.

**Independent Test**: Can be tested by moving a card via the detail view's lane pills, then calling the existing MCP board-listing tool and confirming the card appears under its new lane.

**Acceptance Scenarios**:

1. **Given** I moved "Follow up with Sam" from To Do to In Progress using the detail view's lane pills, **When** an authorized agent calls the MCP tool that lists the board, **Then** the response shows "Follow up with Sam" under In Progress, proving a move made from the detail view is visible through the same data agents see.

---

### Edge Cases

- Clicking the pill for a lane that is currently empty still moves the card there, and the card appears alone in that lane — same as dropping into an empty lane on the board.
- If a move fails to save, the pill row must not show the destination lane as current — it must reflect the card's actual last-saved lane, consistent with how a failed drag-and-drop move is handled.
- Clicking a different pill again before a prior move has finished saving resolves to the last-clicked lane once saving settles — no lost or duplicated moves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The task detail view MUST render all configured lanes as an ordered row of pills directly under the card title, in the same order as the lane configuration, replacing the existing plain-text lane display with no added section header.
- **FR-002**: The pill for the task's current lane MUST be visually marked as current and MUST NOT act as a move target when clicked.
- **FR-003**: Each pill for a lane other than the task's current lane MUST be clickable and MUST move the task to that lane immediately on click, with no confirmation step.
- **FR-004**: A move triggered from a lane pill MUST place the task at the bottom of the destination lane, matching the default position used by drag-and-drop and the existing MCP move tool.
- **FR-005**: After a successful move, the pill row MUST update immediately so the destination lane is marked current and the previous lane is no longer marked current.
- **FR-006**: A move made via lane pills MUST persist: after a page reload, the detail view's pill row and the kanban board both reflect the new lane and the bottom-of-lane position.
- **FR-007**: A task MUST be movable directly from its current lane to any other configured lane in a single click, including lanes that are not adjacent to the current one.
- **FR-008**: A move made via lane pills MUST be visible through the existing MCP board-listing tool, showing the task under its new lane with no discrepancy from the UI.
- **FR-009**: This control MUST reuse the existing move operation used by drag-and-drop and the MCP move tool; no new MCP tools are introduced and no existing MCP tool's behavior changes.
- **FR-010**: The kanban card face on the board MUST remain unchanged (title only) — this feature only changes the task detail view.

### Key Entities

- **Task (card)**: Gains a lane-move control in its detail view. A move initiated from this control produces the exact same result — lane membership and bottom-of-lane position — as a move made by dragging on the board or by the MCP move tool.
- **Lane**: One of the four configured lanes (To Do, In Progress, Waiting, Done), unchanged from `create-task`; still defined by the lane configuration file and shown in that fixed order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can move a task from its detail view to any of the other three lanes in a single click, with no navigation back to the board and no confirmation step.
- **SC-002**: 100% of moves made via lane pills land the task at the bottom of the destination lane, matching drag-and-drop and MCP move behavior, and persist through a page reload.
- **SC-003**: The detail view shows exactly one pill marked current at all times, and it always matches the task's actual lane, including immediately after a move and after a reload.
- **SC-004**: 100% of moves made via the detail view are visible to MCP clients through the existing board-listing tool, with no discrepancy from what the UI shows.

## Assumptions

- The lane pill control calls the same underlying move operation that already backs drag-and-drop (`move-task-between-lanes`) and the MCP move tool (`mcp-move-tasks`); no new move logic is introduced, only a new UI entry point to the existing one.
- Visual styling of the pills follows this app's existing UI conventions (palette tokens, card-contained styling) rather than introducing a new visual pattern; exact styling is left to implementation.
- No confirmation dialog, toast notification, or move animation is added beyond the pill row updating, consistent with how attaching a tag or linking a person already behaves.
- No dedicated touch/mobile design pass is required; the control is click-based and works with the app's existing responsive layout by default.
