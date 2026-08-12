# Feature Specification: Card–Email Links

**Feature Branch**: `020-card-email-links`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "docs/product/features/card-email-links.md — cards reference the email conversations they came from, linked and unlinked by agents through the work-helper MCP, with the links visible read-only on both the card's detail view and the conversation's detail view"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent links a conversation to a card and the link is visible everywhere (Priority: P1)

An authorized agent, having created or found a card that stems from an email thread, calls an MCP tool to link that conversation to the card. From then on the card's MCP detail response lists the conversation, the conversation's MCP detail response lists the card (with its lane), the card's web detail view shows the conversation in a linked-emails section (subject, participants, latest-message date), and the conversation's web detail view shows the card in a linked-cards section (title and lane). Links are many-to-many: a card can link several conversations and a conversation several cards, and every view lists all of them.

**Why this priority**: This is the feature's core value — traceability from a card back to its source correspondence. Without the link write path and its visibility, nothing else in the feature exists.

**Independent Test**: Seed a card and a synced conversation, call the link tool as an authorized agent, then verify the MCP detail responses and both web detail views show the link, including after a page reload.

**Acceptance Scenarios**:

1. **Given** the card "Follow up with Sam" exists and the synced store holds the conversation "Pricing question" (involving "Sam Rivera" \<sam.rivera@example.com\> and tyler@example.com, latest message 2026-08-05), with no links anywhere, **When** an authorized agent calls the tool that links a conversation to a card for "Follow up with Sam" and "Pricing question", **Then** the get-task response includes "Pricing question" among the card's linked conversations, the get-conversation response includes "Follow up with Sam" (with its lane) among the conversation's linked cards, and in the web app the card's linked-emails section shows "Pricing question" with its participants and latest-message date while the conversation's linked-cards section shows "Follow up with Sam" with its lane — all still true after a page reload.
2. **Given** the card "Follow up with Sam" is linked to "Pricing question", the synced conversation "Quote attached" exists unlinked, and a second card "Draft Q3 goals" exists, **When** an authorized agent links "Quote attached" to "Follow up with Sam" and links "Pricing question" to "Draft Q3 goals", **Then** the card "Follow up with Sam" lists both conversations and "Pricing question"'s linked-cards section lists both cards — in the MCP get-task and get-conversation responses and on both web detail views, all still true after a page reload.

---

### User Story 2 - Tyler traces links in the web app (Priority: P2)

Tyler opens a card's detail view and sees which email conversations it came from; he opens a conversation's detail view and sees which cards reference it. When nothing is linked, each section shows a styled empty-state message instead of a bare gap. Clicking a linked entry navigates to the other side's detail view. The web app never offers link create/remove controls — it displays links read-only.

**Why this priority**: Visibility is the human half of the feature — agents write the links, Tyler consumes them. It depends on User Story 1's data but is separately testable with seeded links.

**Independent Test**: With a seeded linked pair and a seeded unlinked pair, open both detail views and verify the populated sections, the empty states, and the cross-navigation clicks.

**Acceptance Scenarios**:

1. **Given** the card "Follow up with Sam" exists and the synced store holds the conversation "Pricing question", with no links anywhere, **When** I open the card's detail view and then the conversation's detail view, **Then** the card shows a linked-emails section with a styled empty-state message, and the conversation shows a linked-cards section with a styled empty-state message.
2. **Given** the card "Follow up with Sam" is linked to conversation "Pricing question", **When** I click the "Pricing question" entry in the card's linked-emails section, and separately click the "Follow up with Sam" entry in the conversation's linked-cards section, **Then** the first click opens the conversation's detail view and the second opens the card's detail view.

---

### User Story 3 - Agent unlinks a conversation without losing anything (Priority: P2)

An authorized agent removes a link between a card and a conversation via an MCP unlink tool. Only the link disappears: the card stays on the board unchanged, the conversation stays on the Emails page with all its messages, and the two can be re-linked later.

**Why this priority**: Links must be correctable — an agent that mislinks needs a safe undo. It is the inverse of User Story 1 and independently testable once links exist.

