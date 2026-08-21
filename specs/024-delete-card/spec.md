# Feature Specification: delete-card

**Feature Branch**: `024-delete-card`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "As Tyler, I want to delete a card from its detail view, with a confirmation prompt so I don't do it by accident, so that I can clean up cards I no longer need without leaving the app or going through an agent."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete a card with confirmation (Priority: P1)

Tyler is viewing a card's detail view and decides it's no longer needed. He clicks a delete control near the title, sees a confirmation box naming the card and warning that deletion is permanent, and confirms. The card disappears from the board entirely.

**Why this priority**: This is the entire feature — without it there is no way to clean up stale cards from the detail view.

**Independent Test**: Open a card's detail view, click delete, confirm in the dialog, and verify the card no longer appears in any lane on the board.

**Acceptance Scenarios**:

1. **Given** a card "Follow up with Sam" in the "To Do" lane, **When** I open its detail view, **Then** I see a delete control near the title, alongside the existing lane pills.
2. **Given** the detail view of "Follow up with Sam", **When** I click the delete control, **Then** a confirmation box appears showing the card's title and a warning that this can't be undone, and the card is not yet deleted.
3. **Given** the confirmation box is open for "Follow up with Sam", **When** I confirm the deletion, **Then** the card is deleted and I'm taken back to the kanban board, where "Follow up with Sam" no longer appears in any lane.

---

### User Story 2 - Cancel a delete in progress (Priority: P2)

Tyler opens the confirmation box but changes his mind, or clicks delete by mistake. He dismisses the confirmation and lands back exactly where he was, with the card untouched.

**Why this priority**: The confirmation step only protects against accidental deletion if canceling is reliable and lossless; without this the "confirmation" is theater.

**Independent Test**: Open the confirmation box for a card, dismiss it (via cancel or equivalent), and verify the card still exists and the detail view is unchanged.

**Acceptance Scenarios**:

1. **Given** the confirmation box is open for "Follow up with Sam", **When** I click cancel (or otherwise dismiss it), **Then** the confirmation box closes, no deletion happens, and I'm still on "Follow up with Sam"'s detail view.

---

### User Story 3 - Deleting a card leaves linked data untouched (Priority: P2)

Tyler deletes a card that's linked to an email conversation and a person. Only the card and its own links disappear — the linked conversation and person remain fully intact, and the deletion is visible everywhere the board's state is read, including through the MCP tools agents use.

**Why this priority**: Cards are frequently linked to emails and people; if deletion cascaded into that data or was invisible to agents, it would silently corrupt the CRM's other records or create a split-brain view between the web UI and MCP tools.

**Independent Test**: Link a card to a conversation and a person, delete the card, then verify the conversation still appears on the Emails page, the person still exists, and an MCP board listing no longer includes the deleted card.

**Acceptance Scenarios**:

1. **Given** "Follow up with Sam" is linked to the conversation "Pricing question" and to a person "Sam Rivera", **When** I delete "Follow up with Sam" via the confirmation box, **Then** the card and its links are gone, but "Pricing question" still appears on the Emails page and "Sam Rivera" still exists as a person, unaffected.
2. **Given** I deleted "Follow up with Sam" from the web UI, **When** an authorized agent calls the MCP tool that lists the board, **Then** the response no longer includes "Follow up with Sam" in any lane.

---

### Edge Cases

- Confirming deletion on a card that was already deleted elsewhere (e.g. a stale detail view open in another tab) must not error the user into a broken state — the user ends up back on the board, and the card is (still) absent.
- Deleting a card removes its links to conversations and people, but never the conversations or people themselves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The card detail view MUST show a delete control near the title, alongside the existing lane pills.
- **FR-002**: Clicking the delete control MUST NOT delete the card immediately — it MUST first show a confirmation box.
- **FR-003**: The confirmation box MUST display the card's title and a warning that the deletion cannot be undone.
- **FR-004**: The confirmation box MUST offer a way to cancel that closes the box without deleting the card and leaves the user on the same detail view.
- **FR-005**: Confirming the deletion MUST permanently delete the card and MUST navigate the user back to the kanban board.
- **FR-006**: After deletion, the card MUST NOT appear in any lane on the kanban board.
- **FR-007**: Deleting a card MUST also remove that card's own links to conversations and people, without altering or deleting the linked conversations or people themselves.
- **FR-008**: Deletion MUST be visible through the same data path MCP tools use — after a web UI deletion, an MCP board listing MUST NOT include the deleted card.
- **FR-009**: The system MUST NOT expose any MCP tool capable of deleting a card — deletion is reachable only through the web UI detail view for this slice.
- **FR-010**: The system MUST only support deleting one card at a time from its own detail view — no bulk delete, and no delete affordance from the kanban board face itself (e.g. no delete button on the card, right-click menu, or drag-to-trash).
- **FR-011**: The system MUST NOT provide an undo, trash, soft-delete, or restore path — once confirmed, deletion is immediate and permanent.

### Key Entities

- **Card**: A task on the kanban board (the entity introduced by `create-task`), currently in one of the configured lanes (To Do, In Progress, Waiting, Done). Deletion removes the card and its links to conversations and people, but not those linked entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can delete an unwanted card from its detail view, with confirmation, in under 10 seconds.
- **SC-002**: 100% of cancel actions on the confirmation box result in zero data loss — the card and its links are unchanged.
- **SC-003**: 100% of confirmed deletions remove the card from every view that reads board state, including the kanban board and MCP board listings, with no stale reappearance.
- **SC-004**: 100% of confirmed deletions leave linked conversations and people fully intact and unchanged in their own views.

## Assumptions

- "Near the title, alongside the existing lane pills" refers to the card detail view's header area, consistent with where the lane-move control introduced by `move-task-from-detail-view` lives.
- The confirmation box is a synchronous, in-page dialog (e.g. modal) rather than a separate confirmation page or browser-native `confirm()` — consistent with the app's existing UI patterns for destructive or state-changing actions.
- No additional authorization/permission check is needed beyond the existing single-user access to the web UI, since work-helper is a self-hosted, single-user personal CRM.
- Deleting a card is a hard delete at the data layer (row removal), not a status flag, per the "no undo/trash/soft-delete" requirement in the feature's scope.
