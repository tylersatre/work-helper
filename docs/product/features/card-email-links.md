# Feature: card-email-links

## User story

As Tyler, I want cards to reference the email conversations they came from — linked and unlinked by agents through the work-helper MCP, with the links visible on both the card's detail view and the conversation's detail view — so that a card an agent creates from an email stays traceable to its source correspondence.

## Acceptance criteria

"Card" means a task on the kanban board (the same entity create-task introduced). Links are at the conversation level: a card can link multiple conversations and a conversation multiple cards. Links are created and removed only through MCP tools — the web app displays them read-only. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. Criteria run against a synced store seeded by test setup (per the email-ui precedent); Tyler's manual acceptance pass uses his real synced mail. The board's first lane is "To Do" per the configured lanes. All subjects, titles, people, and dates are illustrative concrete test data.

- **Given** the card "Follow up with Sam" exists and the synced store holds the conversation "Pricing question" (involving "Sam Rivera" \<sam.rivera@example.com\> and tyler@example.com, latest message 2026-08-05), with no links anywhere
  **When** I open the card's detail view and then the conversation's detail view
  **Then** the card shows a linked-emails section with a styled empty-state message, and the conversation shows a linked-cards section with a styled empty-state message

- **Given** the unlinked card and conversation above
  **When** an authorized agent calls the tool that links a conversation to a card for "Follow up with Sam" and "Pricing question"
  **Then** the get-task response includes "Pricing question" among the card's linked conversations, the get-conversation response includes "Follow up with Sam" (with its lane) among the conversation's linked cards, and in the web app the card's linked-emails section shows "Pricing question" with its participants and latest-message date while the conversation's linked-cards section shows "Follow up with Sam" with its lane — all still true after a page reload

- **Given** the card "Follow up with Sam" is linked to conversation "Pricing question"
  **When** I click the "Pricing question" entry in the card's linked-emails section, and separately click the "Follow up with Sam" entry in the conversation's linked-cards section
  **Then** the first click opens the conversation's detail view and the second opens the card's detail view

- **Given** the card "Follow up with Sam" is linked to "Pricing question", the synced conversation "Quote attached" exists unlinked, and a second card "Draft Q3 goals" exists
  **When** an authorized agent links "Quote attached" to "Follow up with Sam" and links "Pricing question" to "Draft Q3 goals"
  **Then** the card "Follow up with Sam" lists both conversations and "Pricing question"'s linked-cards section lists both cards — in the MCP get-task and get-conversation responses and on both web detail views, all still true after a page reload

- **Given** the card "Follow up with Sam" is linked to conversations "Pricing question" and "Quote attached"
  **When** an authorized agent calls the tool that unlinks a conversation from a card for each of the two links
  **Then** the card's linked-emails section is back to its empty state, neither conversation's linked-cards section lists the card, and both the card and the conversations are otherwise unchanged — the conversations still listed on the Emails page with all their messages, the card still on the board — all still true after a page reload

- **Given** the card "Follow up with Sam" is linked to conversation "Pricing question"
  **When** an authorized agent calls the link tool again for the same card and conversation, and then calls the link tool with a conversation id that doesn't exist
  **Then** the duplicate call fails with a validation error saying the link already exists, the nonexistent-id call fails with an error saying the conversation was not found, and the card's linked-emails section still shows exactly one "Pricing question" entry

- **Given** the synced conversation "Quote attached" exists with no linked cards and no card titled "Send Sam the quote" exists
  **When** an authorized agent calls create-task with title "Send Sam the quote" and then links "Quote attached" to the new card
  **Then** the card "Send Sam the quote" appears in the "To Do" lane in the web app, its detail view shows "Quote attached" in its linked-emails section, and the conversation's linked-cards section lists "Send Sam the quote" — all still true after a page reload

## Out of scope

- Any UI for creating or removing links — no search/add or remove controls on the card detail, and no create-card or link-existing-card controls on the conversation detail. Tyler decided MCP-only linking is enough for this slice; the in-app controls (whose shape the interview already settled) are recorded in the new `card-email-links-ui` stub.
- Linking an individual message — links are conversation-level only, by deliberate choice in the interview (a card created from one message links its whole thread; no per-message pinpointing).
- Any change to the kanban card face (email chips, counts, icons) — board rendering is unchanged; recorded in the `kanban-card-indicators` stub.
- A has-linked-cards indicator on Emails page list rows — offered in the interview, not chosen; linked cards are visible only on the conversation detail view. Recorded alongside the card-face idea in the `kanban-card-indicators` stub.
- Auto-suggesting or auto-creating links (e.g. suggesting cards for a conversation, or auto-linking a new card's people from the conversation's participants) — all linking is a deliberate agent act in this slice.
- Pagination of the linked-emails and linked-cards sections — both always show every link (decided in the interview; a card realistically links a handful of threads).
- Any change to email sync, the Emails page list rows, person-record email sections, or the snapshot rule — this feature only adds links over data that already exists.
- Changes to the MCP create-task tool — it gains no conversation parameter; an agent creating a card from an email calls create-task and then the new link tool, as the last criterion exercises.
- Links in the list-board and list-conversations responses — linked conversations and cards appear in the detail responses (get-task, get-conversation) only.
- Bulk link/unlink tools.
- Authentication / multi-user access control.

## Open questions

Interview resolved (2026-08-12): links are conversation-level; full MCP write surface (link and unlink tools, linked conversations in get-task, linked cards in get-conversation, duplicate and unknown-id calls rejected with validation errors); the web app shows the links read-only — a linked-emails section on the card detail and a linked-cards section on the conversation detail, each with a styled empty state, no pagination, and entries that navigate to the other side. Tyler descoped all in-app link/unlink/create controls to the `card-email-links-ui` stub during doc review — agents make the links; the UI shows them.

- **Assumption to confirm:** linked-conversation entries on a card show subject, participants, and latest-message date; linked-card entries on a conversation show title and lane — enough to distinguish similar entries without recreating full list rows.
- **Assumption to confirm:** unlinking never deletes anything — the card and the conversation both survive any link change, and re-linking later is always possible.
- Exact MCP tool names and response field shapes are `/speckit-plan` decisions; the criteria hold either way.
