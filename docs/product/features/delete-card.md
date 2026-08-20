# Feature: delete-card

## User story

As Tyler, I want to delete a card from its detail view, with a confirmation prompt so I don't do it by accident, so that I can clean up cards I no longer need without leaving the app or going through an agent.

## Acceptance criteria

"Card" means a task on the kanban board (the same entity `create-task` introduced). The configured lanes are To Do, In Progress, Waiting, Done, per `create-task`. All card titles are illustrative concrete test data.

- **Given** a card "Follow up with Sam" in the "To Do" lane
  **When** I open its detail view
  **Then** I see a delete control near the title, alongside the existing lane pills

- **Given** the detail view of "Follow up with Sam"
  **When** I click the delete control
  **Then** a confirmation box appears showing the card's title and a warning that this can't be undone, and the card is not yet deleted

- **Given** the confirmation box is open for "Follow up with Sam"
  **When** I click cancel (or otherwise dismiss it)
  **Then** the confirmation box closes, no deletion happens, and I'm still on "Follow up with Sam"'s detail view

- **Given** the confirmation box is open for "Follow up with Sam"
  **When** I confirm the deletion
  **Then** the card is deleted and I'm taken back to the kanban board, where "Follow up with Sam" no longer appears in any lane

- **Given** "Follow up with Sam" is linked to the conversation "Pricing question" and to a person "Sam Rivera" (per `card-email-links` and person-linking)
  **When** I delete "Follow up with Sam" via the confirmation box
  **Then** the card and its links are gone, but "Pricing question" still appears on the Emails page and "Sam Rivera" still exists as a person, unaffected

- **Given** I deleted "Follow up with Sam" from the web UI
  **When** an authorized agent calls the MCP tool that lists the board
  **Then** the response no longer includes "Follow up with Sam" in any lane, proving the deletion is visible through the same data agents see

## Out of scope

- Any MCP delete-card tool — deletion is a web-UI-only action for this slice, per Tyler's request; agents cannot delete cards.
- Bulk delete (deleting multiple cards at once) — one card at a time only.
- Undo / trash / soft-delete / restore — deletion is immediate and permanent once confirmed; no recovery path in this slice.
- Deleting from the kanban board itself (e.g. a delete button on the card face, right-click menu, or drag-to-trash) — this slice only adds delete from the detail view.
- Any change to how linked emails or people are displayed elsewhere — deleting a card only removes the card's own links; the linked email conversations and people are untouched, as the acceptance criteria show.

## Open questions

None — ready for `/speckit-specify`.
