# Feature: mcp-mark-emails-read

## User story

As Tyler, I want an agent to mark synced email messages read (or back to unread) through the work-helper MCP — one or many messages per call — with the change written to my real Outlook mailbox and reflected immediately in work-helper, so that when an agent triages my mail (creating cards, linking people, filing things away) my Outlook inbox ends up showing only what's actually left to deal with.

## Acceptance criteria

This feature builds on `email-sync-improvements` (each synced message stores the read state captured from Outlook, refreshed on every overlapping sync) and `web-mailbox-signin` (the connected mailbox). It is a deliberate, narrow exception to the "work-helper never modifies Outlook" rule recorded in email-sync, email-ui, and calendar-sync: the only mailbox change work-helper ever makes is a message's read/unread state, and only when this tool is called. The tool takes a list of message ids — up to 50 per call, individual messages only, never a whole conversation — and a desired state (read or unread), and its response carries an outcome per message. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. Criteria run against a simulated mailbox seeded by test setup that accepts and exposes read-state changes (the mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass has a real agent mark a real email read and checks it shows read in Outlook. All subjects, people, ids, and dates are illustrative concrete test data.

- **Given** the synced conversation "Quote attached" whose only message (from sam.rivera@example.com, received 2026-08-06, flagged, category "Orange category", folder Inbox) is unread in both the mailbox and work-helper's store
  **When** an authorized agent calls the set-read-state tool with that message's id and state read
  **Then** the response reports that message as marked read; the message is now read in the mailbox; get-conversation shows its read state as read; list-conversations no longer shows an unread indicator for "Quote attached"; the Emails page list row and the conversation detail view show no unread marker after a page reload — all without a sync having run — and nothing else about the message changed (still flagged, still "Orange category", still Inbox, subject and body intact) and no run was added to the Sync page's history

- **Given** the synced conversation "Pricing question" with three messages: Sam's question (received 2026-08-04, unread), Tyler's reply (sent 2026-08-05, in Sent, read), and Sam's follow-up (received 2026-08-06, unread)
  **When** an authorized agent calls the tool once with the ids of all three messages and state read
  **Then** the response reports Sam's question and Sam's follow-up as marked read and Tyler's reply as already read; both of Sam's messages are now read in the mailbox; get-conversation shows all three messages read; and list-conversations shows no unread indicator for "Pricing question"

- **Given** the message in "Quote attached" is read in both the mailbox and the store
  **When** an authorized agent calls the tool with that message's id and state unread
  **Then** the response reports it as marked unread; the message is unread in the mailbox; get-conversation shows read state unread; list-conversations shows an unread indicator for "Quote attached"; and the Emails page list row and conversation detail view show the unread marker after a page reload

- **Given** the message in "Quote attached" was marked read through the tool (read in both the mailbox and the store)
  **When** I run an email sync from the Sync page over a range that includes 2026-08-06
  **Then** after the run the message still shows read state read in get-conversation and on the Emails page — sync confirms the mark rather than reverting it, because the mailbox agrees

- **Given** the message in "Quote attached" is already read
  **When** an authorized agent calls the tool with that message's id and state read
  **Then** the call succeeds, the response reports the message as already read, and nothing changes in the mailbox or the store

