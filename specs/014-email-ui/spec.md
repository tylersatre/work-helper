# Feature Specification: Email UI — Browse Synced Email

**Feature Branch**: `014-email-ui`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "docs/product/features/email-ui.md — browse synced email inside work-helper: an Emails page listing conversations with a full detail view, correspondence shown on each person's record, and the ability to link an unmatched address to a person (or create the person) right from an email."

## Clarifications

### Session 2026-08-11

- Q: When one conversation involves a person through several of their addresses, or in several roles across its messages, what should that conversation's row in the person's email section show? → A: Every distinct involved address, each with all of its distinct roles (e.g. "sam.rivera@example.com — to, cc").
- Q: How should the detail view render a message whose stored body is plain text rather than HTML? → A: As escaped plain text with line breaks and blank-line paragraphs preserved; URLs stay plain text (no auto-linking).
- Q: How should a conversation whose subject is empty appear in the Emails list and the detail view? → A: A styled "(no subject)" placeholder wherever the subject would appear.
- Q: Should embedded/inline attachments (e.g. signature images) count toward the attachment indicator and the detail view's attachment list? → A: No — scope expands: sync records each attachment's inline/embedded flag (data-preserving schema migration), and email views exclude inline attachments from the indicator and the attachment list.
- Q: How should attachment rows already stored in production (synced before the inline flag existed) be treated? → A: A one-time backfill re-fetches attachment metadata for stored messages that have attachment rows and records the inline flag, so historical mail filters correctly too.

## User Scenarios & Testing *(mandatory)*

All scenarios read the existing synced email store — this feature changes no MCP behavior, and its only sync change is recording each attachment's inline/embedded flag (see FR-018). Scenarios run against a synced store seeded by test setup (seeding mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass browses his real synced mail. All subjects, people, addresses, and dates below are illustrative concrete test data.

### User Story 1 - Browse conversations on the Emails page (Priority: P1)

As Tyler, I open an Emails page from the top navigation and see my synced conversations listed newest-first, so I can scan recent correspondence at a glance without going through MCP tools.

**Why this priority**: This is the entry point for the whole feature — without a list there is nothing to open, and it alone already gives a readable overview of synced mail that does not exist in the UI today.

**Independent Test**: Can be fully tested by seeding conversations into the synced store, opening the Emails page from the nav, and checking ordering, row contents, indicators, paging, and the empty state — no detail view needed.

**Acceptance Scenarios**:

1. **Given** no email has ever been synced, **When** I open the Emails page via an "Emails" link in the top navigation bar, **Then** the nav marks Emails as the active section and the page shows a styled empty-state message (e.g. "No conversations yet") instead of a list.
2. **Given** a synced conversation "Pricing question" (2 messages, latest 2026-08-05, all read, no attachments) and a synced conversation "Quote attached" (1 message, received 2026-08-06, unread, one attachment), both involving "Sam Rivera" \<sam.rivera@example.com\> and tyler@example.com, **When** I open the Emails page, **Then** "Quote attached" is listed above "Pricing question" (ordered by latest message, newest first), each row shows subject, participants, message count, and latest-message date, and "Quote attached" shows an unread indicator and an attachment indicator while "Pricing question" shows neither.
3. **Given** 30 synced conversations, **When** I open the Emails page and then activate the load-more control, **Then** the list first shows the 25 conversations with the newest latest-message dates, and after load-more all 30 are listed.

---

### User Story 2 - Read a conversation in full detail (Priority: P2)

As Tyler, I open a conversation from the list and read every message in it — formatted bodies, full metadata, attachment details, and links to the people involved — so the correspondence is actually readable where my contacts live.

**Why this priority**: The list alone only tells Tyler mail exists; reading it is the core value of the feature. It depends on the list (User Story 1) as its entry point.

**Independent Test**: Can be fully tested by seeding a conversation with known bodies and metadata, opening its detail view from the list, and checking message order, body rendering, script safety, and every displayed metadata field.

**Acceptance Scenarios**:

