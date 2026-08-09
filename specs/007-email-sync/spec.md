# Feature Specification: Email Sync

**Feature Branch**: `007-email-sync`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "@docs/product/features/email-sync.md — As Tyler, I want work-helper to pull my Outlook email into its own store — on demand, for a date range I choose — organized by conversation with every address tagged by its role (from/to/cc) and connected through shared email-address records to the people I track, so that my CRM holds the actual correspondence behind my contacts and agents can query it through the work-helper MCP."

## Clarifications

### Session 2026-08-07

- Q: When the sync tool is given a date range like 2026-07-01 to 2026-07-31, in which timezone are those endpoint days interpreted when deciding whether a message's timestamp falls inside the range? → A: The server's local timezone — endpoint days are whole days in the work-helper server's local timezone.
- Q: What form of message body should the permanent snapshot store, and what should the read tools return? → A: Both — store the original body exactly as the mailbox delivered it (HTML or text) plus a derived plain-text version; the read tools return the plain text.
- Q: If a sync run fails partway through, what happens to the messages already stored in that run? → A: Keep partial progress — stored messages stay, the tool reports the sync was interrupted with the count stored so far, and re-running the same range completes the rest without duplicates.
- Q: Should the read tools return everything in one response, or support paging in this slice? → A: Page the lists — list-conversations and emails-for-person take an optional page-size limit (default 50) and continuation cursor and return results in pages; get-conversation always returns the whole thread.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - On-Demand Date-Range Sync (Priority: P1)

An authorized agent calls the sync tool with a start and end date. work-helper pulls every message from the mailbox's Inbox and Sent folders whose timestamp falls within that range (inclusive of both endpoint days), stores each as a permanent snapshot in its own store, groups messages into conversations, and reports how many emails were synced. Re-running sync over an overlapping range stores only what is new — nothing is duplicated — and later changes in the mailbox (deletions, moves, edits) never remove or alter what work-helper has already stored.

**Why this priority**: Nothing else in this feature exists without ingested email. Sync is the foundation every read tool and person link builds on, and on its own it already delivers the core promise: the CRM holds the actual correspondence.

**Independent Test**: Seed a simulated mailbox with messages inside and outside the range and across folders, call the sync tool with a date range, and verify the reported count and the stored set match exactly the in-range Inbox and Sent messages. Repeat with an overlapping range and with a mailbox deletion to verify idempotency and snapshot behavior.

**Acceptance Scenarios**:

1. **Given** the connected mailbox's Inbox contains an email "Pricing question" (received 2026-07-10) and an email "Lunch Thursday" (received 2026-07-20), its Sent folder contains the reply "Re: Pricing question" (sent 2026-07-11, part of the same conversation as "Pricing question"), its Junk folder contains "You won a prize" (received 2026-07-12), and its Inbox also contains "Old thread" (received 2026-05-01), with nothing synced yet, **When** an authorized agent calls the sync tool with the range 2026-07-01 to 2026-07-31, **Then** the tool reports 3 emails synced, and the list-conversations tool returns exactly two conversations — "Pricing question" and "Lunch Thursday" — with "Old thread" (outside the range) and "You won a prize" (not in Inbox or Sent) absent.
2. **Given** the 2026-07 sync above has completed and the mailbox has since received "Invoice attached" on 2026-08-02, **When** an authorized agent calls the sync tool with the overlapping range 2026-07-15 to 2026-08-05, **Then** the tool reports exactly 1 email synced ("Invoice attached"), and the previously synced conversations are unchanged — "Pricing question" still shows a message count of 2, with no duplicated messages.
3. **Given** an authorized agent, **When** it calls the sync tool without a date range (or with only one end of it), **Then** the call fails with a validation error saying a start and end date are required, and nothing is synced.
4. **Given** "Lunch Thursday" has been synced and is then deleted from the mailbox, **When** an authorized agent calls the sync tool again with the range 2026-07-01 to 2026-07-31, **Then** "Lunch Thursday" still appears in list-conversations with its message intact — synced email is a snapshot; changes in the mailbox never remove or alter what work-helper has stored.

---

### User Story 2 - Browse Synced Email by Conversation (Priority: P2)

An authorized agent lists synced conversations — ordered by latest message, newest first, each showing its subject, message count, and latest-message date — and fetches a single conversation to read its messages in chronological order, each with subject, sent timestamp, full body text, and every participating address tagged with its role (from, to, cc, and bcc when present).

