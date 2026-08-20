# Feature: move-task-from-detail-view

## User story

As Tyler, I want a card's detail view to show its lane as more than plain text and let me move it to a different lane right there, so that I don't have to go back to the board and find the card just to change where it sits.

## Acceptance criteria

The configured lanes are To Do, In Progress, Waiting, Done (from the lane config file, per create-task), always shown in that order. All card titles are illustrative concrete test data. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow.

- **Given** a card "Follow up with Sam" in the "To Do" lane
  **When** I open its detail view
  **Then** directly under the title, in place of the old "Lane: To Do" text, I see all four configured lanes rendered as a row of pills in order, "To Do" visually marked as the current lane and the other three shown as clickable move targets — no section header, just the improved control where the text used to be

- **Given** the detail view of "Follow up with Sam" showing the lane pills with "To Do" current
  **When** I click the "In Progress" pill
  **Then** the card moves to In Progress immediately with no confirmation dialog, the pill row updates so "In Progress" is now marked current and "To Do" is no longer marked current, and this is still true after a page reload

- **Given** In Progress contains, top to bottom, "Write proposal" and "Review budget", and "Follow up with Sam" is in To Do
  **When** I open "Follow up with Sam"'s detail view and click the "In Progress" pill
  **Then** the kanban board shows In Progress as, top to bottom, "Write proposal", "Review budget", "Follow up with Sam" — the card lands at the bottom, the same default landing spot used by drag-and-drop and the MCP move tool — and this survives a page reload

- **Given** the detail view of "Follow up with Sam" showing "To Do" as its current lane
  **When** I click the "To Do" pill (its own current lane)
  **Then** nothing changes — the card stays in To Do at its existing position, and the pill row is unchanged, proving the current lane's pill is not an actionable move target

- **Given** "Follow up with Sam" is in the Waiting lane
  **When** I open its detail view and click the "Done" pill
  **Then** the card moves directly to Done, skipping In Progress, proving the control can move a card to any lane in one click, not just an adjacent one

- **Given** I moved "Follow up with Sam" from To Do to In Progress using the detail view's lane pills
  **When** an authorized agent calls the MCP tool that lists the board
  **Then** the response shows "Follow up with Sam" under In Progress, proving a move made from the detail view is visible through the same data agents see

## Out of scope

- Drag-and-drop — unchanged, still the board-level mechanism from `move-task-between-lanes`; this control is click-only.
- Any position picker or within-lane reordering from this control — a move always lands the card at the bottom of the destination lane, matching the MCP move tool's default when no position is given; reordering within a lane still happens only by dragging on the board.
- New MCP tools or any change to existing ones — `mcp-move-tasks` already lets agents move and position cards; this feature only adds a UI path for Tyler, reusing that same underlying move.
- Any change to the kanban card face — cards still show title only; no lane-progress indicator appears on the board itself (see the `kanban-card-indicators` stub). This feature only changes the task detail view.
- Confirmation dialogs, toast notifications, or move animations beyond the pill row updating — toasts are deferred to the `ui-polish` stub, matching the `ui-refresh` decision; the moved pill re-highlighting is the only feedback in this slice.
- Lane management (creating, renaming, reordering, or deleting lanes) — lanes are still config-file-defined, unchanged from `create-task`.
- Any dedicated touch/mobile pass — the control is click-based (not drag), so it works with the app's existing responsive layout by default, but no mobile-specific design work is in this slice.

## Open questions

All resolved with Tyler during the feature interview (2026-08-20):

- Control design: a row of lane pills in configured order, current lane highlighted, any other pill clickable to move there directly (not a dropdown, not prev/next steppers).
- Landing position: bottom of the destination lane, matching drag-and-drop and the MCP move tool's default.
- Confirmation: none — moving is immediate on click, matching how attaching a tag or linking a person already works.
- Placement: stays at the top of the page, compact, right where the old "Lane: X" text was — no new section header.
- None remaining — ready for `/speckit-specify`.