1. **Given** the conversation "Pricing question", whose first message's stored HTML body contains "updated pricing sheet" in bold markup, a hyperlink to https://example.com/pricing, and a `<script>` tag, followed by one reply, **When** I open it from the Emails page list, **Then** the detail view shows both messages fully expanded in chronological order (oldest first), the body renders "updated pricing sheet" in bold and the link as a clickable hyperlink — not as raw HTML markup — and the script does not execute (no script-injected content appears on the page).
2. **Given** the synced message "Quote attached" from "Sam Rivera" \<sam.rivera@example.com\> to "Tyler Satre" \<tyler@example.com\>, sent 2026-08-06 09:00 and received 2026-08-06 09:01, unread, importance high, flagged, category "Orange category", folder Inbox, with one attachment "quote.pdf" (PDF, 52 KB), **When** I open its conversation's detail view, **Then** the message shows display name "Sam Rivera" alongside the from address and "Tyler Satre" alongside the to address, both timestamps, an unread marker, high importance, its flagged state, category "Orange category", folder Inbox, attachment "quote.pdf" with its type and size, and an open-in-Outlook link pointing at the message's stored Outlook URL.
3. **Given** sam.rivera@example.com is an address on person "Sam Rivera", **When** I open a conversation involving that address, **Then** the address is presented as linked to "Sam Rivera", and clicking the name opens Sam Rivera's person record.

---

### User Story 3 - See a person's correspondence on their record (Priority: P3)

As Tyler, I open a person's record and see their recent email conversations right there — which address of theirs was involved and in what role — so the correspondence behind a contact is visible where the contact lives.

**Why this priority**: This is the "where the contacts live" half of the user story — high value, but it builds on conversations already being browsable and readable (User Stories 1–2), and it reads address-person links that already exist from email-sync.

**Independent Test**: Can be fully tested by seeding a person with linked addresses involved in a known set of conversations, opening the person record, and checking the section's ordering, roles, show-all behavior, click-through, and empty state.

**Acceptance Scenarios**:

1. **Given** person "Sam Rivera" with addresses sam.rivera@example.com and sam.personal@example.com, involved in 7 synced conversations, the most recent being "Quote attached" where sam.rivera@example.com is the from address, **When** I open Sam Rivera's record, **Then** an email section lists his 5 most recent conversations newest first — "Quote attached" at the top showing that it involves sam.rivera@example.com with role from — a show-all control reveals the remaining 2, and clicking "Quote attached" opens that conversation's detail view.
2. **Given** a person "Ana Alvarez" whose addresses appear in no synced mail, **When** I open her record, **Then** the email section shows a styled empty-state message (e.g. "No synced email") instead of a conversation list.

---

### User Story 4 - Link an unmatched address to a person, or create the person, from an email (Priority: P4)

As Tyler, when a conversation involves an address that isn't linked to any person, I link it to an existing person — or create the person prefilled from the email — right from the conversation detail view, so unmatched correspondence becomes part of my CRM without leaving the email.

**Why this priority**: This is the only write action in the feature and the connective tissue between email and people, but it is only reachable from the detail view (User Story 2) and its payoff shows on the person record (User Story 3), so it lands last.

**Independent Test**: Can be fully tested by seeding messages with unlinked addresses, exercising the link and create-person controls in the detail view, and checking the resulting links on the person record — including after a page reload.

**Acceptance Scenarios**:

1. **Given** a synced message with cc ana.alvarez@example.com linked to no person, and a person "Ana Alvarez" who does not have that address, **When** I use the link control on that address in the conversation detail view, type "ana" into its person search, and select "Ana Alvarez", **Then** the address shows as linked to Ana Alvarez in the detail view, her person record lists ana.alvarez@example.com among her addresses, and her record's email section now shows this conversation — all still true after a page reload.
2. **Given** a synced message from "Jordan Smith" \<jordan.smith@example.com\>, that address linked to no person, **When** I use the create-person control on that address, see the person create form prefilled with first name "Jordan", last name "Smith", and email "jordan.smith@example.com", and save it, **Then** "Jordan Smith" appears on the People page, the address shows as linked to Jordan Smith in the conversation detail view, and his record's email section shows this conversation.

---

### Edge Cases