**Why this priority**: Reading is what makes the synced store useful. Without these tools the ingested mail is invisible; with them, agents can answer "what did Sam ask for?" directly from the CRM.

**Independent Test**: After a seeded sync, call list-conversations and verify ordering, counts, and dates; call get-conversation and verify message order, bodies, and role tags against the seeded data.

**Acceptance Scenarios**:

1. **Given** the User Story 1 sync has completed, **When** an authorized agent calls the list-conversations tool, **Then** "Lunch Thursday" is listed before "Pricing question" (ordered by latest message, newest first), "Pricing question" shows a message count of 2 and latest-message date 2026-07-11 (the Sent reply grouped into it), and "Lunch Thursday" shows a message count of 1.
2. **Given** the synced conversation "Pricing question", whose first message was sent by sam.rivera@example.com to tyler@example.com with cc ana.alvarez@example.com and body "Can you send the updated pricing sheet?", followed by the reply from tyler@example.com, **When** an authorized agent fetches that conversation, **Then** it contains both messages in chronological order, and the first message shows its subject, its sent timestamp, the full body text, sam.rivera@example.com tagged with role "from", tyler@example.com tagged with role "to", and ana.alvarez@example.com tagged with role "cc".

---

### User Story 3 - Connect Synced Email to People (Priority: P3)

Every address on a synced message is stored as a shared email-address record — the same records the People page manages. Addresses that match a tracked person's email (case-insensitively) surface as linked to that person; unmatched addresses are stored unlinked. When Tyler later adds an address to a person on the People page, previously synced mail involving that address immediately becomes part of that person's correspondence, and an agent can ask for all emails involving a person across every address they own.

**Why this priority**: This is the CRM payoff — correspondence attached to contacts — but it only matters once sync (P1) and reading (P2) exist.

**Independent Test**: Seed people with known addresses, sync messages involving matching, case-variant, and unknown addresses, then verify link status via conversation fetches, verify the People page add/uniqueness flows, and verify the emails-for-person tool returns the right emails with per-address roles.

**Acceptance Scenarios**:

1. **Given** a person "Sam Rivera" exists with email address sam.rivera@example.com, no person has ana.alvarez@example.com, and the mailbox contains a message sent from "Sam.Rivera@example.com" (different case) with cc ana.alvarez@example.com, **When** that message is synced and an authorized agent fetches its conversation, **Then** the message's "from" address is shown as linked to person "Sam Rivera" (case-insensitive match), and ana.alvarez@example.com appears with role "cc" and no linked person.
2. **Given** the synced message above, with ana.alvarez@example.com stored but linked to no person, and a person "Ana Alvarez" who does not have that address, **When** Tyler edits Ana Alvarez on the People page, adds the email address ana.alvarez@example.com, and saves, **Then** the address is added to her record exactly as adding any address works today, and an authorized agent calling the emails-for-person tool for Ana Alvarez now gets the previously synced message, with her address tagged "cc".
3. **Given** sam.rivera@example.com is an address on person "Sam Rivera", **When** Tyler edits Ana Alvarez on the People page and tries to add sam.rivera@example.com, **Then** the attempt is rejected with a validation message telling him that email is already in use, and Ana Alvarez's record is unchanged.
4. **Given** person "Sam Rivera" has addresses sam.rivera@example.com and sam.personal@example.com, and the synced store contains one email sent from sam.rivera@example.com and another email where sam.personal@example.com is a "to" recipient, **When** an authorized agent calls the emails-for-person tool for Sam Rivera, **Then** both emails are returned, each identifying which of Sam's addresses it involves and that address's role in that email.

---

### Edge Cases

