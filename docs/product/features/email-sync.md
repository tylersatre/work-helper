# Feature: email-sync

## User story

As Tyler, I want work-helper to pull my Outlook email into its own store — on demand, for a date range I choose — organized by conversation with every address tagged by its role (from/to/cc) and connected through shared email-address records to the people I track, so that my CRM holds the actual correspondence behind my contacts and agents can query it through the work-helper MCP.

## Acceptance criteria

Sync criteria run against a simulated mailbox seeded by test setup (the mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass syncs his real mailbox. "An authorized agent" means an MCP client authenticated per the mcp-server feature. All dates below are illustrative concrete test data.

- **Given** the connected mailbox's Inbox contains an email "Pricing question" (received 2026-07-10) and an email "Lunch Thursday" (received 2026-07-20), its Sent folder contains the reply "Re: Pricing question" (sent 2026-07-11, part of the same conversation as "Pricing question"), its Junk folder contains "You won a prize" (received 2026-07-12), and its Inbox also contains "Old thread" (received 2026-05-01), with nothing synced yet
  **When** an authorized agent calls the sync tool with the range 2026-07-01 to 2026-07-31
  **Then** the tool reports 3 emails synced, and the list-conversations tool returns exactly two conversations — "Pricing question" and "Lunch Thursday" — with "Old thread" (outside the range) and "You won a prize" (not in Inbox or Sent) absent

- **Given** the sync above has completed
  **When** an authorized agent calls the list-conversations tool
  **Then** "Lunch Thursday" is listed before "Pricing question" (ordered by latest message, newest first), "Pricing question" shows a message count of 2 and latest-message date 2026-07-11 (the Sent reply grouped into it), and "Lunch Thursday" shows a message count of 1

- **Given** the synced conversation "Pricing question", whose first message was sent by sam.rivera@example.com to tyler@example.com with cc ana.alvarez@example.com and body "Can you send the updated pricing sheet?", followed by the reply from tyler@example.com
  **When** an authorized agent fetches that conversation
  **Then** it contains both messages in chronological order, and the first message shows its subject, its sent timestamp, the full body text, sam.rivera@example.com tagged with role "from", tyler@example.com tagged with role "to", and ana.alvarez@example.com tagged with role "cc"

- **Given** a person "Sam Rivera" exists with email address sam.rivera@example.com, no person has ana.alvarez@example.com, and the mailbox contains a message sent from "Sam.Rivera@example.com" (different case) with cc ana.alvarez@example.com
  **When** that message is synced and an authorized agent fetches its conversation
  **Then** the message's "from" address is shown as linked to person "Sam Rivera" (case-insensitive match), and ana.alvarez@example.com appears with role "cc" and no linked person

- **Given** the synced message above, with ana.alvarez@example.com stored but linked to no person, and a person "Ana Alvarez" who does not have that address
  **When** I edit Ana Alvarez on the People page, add the email address ana.alvarez@example.com, and save
  **Then** the address is added to her record exactly as adding any address works today, and an authorized agent calling the emails-for-person tool for Ana Alvarez now gets the previously synced message, with her address tagged "cc"

- **Given** sam.rivera@example.com is an address on person "Sam Rivera"
  **When** I edit Ana Alvarez on the People page and try to add sam.rivera@example.com
  **Then** the attempt is rejected with a validation message telling me that email is already in use, and Ana Alvarez's record is unchanged

- **Given** person "Sam Rivera" has addresses sam.rivera@example.com and sam.personal@example.com, and the synced store contains one email sent from sam.rivera@example.com and another email where sam.personal@example.com is a "to" recipient
  **When** an authorized agent calls the emails-for-person tool for Sam Rivera
  **Then** both emails are returned, each identifying which of Sam's addresses it involves and that address's role in that email

- **Given** the 2026-07 sync above has completed and the mailbox has since received "Invoice attached" on 2026-08-02
  **When** an authorized agent calls the sync tool with the overlapping range 2026-07-15 to 2026-08-05
  **Then** the tool reports exactly 1 email synced ("Invoice attached"), and the previously synced conversations are unchanged — "Pricing question" still shows a message count of 2, with no duplicated messages

- **Given** an authorized agent
  **When** it calls the sync tool without a date range (or with only one end of it)
  **Then** the call fails with a validation error saying a start and end date are required, and nothing is synced

- **Given** "Lunch Thursday" has been synced and is then deleted from the mailbox
  **When** an authorized agent calls the sync tool again with the range 2026-07-01 to 2026-07-31
  **Then** "Lunch Thursday" still appears in list-conversations with its message intact — synced email is a snapshot; changes in the mailbox never remove or alter what work-helper has stored

## Out of scope

- Any UI for browsing synced email — no Emails page, no conversation view, and no email sections on person pages in this slice; email is reachable only through the MCP read tools. (See the `email-ui` stub.)
- Scheduled polling and Graph webhooks — sync runs only when the MCP sync tool is called. (See the `email-sync-automation` stub.)
- Mirroring later mailbox changes — deletions, moves, read/unread status, edits, and flags are ignored after first sync; Tyler confirmed change tracking comes later. (See the `email-change-tracking` stub.)
- Attachments — neither files nor attachment metadata are stored.
- Folders beyond Inbox and Sent — junk, deleted, drafts, archive, and custom folders are not synced.
- Auto-creating people from unknown addresses — unmatched addresses are stored as unlinked address records only; connecting or creating the person is a deliberate act on the People page.
- A free-text email search tool — Tyler chose list-conversations, get-conversation, and emails-for-person for this slice; search stays in the `mcp-tool-expansion` stub.
- Any email write/delete tools, and any tool that changes the mailbox — work-helper never modifies Outlook.
- Unlinking an address from a person while keeping stored emails visible on their record, merging address records, or any address-management UI beyond what the People page already has.
- Multiple mailboxes or accounts — one mailbox, Tyler's.
- Rendering email HTML anywhere — bodies are stored and returned by tools; display concerns wait for the email UI.

## Open questions

- **Assumption to confirm:** Graph authentication is a one-time interactive sign-in (device-code flow, as in `~/outlook-assistant-mcp`) run from the server, after which cached tokens keep sync working unattended; if the cache is invalidated you re-run the sign-in step. The exact command/mechanism is a `/speckit-plan` decision.
- **Assumption to confirm:** bcc recipients are stored with role "bcc" when the mailbox data includes them (typically only on Sent messages); the criteria above only exercise from/to/cc.
- **Assumption to confirm:** under the shared email-address model, addresses created by editing a person and addresses created by ingestion are the same records — existing People page behavior (add, edit, remove, primary, uniqueness) is unchanged except that adding an address already seen in synced mail links the existing record to the person, as specced above.
- **Assumption to confirm:** the sync tool's date range filters on the message's sent/received timestamp, is inclusive of both endpoints' days, and reports a summary (count synced) when done.