- A participant address with no stored display name appears as the bare address in list rows and the detail view.
- A conversation with an empty subject shows a styled "(no subject)" placeholder in list rows, the detail view, and the person-page email section.
- Using create-person on an address whose display name is missing or not exactly two words (a single word, or three or more): the prefill leaves the name fields it cannot guess blank, and normal required-name validation applies before the person can be saved.
- A stored body containing unsafe markup (scripts or similar active content) renders its formatting but never executes or injects content, on every view that shows bodies.
- 25 or fewer synced conversations: the full list is shown and no load-more control is offered (nothing more to load).
- 5 or fewer conversations in a person's email section: all are shown and no show-all control is offered (nothing more to show).
- A message whose only attachments are inline/embedded (e.g. signature images) shows no attachment indicator on its conversation row and no attachment entries in the detail view.
- If the backfill cannot determine a stored attachment's inline status (e.g. the message no longer exists in the mailbox), that attachment stays treated as non-inline — filtering errs toward showing attachments, never hiding real ones.
- A person involved only as cc (never from/to) still shows those conversations in their email section, with role cc.
- A conversation where several of a person's addresses appear, or where one address holds different roles across messages, shows in its row in the person's email section every distinct involved address with all of that address's distinct roles in the conversation.
- Linking an address that was just linked elsewhere (e.g. in another tab) follows the shared email-address rules from email-sync — the link control acts on the stored address record, and normal person validation applies.
- New mail arriving after page load does not change what is shown; it appears after a sync and a reload (no live updating).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The top navigation bar MUST include an "Emails" link that opens the Emails page and marks Emails as the active section while it is open.
- **FR-002**: The Emails page MUST list synced conversations ordered by latest message date, newest first.
- **FR-003**: Each conversation row MUST show the subject, the participants (display names where the store has them, bare addresses otherwise), the message count, and the latest-message date; a conversation whose subject is empty shows a styled "(no subject)" placeholder wherever its subject would appear (list rows and detail view alike).
- **FR-004**: A conversation row MUST show an unread indicator when the conversation contains at least one unread message, and an attachment indicator when at least one of its messages has a non-inline attachment; inline/embedded attachments (e.g. signature images) never trigger the indicator; rows with neither show neither.
- **FR-005**: The Emails page MUST initially show the 25 conversations with the newest latest-message dates and provide a load-more control that reveals the next 25 (or fewer) conversations per activation; the control is absent when nothing more exists to load.
- **FR-006**: When no email has ever been synced, the Emails page MUST show a styled empty-state message instead of a list.
- **FR-007**: Opening a conversation MUST show a detail view with all of its messages fully expanded, in chronological order, oldest first.
- **FR-008**: Message bodies stored as HTML MUST render their stored rich formatting — e.g. bold text as bold, hyperlinks as clickable links — rather than raw markup; bodies stored as plain text MUST render as escaped text with line breaks and blank-line paragraphs preserved (URLs stay plain text, no auto-linking); and script or other active content embedded in a stored body MUST never execute or inject content into the page.
- **FR-009**: The detail view MUST show, per message: sender and recipient display names alongside their addresses (bare address when no display name is stored), sent and received timestamps, read/unread state, importance, flagged state, categories, folder, and an open-in-Outlook link pointing at the message's stored Outlook URL.
- **FR-010**: The detail view MUST show attachment metadata — name, type, and size — for each non-inline attachment; inline/embedded attachments are not listed; viewing or downloading attachment files is out of scope.
- **FR-011**: An address linked to a person MUST be presented as linked wherever it appears in the detail view, and activating the person's name MUST open that person's record.
- **FR-012**: An address linked to no person MUST offer a link control in the conversation detail view whose person search matches case-insensitive substrings over person names and email addresses and shows result rows with name and email; selecting a person links the address to them.
- **FR-013**: An address linked to no person MUST offer a create-person control that opens the person create form prefilled from the stored display name (first and last name when the display name has two words; the fields it cannot guess left blank otherwise) and the email address; saving creates the person with that address linked, subject to normal person validation.
- **FR-014**: Linking an address — via either control — MUST follow the shared email-address rules established by email-sync: the stored address record becomes linked to the person, the address appears among the person's addresses on their record, and the person's email section shows the conversations involving it; all of this persists across a page reload.
- **FR-015**: Each person record MUST include an email section listing the conversations involving that person's addresses, newest first, showing the 5 most recent with a show-all control that reveals the rest in place; each entry shows every distinct involved address of the person's, each with all of its distinct roles (from/to/cc) across the conversation's messages, and activating an entry opens that conversation's detail view.
- **FR-016**: A person none of whose addresses appear in any synced mail MUST still show the email section, with a styled empty-state message instead of a conversation list.
- **FR-017**: All views in this feature MUST be read-only over the synced store apart from address linking: no mark read/unread, flag, move, delete, reply, forward, or compose; the mailbox is never modified, and stored mail changes only via sync refresh and the one-time inline-flag backfill (FR-019) — stored read state changes only via sync refresh.
- **FR-018**: The feature MUST NOT change MCP tools, and its only sync change is that attachment ingestion additionally records whether each attachment is inline/embedded, via a data-preserving schema migration plus the one-time backfill of FR-019; views show the store as of page load, with no live updating.
- **FR-019**: A one-time backfill MUST record the inline flag for attachments stored before this feature by re-fetching attachment metadata from the mailbox for stored messages that have attachment rows, so inline filtering applies to historical mail as well; the backfill modifies only the inline flag of existing attachment rows and never deletes or re-syncs stored mail.