- A message timestamped on a range's endpoint day (e.g., sent 2026-07-31 when the range ends 2026-07-31) is included — both endpoints are inclusive of the whole day, where a "day" is midnight-to-midnight in the server's local timezone (a message received 23:30 local on 2026-07-31 is in range even though it is already 2026-08-01 in UTC).
- A sync range that starts after it ends is rejected with the same kind of validation error as a missing range, and nothing is synced.
- A later sync pulls a message belonging to a conversation that already exists in the store: the message joins the existing conversation (count and latest-message date update); it never creates a duplicate conversation.
- A message with an empty body or missing subject is stored and returned as-is (empty body, blank subject) rather than rejected.
- The same address appears in multiple roles on one message (e.g., in both to and cc): each role occurrence is recorded and shown.
- Address case differs across messages ("Sam.Rivera@…" vs "sam.rivera@…"): both resolve to one shared address record; matching to people is case-insensitive.
- The mailbox is unreachable or its sign-in has expired when sync is called: the tool reports a clear error identifying the connection problem, and the store is unchanged.
- The connection drops partway through a sync run: messages stored before the failure are kept, the tool reports an interrupted sync with the count stored so far, and re-running the same range completes the remainder without duplicates.
- Tyler's own address appears on every Sent message: it is stored and tagged like any other address, linked only if a person record carries it.
- bcc recipients appear in the mailbox data (typically only on Sent messages): they are stored and shown with role "bcc".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a sync tool, callable only by an authorized agent, that requires both a start date and an end date; a call missing either MUST fail with a validation error stating that a start and end date are required, with nothing synced.
- **FR-002**: Sync MUST pull only messages from the mailbox's Inbox and Sent folders whose sent/received timestamp falls within the given range, inclusive of both endpoint days interpreted as whole days in the server's local timezone; messages in any other folder (junk, deleted, drafts, archive, custom) MUST NOT be synced.
- **FR-003**: Synced messages MUST be stored in work-helper's own store as a permanent snapshot: subject, body (both the original body as delivered by the mailbox — HTML or text — and a derived plain-text version), sent/received timestamp, and every participating email address with its role. Later mailbox changes (deletion, move, edit, read status, flags) MUST never remove or alter stored messages.
- **FR-004**: Sync MUST be idempotent: a message already in the store MUST NOT be duplicated by any later sync, regardless of overlapping ranges, and re-synced conversations MUST remain unchanged.
- **FR-005**: On completion, the sync tool MUST report a summary including the count of newly synced emails (excluding already-stored messages).
- **FR-006**: Stored messages MUST be grouped into conversations following the mailbox's own conversation threading, including grouping Sent replies with their Inbox counterparts, and including joining messages synced later to conversations already in the store.
- **FR-007**: The system MUST provide a list-conversations tool returning synced conversations ordered by latest message (newest first), each with its subject, message count, and latest-message date. The tool MUST accept an optional page-size limit (default 50) and continuation cursor; when more conversations remain beyond a page, the response MUST include a cursor that fetches the next page, with ordering stable across pages so paging through returns every conversation exactly once.
- **FR-008**: The system MUST provide a get-conversation tool returning a conversation's messages in chronological order, each with subject, sent timestamp, the plain-text body (the stored original HTML is retained for future slices but not returned by this tool), and every address tagged with its role — "from", "to", "cc", and "bcc" when the mailbox data includes it.
- **FR-009**: Every address seen on a synced message MUST be stored as a shared email-address record — the same records the People page manages — deduplicated case-insensitively, so ingestion and manual entry never create parallel address records for the same email.
- **FR-010**: An address on a synced message that matches an address of a tracked person (case-insensitively) MUST surface as linked to that person wherever the message is returned; unmatched addresses MUST appear with their role and no linked person, and MUST NOT auto-create a person.
- **FR-011**: Adding an email address to a person on the People page MUST keep working exactly as it does today (add, edit, remove, primary, uniqueness), with one addition: if the address already exists as an unlinked record from synced mail, saving links that existing record to the person, and all previously synced mail involving it immediately counts as that person's correspondence.
- **FR-012**: Attempting to add an email address that already belongs to another person MUST be rejected with a validation message saying the email is already in use, leaving the record being edited unchanged.
- **FR-013**: The system MUST provide an emails-for-person tool returning every synced email involving any of the person's addresses, each result identifying which of the person's addresses it involves and that address's role in that email. Like list-conversations, the tool MUST accept an optional page-size limit (default 50) and continuation cursor, returning a next-page cursor while more results remain, with stable ordering so paging through returns every matching email exactly once. get-conversation is not paged — it always returns the conversation's full message list.
- **FR-014**: All email tools (sync, list-conversations, get-conversation, emails-for-person) MUST be available only to authorized agents, authenticated per the existing mcp-server feature.
- **FR-015**: Sync MUST be read-only toward the mailbox: no operation of this feature may modify, move, flag, or delete anything in the mailbox.
- **FR-016**: If the mailbox cannot be reached or its authorization has lapsed when sync is called, the tool MUST fail with a clear error identifying the connection problem, leaving the store unchanged. If the connection is lost partway through a run, messages already stored in that run MUST be kept, and the tool MUST report that the sync was interrupted along with the count stored so far; re-running the same range MUST complete the remainder without duplicating what was kept (per FR-004).