**Independent Test**: Seed a card linked to two conversations, unlink both via the MCP tool, then verify both empty states return and both the card and the conversations are otherwise intact.

**Acceptance Scenarios**:

1. **Given** the card "Follow up with Sam" is linked to conversations "Pricing question" and "Quote attached", **When** an authorized agent calls the tool that unlinks a conversation from a card for each of the two links, **Then** the card's linked-emails section is back to its empty state, neither conversation's linked-cards section lists the card, and both the card and the conversations are otherwise unchanged — the conversations still listed on the Emails page with all their messages, the card still on the board — all still true after a page reload.

---

### User Story 4 - Bad link requests fail clearly and change nothing (Priority: P3)

When an agent tries to create a link that already exists, or references a conversation that doesn't exist, the tool call fails with a specific error message and the existing links are untouched — no duplicates appear, nothing is silently dropped.

**Why this priority**: Error discipline keeps agent automation trustworthy, but it only matters once the happy path works.

**Independent Test**: Seed one existing link, replay the same link call and a call with a fabricated conversation id, and verify both errors and the unchanged single entry.

**Acceptance Scenarios**:

1. **Given** the card "Follow up with Sam" is linked to conversation "Pricing question", **When** an authorized agent calls the link tool again for the same card and conversation, and then calls the link tool with a conversation id that doesn't exist, **Then** the duplicate call fails with a validation error saying the link already exists, the nonexistent-id call fails with an error saying the conversation was not found, and the card's linked-emails section still shows exactly one "Pricing question" entry.

---

### User Story 5 - Agent creates a card from an email and links it (Priority: P3)

An agent reading an email thread decides it warrants a task: it calls the existing create-task tool, then calls the link tool to attach the source conversation to the new card. The new card appears in the board's first lane ("To Do") with the conversation in its linked-emails section, and the conversation lists the new card.

**Why this priority**: This is the composed end-to-end workflow the feature exists to enable, but it introduces no new capability beyond User Story 1 plus the existing create-task tool.

**Independent Test**: With a seeded unlinked conversation, call create-task then the link tool as an authorized agent, and verify the new card's lane, its linked-emails section, and the conversation's linked-cards section.

**Acceptance Scenarios**:

1. **Given** the synced conversation "Quote attached" exists with no linked cards and no card titled "Send Sam the quote" exists, **When** an authorized agent calls create-task with title "Send Sam the quote" and then links "Quote attached" to the new card, **Then** the card "Send Sam the quote" appears in the "To Do" lane in the web app, its detail view shows "Quote attached" in its linked-emails section, and the conversation's linked-cards section lists "Send Sam the quote" — all still true after a page reload.

---

### Edge Cases

- Linking with a card id that doesn't exist fails with an error saying the card was not found, mirroring the nonexistent-conversation case.
- Unlinking a card–conversation pair that isn't linked fails with an error saying the link was not found, and nothing changes.
- A card linked to many conversations (or a conversation linked to many cards) shows every entry — there is no pagination or truncation of either section.
- Deleting a card that has links removes the card's links along with it; the linked conversations are unaffected and remain fully intact.
- Link and unlink calls from an unauthenticated or unauthorized MCP client are rejected the same way other MCP write tools reject them.
- A linked conversation whose thread receives new synced messages keeps its link; the card's linked-emails entry reflects the conversation's updated latest-message date.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server MUST expose a tool that links an email conversation to a card, callable only by an authorized agent (an MCP client authenticated per the mcp-authentik-auth flow).
- **FR-002**: The MCP server MUST expose a tool that unlinks a conversation from a card, under the same authorization.
- **FR-003**: Links MUST be conversation-level and many-to-many: one card can link multiple conversations and one conversation can link multiple cards; individual messages are never link targets.
- **FR-004**: The get-task response MUST include the card's linked conversations; the get-conversation response MUST include the conversation's linked cards, each card with its lane.
- **FR-005**: A link tool call for a card–conversation pair that is already linked MUST fail with a validation error stating the link already exists, leaving the existing link intact.
- **FR-006**: A link or unlink tool call referencing a conversation id or card id that doesn't exist MUST fail with an error stating which entity was not found, changing nothing.
- **FR-007**: The card detail view MUST show a linked-emails section listing every linked conversation with its subject, participants, and latest-message date, and a styled empty-state message when the card has no links.
- **FR-008**: The conversation detail view MUST show a linked-cards section listing every linked card with its title and lane, and a styled empty-state message when the conversation has no links.
- **FR-009**: Each linked-emails entry MUST navigate to that conversation's detail view when clicked; each linked-cards entry MUST navigate to that card's detail view when clicked.
- **FR-010**: The web app MUST NOT offer any control that creates or removes links — both sections are read-only displays.
- **FR-011**: Links MUST persist: every link and unlink outcome survives a page reload and appears identically in the MCP responses and the web views.
- **FR-012**: Unlinking MUST remove only the link: the card remains on the board unchanged and the conversation remains on the Emails page with all its messages, and the pair can be re-linked afterwards.
- **FR-013**: The list-board and list-conversations responses MUST NOT change — linked conversations and cards appear only in the detail responses (get-task, get-conversation).
- **FR-014**: The create-task tool MUST NOT change — it gains no conversation parameter; creating a card from an email is create-task followed by the link tool.
- **FR-015**: Both linked sections MUST show all links without pagination.

