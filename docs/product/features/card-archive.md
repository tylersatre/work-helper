# Feature: card-archive

## User story

As Tyler, I want to archive a kanban card — hiding it instead of destroying it, with an unarchive path back — so that leftover import duplicates and dead cards stop having to be "closed" into Done just to get them off the board, while still being recoverable if I need them.

## Acceptance criteria

"Card" means a task on the kanban board (the same entity `create-task` introduced). The configured lanes are To Do, In Progress, Waiting, Done, per `create-task`. "An authorized agent" means an MCP client authenticated per the `mcp-authentik-auth` flow. All card titles are illustrative concrete test data.

- **Given** a card "Follow up with Sam" in the To Do lane, not archived
  **When** I open its detail view
  **Then** I see an archive control near the title, alongside the existing lane pills and the delete control

- **Given** the detail view of "Follow up with Sam"
  **When** I click the archive control
  **Then** the card is archived immediately with no confirmation step, and I'm taken back to the board, where "Follow up with Sam" no longer appears in any lane (the filter bar's "Show archived" toggle is off by default)

- **Given** "Follow up with Sam" is archived
  **When** I turn on the "Show archived" toggle in the filter bar
  **Then** "Follow up with Sam" reappears in the To Do lane, rendered dimmed with an "Archived" badge, in its normal position among the lane's other cards

- **Given** the "Show archived" toggle is on and "Follow up with Sam" is shown archived in To Do
  **When** I open its detail view
  **Then** I see an unarchive control in place of the archive control, and its notes and its links to people, companies, and email conversations are unchanged from before archiving

- **Given** "Follow up with Sam" is archived
  **When** I click the unarchive control
  **Then** the card becomes active again immediately, appears at the bottom of the To Do lane (its original lane) even with the "Show archived" toggle off, and its detail view shows the archive control again

- **Given** "Write proposal" is active in the In Progress lane
  **When** I archive it from its detail view
  **Then** it disappears from the board with the toggle off and reappears dimmed with an "Archived" badge in In Progress with the toggle on — archiving works the same from any lane, not just Done

- **Given** the "Show archived" toggle is on, and archived cards "Follow up with Sam" (title contains "Sam") and "Draft goals" (title does not) both exist
  **When** I search "sam" in the board-search-filter's search input
  **Then** "Follow up with Sam" still appears (dimmed, badged) and "Draft goals" does not — the text filter applies to archived cards exactly as it does to active ones

- **Given** "Follow up with Sam" is archived
  **When** an authorized agent calls the `list-board` MCP tool without an include-archived argument, then calls it again with include-archived
  **Then** the first response does not include "Follow up with Sam" in any lane, and the second includes it in its lane, flagged as archived

- **Given** "Draft Q3 goals" is active in To Do
  **When** an authorized agent calls the archive-card MCP tool for it, then the unarchive-card MCP tool for it
  **Then** after archiving it disappears from the board with the toggle off and from `list-board`'s default response, and after unarchiving it reappears in To Do at the bottom, active, in both the web UI and `list-board`'s default response

- **Given** the "Show archived" toggle is on
  **When** I reload the page
  **Then** the toggle is still on and archived cards are still shown — the toggle persists like `board-search-filter`'s filter

## Out of scope

- Any change to `delete-card` — deletion remains permanent and UI-only; archive and delete coexist as separate actions, and agents still cannot delete.
- Bulk archive/unarchive (multiple cards at once).
- Archiving from the card face or board view directly — this slice's archive/unarchive controls live only in the detail view; a quick action on the card face is a future enhancement.
- A dedicated "Archived" page or view — archived cards are reached only via the board's "Show archived" toggle, not a separate page.
- Auto-archiving (e.g. on a schedule, or when a card sits in Done for N days) — archiving is always a deliberate action, by a human or an agent.
- Any visual indicator on card faces beyond the archived dimmed/badge state — the `kanban-card-indicators` stub covers linked-people/notes/tag chips separately.
- Changes to `board-search-filter`'s tag selector or its own persistence mechanism — the archive toggle is a new, independent control alongside it.

## Open questions

Interview resolved (2026-08-24): archived cards stay in their lane behind a "Show archived" toggle in the filter bar (not a separate view or lane); archiving is allowed from any lane; unarchiving always returns a card to its original lane, appended at the bottom; `list-board` hides archived cards by default with an include-archived argument to show them; the archive/unarchive control lives in the card detail view only, mirroring `delete-card`'s placement; no confirmation step, since archiving is reversible; archived cards render dimmed with an "Archived" badge; the board-search-filter's text and tag filters apply to archived cards the same as active ones when the toggle is on; both the web UI and MCP (archive-card / unarchive-card tools) can archive and unarchive, per the `task-archive` stub's decision that agents may archive but still cannot delete.

None remaining — ready for `/speckit-specify`.