### Key Entities

- **Email Message**: A permanent snapshot of one mailbox message: subject, body in two forms (the original as delivered by the mailbox and a derived plain-text version), sent/received timestamp, source folder (Inbox or Sent), and a mailbox-provided identity used to prevent duplicate ingestion. Belongs to exactly one Conversation; has one or more Participants.
- **Conversation**: A thread grouping related messages, following the mailbox's own threading. Presents a subject, message count, and latest-message date derived from its messages.
- **Participant**: The association of one Email Message with one Email Address in a specific role — from, to, cc, or bcc. A message has exactly one "from" participant and any number of the others; the same address may appear in more than one role on one message.
- **Email Address**: The shared address record used by both the People page and email ingestion. Unique case-insensitively; belongs to at most one Person (or none, when seen only in synced mail).
- **Person**: An existing CRM contact. Owns zero or more Email Addresses; a person's correspondence is every synced message with a Participant whose address belongs to them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent syncing a chosen date range gets a stored set that matches the mailbox exactly: 100% of Inbox and Sent messages within the range stored, zero messages from other folders or outside the range.
- **SC-002**: Repeated syncs over overlapping ranges produce zero duplicate messages and zero duplicate conversations, and each run's reported count equals exactly the number of newly stored emails.
- **SC-003**: Every stored message is retrievable with its full body text and 100% of its addresses tagged with the correct role, in the correct chronological position within its conversation.
- **SC-004**: Every synced address that matches a tracked person's email (in any letter case) is linked to that person, and an emails-for-person query returns (across its pages) 100% of stored emails involving any of that person's addresses — including mail synced before the address was added to the person.
- **SC-005**: After any sequence of mailbox changes following a sync (deletions, moves, edits), the synced store shows zero changes.
- **SC-006**: A sync covering a one-month range of Tyler's real mailbox completes and reports its summary in under 5 minutes, and the mailbox itself is unchanged by the operation.

## Out of Scope

- Any UI for browsing synced email — no Emails page, no conversation view, and no email sections on person pages in this slice; email is reachable only through the MCP read tools. (See the `email-ui` stub.)
- Scheduled polling and mailbox webhooks — sync runs only when the sync tool is called. (See the `email-sync-automation` stub.)
- Mirroring later mailbox changes — deletions, moves, read/unread status, edits, and flags are ignored after first sync. (See the `email-change-tracking` stub.)
- Attachments — neither files nor attachment metadata are stored.
- Folders beyond Inbox and Sent — junk, deleted, drafts, archive, and custom folders are not synced.
- Auto-creating people from unknown addresses — unmatched addresses are stored as unlinked address records only; connecting or creating the person is a deliberate act on the People page.
- A free-text email search tool — this slice ships list-conversations, get-conversation, and emails-for-person only. (See the `mcp-tool-expansion` stub.)
- Any email write/delete tools, and any tool that changes the mailbox — work-helper never modifies Outlook.
- Unlinking an address from a person while keeping stored emails visible on their record, merging address records, or any address-management UI beyond what the People page already has.
- Multiple mailboxes or accounts — one mailbox, Tyler's.
- Rendering email HTML anywhere — original bodies are stored (alongside the plain text the tools return) but never rendered; display concerns wait for the email UI.

## Assumptions

- Mailbox authentication is a one-time interactive sign-in run from the server, after which cached credentials keep sync working unattended; if the cache is invalidated the sign-in step is re-run. The exact command/mechanism is a `/speckit-plan` decision.
- Automated acceptance checks run against a simulated mailbox seeded by test setup; the simulation mechanism is a `/speckit-plan` decision. Tyler's manual acceptance pass syncs his real mailbox.
- bcc recipients are stored with role "bcc" whenever the mailbox data includes them (typically only on Sent messages); the acceptance scenarios exercise from/to/cc.
- Under the shared email-address model, addresses created by editing a person and addresses created by ingestion are the same records — existing People page behavior (add, edit, remove, primary, uniqueness) is unchanged except that adding an address already seen in synced mail links the existing record to the person.
- The sync date range filters on the message's sent/received timestamp, is inclusive of both endpoints' full days in the server's local timezone, and reports a summary (count synced) when done.
- One mailbox is connected — Tyler's Outlook mailbox — matching the existing product architecture where email ingestion happens inside the server and agents consume only the query tools.
- Conversation grouping trusts the mailbox's own thread identity rather than inferring threads from subjects or headers.