### Key Entities

- **Card**: A task on the kanban board (the entity create-task introduced), identified by its id, with a title and a lane. Gains a collection of linked conversations.
- **Conversation**: A synced email thread in the store, with a subject, participants, messages, and a latest-message date. Gains a collection of linked cards.
- **Card–Conversation Link**: The association between one card and one conversation. At most one link exists per pair; removing it deletes nothing but the association itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized agent can link a conversation to a card with a single tool call, and the link is visible in both MCP detail responses and both web detail views immediately and after a page reload — 100% of the acceptance scenarios above pass against a seeded store.
- **SC-002**: Tyler can get from a card to any of its source conversations, or from a conversation to any of its cards, in one click from the detail view.
- **SC-003**: Every invalid link attempt (duplicate pair, unknown conversation, unknown card) returns a specific error and leaves the stored links byte-for-byte unchanged — zero duplicate or phantom links are ever displayed.
- **SC-004**: Unlinking is fully non-destructive: after any sequence of link and unlink calls, the number of cards, conversations, and messages in the system is exactly what it was before the sequence began.
- **SC-005**: Detail views with no links show a deliberate empty state — a user opening an unlinked card or conversation sees a styled message, never a blank or broken section.

## Assumptions

- Linked-conversation entries on a card show subject, participants, and latest-message date; linked-card entries on a conversation show title and lane — enough to distinguish similar entries without recreating full list rows (flagged in the PRD as an assumption to confirm; Tyler can veto at acceptance).
- Unlinking never deletes anything — the card and the conversation both survive any link change, and re-linking later is always possible (likewise flagged for confirmation in the PRD).
- Exact MCP tool names and response field shapes are deferred to `/speckit-plan`; the criteria hold regardless of naming.
- Automated criteria run against a synced store seeded by test setup (per the email-ui precedent); Tyler's manual acceptance pass uses his real synced mail.
- The board's first lane is "To Do" per the configured lanes, so a newly created card lands there.
- "An authorized agent" reuses the existing mcp-authentik-auth authentication — this feature adds no new auth model.
- All names, subjects, dates, and addresses in the scenarios are illustrative concrete test data, not literals the implementation depends on.

## Out of Scope

- Any UI for creating or removing links — no search/add or remove controls on the card detail, and no create-card or link-existing-card controls on the conversation detail (recorded in the `card-email-links-ui` stub).
- Linking an individual message — links are conversation-level only.
- Any change to the kanban card face (email chips, counts, icons) and any has-linked-cards indicator on Emails page list rows (recorded in the `kanban-card-indicators` stub).
- Auto-suggesting or auto-creating links — all linking is a deliberate agent act in this slice.
- Pagination of the linked-emails and linked-cards sections.
- Any change to email sync, the Emails page list rows, person-record email sections, or the snapshot rule.
- Changes to the MCP create-task tool.
- Links in the list-board and list-conversations responses.
- Bulk link/unlink tools.
- Authentication / multi-user access control changes.