### Key Entities

- **Conversation**: A synced email thread — subject, participants, message count, latest-message date, unread and attachment rollups; contains messages.
- **Message**: A single synced email within a conversation — from/to/cc participants, sent and received timestamps, read state, importance, flagged state, categories, folder, stored rich-text body, Outlook URL, attachments.
- **Participant address**: An email address as it appears on a message, with an optional display name; may be linked to a person or unmatched.
- **Attachment**: Metadata describing a file on a message — name, type, size, and whether it is inline/embedded (inline attachments are excluded from all email views); the file itself is out of scope.
- **Person**: An existing CRM contact with one or more email addresses; gains an email section showing their conversations.
- **Address–person link**: The existing association between a stored address record and a person, created here from email views for unmatched addresses only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any page in the app, Tyler can be reading the full content of his most recent conversation within 2 interactions (open Emails, open conversation).
- **SC-002**: 100% of the acceptance scenarios above pass with surface-appropriate evidence (browser evidence for UI-facing criteria), independently confirmed.
- **SC-003**: Stored rich-text formatting renders as formatting — never as raw markup — in every scenario body, and no script or active content from a stored body ever executes on any page (zero script-injected content observed across all evidence runs).
- **SC-004**: Every synced conversation is reachable from the Emails page (25 newest immediately, the rest via one load-more activation per page of 25), and every conversation involving a person's addresses is reachable from that person's record (5 newest immediately, the rest via one show-all activation).
- **SC-005**: Linking an unmatched address — to an existing person or by creating one — completes in a single flow from the conversation detail view, and the resulting link is still present after a page reload in 100% of evidence runs.
- **SC-006**: No view in this feature ever presents a blank or broken region when data is absent: the Emails page and the person email section each show their styled empty state.

## Out of Scope

- Search or filter controls on the Emails page — the list is newest-first with load-more only; finding mail by text or facet is split to the `email-search-filter` stub (MCP-side free-text search was already recorded in `mcp-tool-expansion`).
- Tagging emails from any of these views — the `tag-emails` stub (unblocked by this feature, since email now has a UI surface).
- Viewing or downloading attachment files — the detail view shows attachment metadata only; files are the `email-attachment-files` stub.
- Any action that changes the mailbox or stored mail — no mark read/unread, flag, move, delete, reply, forward, or compose; work-helper never modifies Outlook (permanent), and stored read state changes only via sync refresh.
- Unlinking an address from a person, or relinking a linked address to someone else, from email views — linking here only connects unmatched addresses; corrections happen on the People page as today.
- Any change to MCP tools, the Sync page, or sync behavior beyond the single addition of recording each attachment's inline/embedded flag at ingestion; all email MCP tools are untouched.
- Live updating — the list and detail views show the store as of page load; new mail appears after a sync and a reload.
- Pagination or load-more on the person-page email section beyond its single show-all control.

## Assumptions

- The link control's person search matches the existing task-linking widget's behavior: case-insensitive substring over names and email addresses, result rows showing name and email. (PRD assumption, confirmed as default.)
- Page size is 25 conversations with a load-more control (not numbered pages); the person-page email section shows 5 with an in-place show-all. Both counts are pinned for testability. (PRD assumption, confirmed as default.)
- Conversation list rows show participant display names where the store has them, bare addresses otherwise. (PRD assumption, confirmed as default.)
- Remote images referenced by stored bodies load from their sources as-is — no image blocking or proxying in this slice; this is Tyler's own already-received mail on his own server. (PRD assumption, confirmed as default.)
- A person whose addresses appear in no synced mail still shows the email section with its empty state, not a hidden section. (PRD assumption, confirmed as default.)
- When a message has no display name for an address (or a single-word one), the create-person prefill leaves the name fields it cannot guess blank and normal required-name validation applies; the acceptance scenarios only exercise the two-word case. (PRD assumption, confirmed as default.)
- The load-more control appears only when more conversations exist than are currently listed; with 25 or fewer, no control is shown.
- Whether the conversation detail is a routed page or an overlay, the exact body-sanitization mechanics, and how test setup seeds the synced store are `/speckit-plan` decisions; the acceptance scenarios hold either way.
- The one-time inline-flag backfill re-fetches attachment metadata only for stored messages that have attachment rows; its exact trigger, batching, and failure handling are `/speckit-plan` decisions, and it requires the mailbox connection that email-sync already established.
- The synced email store, the People page, the person create form, and the shared email-address rules from email-sync already exist and are reused unchanged.
