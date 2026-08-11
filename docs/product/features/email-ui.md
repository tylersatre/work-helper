# Feature: email-ui

## User story

As Tyler, I want to browse my synced email inside work-helper — an Emails page listing conversations with a full detail view, my correspondence shown on each person's record, and the ability to link an unmatched address to a person (or create the person) right from an email — so that the correspondence behind my contacts is readable where the contacts live, instead of only through MCP tools.

## Acceptance criteria

All views read the existing synced store — this feature changes no sync or MCP behavior. Criteria run against a synced store seeded by test setup (whether via the simulated mailbox or direct store seeding is a `/speckit-plan` decision); Tyler's manual acceptance pass browses his real synced mail. Linking an address to a person follows the shared email-address rules from email-sync: the stored address record simply becomes linked, and normal person validation applies. All subjects, people, addresses, and dates are illustrative concrete test data.

- **Given** no email has ever been synced
  **When** I open the Emails page via an "Emails" link in the top navigation bar
  **Then** the nav marks Emails as the active section and the page shows a styled empty-state message (e.g. "No conversations yet") instead of a list

- **Given** a synced conversation "Pricing question" (2 messages, latest 2026-08-05, all read, no attachments) and a synced conversation "Quote attached" (1 message, received 2026-08-06, unread, one attachment), both involving "Sam Rivera" \<sam.rivera@example.com\> and tyler@example.com
  **When** I open the Emails page
  **Then** "Quote attached" is listed above "Pricing question" (ordered by latest message, newest first), each row shows subject, participants, message count, and latest-message date, and "Quote attached" shows an unread indicator and an attachment indicator while "Pricing question" shows neither

- **Given** 30 synced conversations
  **When** I open the Emails page and then activate the load-more control
  **Then** the list first shows the 25 conversations with the newest latest-message dates, and after load-more all 30 are listed

- **Given** the conversation "Pricing question", whose first message's stored HTML body contains "updated pricing sheet" in bold markup, a hyperlink to https://example.com/pricing, and a `<script>` tag, followed by one reply
  **When** I open it from the Emails page list
  **Then** the detail view shows both messages fully expanded in chronological order (oldest first), the body renders "updated pricing sheet" in bold and the link as a clickable hyperlink — not as raw HTML markup — and the script does not execute (no script-injected content appears on the page)

- **Given** the synced message "Quote attached" from "Sam Rivera" \<sam.rivera@example.com\> to "Tyler Satre" \<tyler@example.com\>, sent 2026-08-06 09:00 and received 2026-08-06 09:01, unread, importance high, flagged, category "Orange category", folder Inbox, with one attachment "quote.pdf" (PDF, 52 KB)
  **When** I open its conversation's detail view
  **Then** the message shows display name "Sam Rivera" alongside the from address and "Tyler Satre" alongside the to address, both timestamps, an unread marker, high importance, its flagged state, category "Orange category", folder Inbox, attachment "quote.pdf" with its type and size, and an open-in-Outlook link pointing at the message's stored Outlook URL

- **Given** sam.rivera@example.com is an address on person "Sam Rivera"
  **When** I open a conversation involving that address
  **Then** the address is presented as linked to "Sam Rivera", and clicking the name opens Sam Rivera's person record

- **Given** a synced message with cc ana.alvarez@example.com linked to no person, and a person "Ana Alvarez" who does not have that address
  **When** I use the link control on that address in the conversation detail view, type "ana" into its person search, and select "Ana Alvarez"
  **Then** the address shows as linked to Ana Alvarez in the detail view, her person record lists ana.alvarez@example.com among her addresses, and her record's email section now shows this conversation — all still true after a page reload

- **Given** a synced message from "Jordan Smith" \<jordan.smith@example.com\>, that address linked to no person
  **When** I use the create-person control on that address, see the person create form prefilled with first name "Jordan", last name "Smith", and email "jordan.smith@example.com", and save it
  **Then** "Jordan Smith" appears on the People page, the address shows as linked to Jordan Smith in the conversation detail view, and his record's email section shows this conversation

- **Given** person "Sam Rivera" with addresses sam.rivera@example.com and sam.personal@example.com, involved in 7 synced conversations, the most recent being "Quote attached" where sam.rivera@example.com is the from address
  **When** I open Sam Rivera's record
  **Then** an email section lists his 5 most recent conversations newest first — "Quote attached" at the top showing that it involves sam.rivera@example.com with role from — a show-all control reveals the remaining 2, and clicking "Quote attached" opens that conversation's detail view

- **Given** a person "Ana Alvarez" whose addresses appear in no synced mail
  **When** I open her record
  **Then** the email section shows a styled empty-state message (e.g. "No synced email") instead of a conversation list

## Out of scope

- Search or filter controls on the Emails page — the list is newest-first with load-more only; finding mail by text or facet is split to the new `email-search-filter` stub (MCP-side free-text search was already recorded in `mcp-tool-expansion`).
- Tagging emails from any of these views — the `tag-emails` stub (unblocked by this feature, since email now has a UI surface).
- Viewing or downloading attachment files — the detail view shows attachment metadata only; files are the `email-attachment-files` stub.
- Any action that changes the mailbox or stored mail — no mark read/unread, flag, move, delete, reply, forward, or compose; work-helper never modifies Outlook (permanent), and stored read state changes only via sync refresh.
- Unlinking an address from a person, or relinking a linked address to someone else, from email views — linking here only connects unmatched addresses; corrections happen on the People page as today.
- Any change to MCP tools or sync behavior — this is pure UI over data that already exists; the Sync page and all email tools are untouched.
- Live updating — the list and detail views show the store as of page load; new mail appears after a sync and a reload.
- Pagination or load-more on the person-page email section beyond its single show-all control.

## Open questions

Interview resolved (2026-08-11): all three surfaces (Emails page list, conversation detail, person-page section) plus linking actions in one slice; bodies render as sanitized HTML; threads show all messages expanded, oldest first; the detail view shows the full captured metadata set; person pages show recent conversations with roles; list is newest-first with load-more, no search or filters; create-person-from-address opens the person create form prefilled from the display name and address.

- **Assumption to confirm:** the link control's person search matches the task-linking widget's behavior — case-insensitive substring over names and email addresses, result rows showing name and email.
- **Assumption to confirm:** page size is 25 conversations with a load-more control (not numbered pages); the person-page section shows 5 with an in-place show-all. Both counts are pinned for testability; say so if you want different numbers.
- **Assumption to confirm:** conversation list rows show participant display names where the store has them, bare addresses otherwise.
- **Assumption to confirm:** remote images referenced by HTML bodies load from their sources as-is — no image blocking or proxying in this slice (it's your own already-received mail on your own server).
- **Assumption to confirm:** a person whose addresses appear in no synced mail still shows the email section with its empty state (not a hidden section).
- **Assumption to confirm:** when a message has no display name for an address (or a single-word one), the create-person prefill leaves the name fields it can't guess blank and normal required-name validation applies — the criteria only exercise the two-word case.
- Whether the conversation detail is a routed page or an overlay, and the exact HTML sanitization mechanics, are `/speckit-plan` decisions; the acceptance criteria hold either way.