- **Given** "Quote attached" (one unread message), "Pricing question" (Sam's follow-up of 2026-08-06 unread), and no message with id 999999
  **When** an authorized agent calls the tool once with three message ids — the "Quote attached" message, Sam's follow-up, and 999999 — and state read
  **Then** the call succeeds with an outcome per message: the "Quote attached" message marked read, Sam's follow-up marked read, and 999999 reported as not found; the two real messages are read in the mailbox and the store, and the not-found id changed nothing

- **Given** "Quote attached" (unread) and the conversation "Lunch Thursday", whose only message was synced unread and has since been deleted from the mailbox (work-helper still holds it, per the snapshot rule)
  **When** an authorized agent calls the tool with both message ids and state read
  **Then** the call succeeds with per-message outcomes: the "Quote attached" message marked read (read in the mailbox and the store), and the "Lunch Thursday" message failed with a reason saying the mailbox no longer has that message — it remains unread in the store and the failure does not undo the other message

- **Given** the mailbox is not connected (or its sign-in has expired), and separately a mailbox connected with a sign-in that predates this feature and so lacks permission to change mail
  **When** in each state an authorized agent calls the tool with the unread "Quote attached" message id and state read
  **Then** each call fails as a whole — no per-message outcomes — with an error telling me to connect (or reconnect) the mailbox on the Sync page, the two states distinguishable in the error detail, and the message remains unread in the store and the mailbox

- **Given** an authorized agent
  **When** it calls the tool with 51 message ids, then with an empty list, then with one valid message id and the state "archived"
  **Then** each call fails with a validation error (at most 50 messages per call; at least one message id is required; state must be read or unread), and nothing is marked in the mailbox or the store

## Out of scope

- Conversation-level targets — declined by Tyler during doc review: the tool marks individual messages only. An agent that wants a whole thread read fetches it with get-conversation and passes the message ids (up to 50 per call).
- Any UI control for marking read or unread — the Emails page and conversation detail only reflect the stored state, as they do today. Tyler chose MCP-only for this slice; recorded in the new `mark-email-read-ui` stub.
- Implicit marking — fetching a conversation through get-conversation, opening it on the Emails page, linking it to a card, or anything else never changes read state. Only an explicit tool call does.
- Every other mailbox write — flagging, categories, moving, archiving, deleting, replying, forwarding — and any calendar write. The "work-helper never modifies Outlook" rule stays in force for all of them; this feature is the one sanctioned exception (read state), and any further exception needs its own deliberate decision.
- Query-shaped targets ("everything unread from Sam", "all mail before a date") — targets are explicit message ids only; an agent uses list-conversations, emails-for-person, or get-conversation to find ids first.
- Any change to sync behavior — sync still refreshes read state from the mailbox on every overlapping run; because this tool writes to the mailbox first, the two simply agree.
- Transactional or all-or-nothing semantics across a list — outcomes are per message, successes stand, nothing is rolled back.
- An audit trail or provenance of who marked what (declined by precedent in mcp-move-tasks and mcp-people-tools); recording read-state changes as history is the `email-change-tracking` stub's territory.
- Reflecting read changes made in Outlook without a sync — still only via sync (the `email-sync-automation` stub).
- Marking calendar events or anything other than synced email messages.

## Open questions

Interview resolved (2026-08-20): the workflow is agent triage keeping the real inbox honest; the mark writes back to Outlook and work-helper's stored state updates immediately (a narrow exception to the never-modify rule, read state only); MCP tool only, no UI control; targets are individual messages only (Tyler narrowed this from messages-or-conversations during doc review); both directions (read and unread); a write the mailbox can't take fails with nothing changed; a list of up to 50 message ids per call with an outcome per message; not-found ids are reported per message while the rest proceed; an Outlook rejection partway through is reported per message and does not undo the others; marking something already in the requested state succeeds as a no-op.

- **Assumption to confirm:** granting work-helper permission to change read state means reconnecting the mailbox once after this ships (Connect on the Sync page), exactly as calendar-sync required for calendar access; until then the tool fails with the reconnect error above. The permission mechanics are a `/speckit-plan` decision.
- **Assumption to confirm:** the tool's writes never appear in the Sync page's run history (they are not sync runs), and the read-state refresh on the next sync leaves them intact because the mailbox agrees.
- **Assumption to confirm:** the older feature docs' "never modifies Outlook (permanent)" wording is superseded by this doc's narrow exception; those docs are historical records and are not edited.
- Tool name and response field shapes are `/speckit-plan` decisions; the criteria hold either way.
