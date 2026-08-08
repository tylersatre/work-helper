# Feature: move-task-between-lanes

## User story

As Tyler, I want to drag task cards between kanban lanes — and reorder them within a lane — so that tasks can actually progress through To Do, In Progress, Waiting, and Done instead of piling up in the first lane, and the board shows every card exactly where I put it.

## Acceptance criteria

The configured lanes are To Do, In Progress, Waiting, Done (from the lane config file, per create-task). "An authorized agent" means an MCP client authenticated per the mcp-server feature. All card titles are illustrative concrete test data.

- **Given** a card "Follow up with Sam" in To Do and the other lanes empty
  **When** I drag "Follow up with Sam" and drop it in the empty In Progress lane
  **Then** "Follow up with Sam" appears in In Progress and no longer appears in To Do — and it is still in In Progress after a page reload

- **Given** "Follow up with Sam" now in In Progress
  **When** I drag it and drop it in Done
  **Then** it appears in Done and in no other lane — proving a card can keep moving lane to lane, not just leave the first one — and it is still in Done after a page reload

- **Given** In Progress contains "Write proposal" above "Review budget", and To Do contains "Draft Q3 goals"
  **When** I drag "Draft Q3 goals" and drop it between "Write proposal" and "Review budget"
  **Then** In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget" — and this order survives a page reload

- **Given** To Do contains, top to bottom: "Book venue", "Order catering", "Send invites"
  **When** I drag "Send invites" and drop it above "Book venue" in the same lane
  **Then** To Do shows, top to bottom: "Send invites", "Book venue", "Order catering" — and this order survives a page reload

- **Given** To Do contains, top to bottom: "Book venue", "Order catering"
  **When** I drag "Book venue" and release it outside any lane
  **Then** the board is unchanged — To Do still shows "Book venue" above "Order catering", and no card has changed lane or position

- **Given** To Do contains, top to bottom: "Book venue", "Order catering"
  **When** I create a new task "Send invites"
  **Then** To Do shows, top to bottom: "Book venue", "Order catering", "Send invites" — new cards append at the bottom of the first lane

- **Given** a card "Follow up with Sam" in To Do
  **When** I move it to Waiting and open its detail view
  **Then** the detail view shows "Waiting" as the task's lane, read-only — there is no control there to change it

- **Given** the board arranged via UI drags so that To Do shows "Book venue" above "Order catering" and In Progress shows, top to bottom: "Write proposal", "Draft Q3 goals", "Review budget"
  **When** an authorized agent calls the MCP tool that lists the board
  **Then** the response shows each task under its current lane, with the tasks in each lane in the same top-to-bottom order as the board

## Out of scope

- Moving or reordering tasks via MCP — this slice only requires the existing board-listing tool to reflect the board truthfully; move/reorder write tools stay in the `mcp-tool-expansion` stub (per the mcp-server decision that MCP mirrors the UI, they are unblocked once this ships).
- Any non-drag move mechanism — no move menu, buttons, or keyboard-driven moving; drag-and-drop is the only mechanism in this slice.
- Changing a task's lane from the detail view — the detail view displays the lane, nothing more.
- Automatic sorting or filtering of cards — manual order is the only order; the brief's kanban sorting/filtering is future work (see the `kanban-sort-filter` stub).
- Special treatment of any lane — no completed styling, archiving, or auto-clearing for Done; lanes are config-defined names the app doesn't special-case. (A deliberate decision, not a deferral.)
- Touch/mobile drag support — desktop mouse interaction only in this slice.
- Bulk or multi-card moves.
- Lane management UI — unchanged from create-task: lanes come from the config file.
- Any change to what a card face displays (see the `kanban-card-indicators` stub) — cards look the same, they just move.

## Open questions

All resolved with Tyler during the feature interview (2026-08-08):

- Drag-and-drop, a move menu, or both?
  - Drag-and-drop only.
- Is within-lane reordering part of this slice?
  - Yes — dragging also reorders cards within a lane, and the order persists.
- Where does a dropped card land in the destination lane?
  - Exactly where it was dropped; that position persists.
- Where do newly created tasks land now that order is manual?
  - Bottom of the first lane (append below existing cards).
- Does the task detail view get lane features?
  - It shows the task's current lane, read-only — moving happens only on the board.
- Anything special when a card reaches Done?
  - No — Done is an ordinary configured lane.
- Should the MCP board listing reflect the UI?
  - Yes — lane and within-lane order, via the existing listing tool; no new tools.
- None remaining — ready for `/speckit-specify`.
