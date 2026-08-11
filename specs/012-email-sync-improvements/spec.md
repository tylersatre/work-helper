# Feature Specification: Email Sync Improvements

**Feature Branch**: `012-email-sync-improvements`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "@docs/product/features/email-sync-improvements.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trigger a sync from the web (Priority: P1)

Tyler opens an Email Sync page from the app's top navigation, sees a date range prefilled to cover everything since his last successful sync, clicks Sync, watches a busy state while it runs, and gets the result — how many messages were new and how many were updated — plus a persistent history of every past run (including runs triggered by agents through MCP), without needing an MCP client.

**Why this priority**: This is the core ask — today sync is reachable only through an MCP client, so pulling in new mail requires tooling Tyler shouldn't need for a routine action. The page also gives sync its first visible home (status, history, errors).

**Independent Test**: Can be fully tested by opening the Email Sync page against a seeded simulated mailbox, running a sync, and checking the result, the prefill on return, validation, failure display, and the run history — all before any capture-field work exists.

**Acceptance Scenarios**:

1. **Given** no sync has ever run, **When** Tyler opens the Email Sync page via an "Email Sync" link in the top navigation bar, **Then** the nav marks Email Sync as the active section and the page shows start and end date pickers — start prefilled to 30 days before today, end prefilled to today — a Sync button, and a styled empty-state message (e.g. "No syncs yet") where run history would be.
2. **Given** the connected mailbox's Inbox contains "Pricing question" (received 2026-08-04) and its Sent folder contains "Re: Pricing question" (sent 2026-08-05), with nothing synced yet, **When** Tyler sets the range 2026-08-01 to 2026-08-08 and clicks Sync, **Then** the Sync button is disabled and an in-progress indicator shows while the run executes, and when it finishes the page reports 2 new messages and the run history lists the run with when it ran, the range, source "web", a success status, and counts 2 new / 0 updated — still listed after a page reload.
3. **Given** a successful run whose range ended 2026-08-08, **When** Tyler opens the Email Sync page again, **Then** the start date is prefilled to 2026-08-08 (the last successful run's end date) and the end date is prefilled to today.
4. **Given** the Email Sync page is open, **When** Tyler clears the date pickers and clicks Sync, and then sets start 2026-08-09 with end 2026-08-02 and clicks Sync, **Then** both attempts are rejected with an inline validation message (dates are required; start must not be after end), no sync runs, and no run history entry appears.
5. **Given** the mail connection is broken (the mailbox is unreachable), **When** Tyler clicks Sync with a valid range, **Then** the page shows an error message for the run, and the run history records it with a failure status and the error text — still listed after a page reload.
6. **Given** an authorized agent, **When** it calls the sync-emails tool with the range 2026-08-01 to 2026-08-08, **Then** the tool behaves as already specced (an explicit range is still required) and the run appears in the Sync page's run history with source "MCP" and its counts.

---

### User Story 2 - Capture the full picture of each message (Priority: P2)

Every synced message carries the data Tyler and agents actually need about it: who it involved by name (not just address), when it was sent and when it was received, whether it was read, its importance, flag, and categories, what attachments it had (name, type, size), which folder it came from, a link to open it in Outlook, and its standard internet message ID — all visible through the existing MCP read tools.

**Why this priority**: The store currently drops most of this at ingestion, so anything consuming synced mail sees a stripped-down copy. Capture completeness is the second half of the feature's ask, but it depends on nothing from Story 1 and delivers value only once messages are being synced routinely — which Story 1 enables.

**Independent Test**: Can be fully tested by syncing a seeded message that exercises every captured field and fetching it through the MCP read tools, independent of the Sync page (the MCP sync tool can trigger the run).

**Acceptance Scenarios**:

1. **Given** an unsynced Inbox message "Quote attached" from "Sam Rivera" \<sam.rivera@example.com\> to "Tyler Satre" \<tyler@example.com\>, sent 2026-08-06 09:00 and received 2026-08-06 09:01, unread, importance high, flagged, with Outlook category "Orange category" and one attachment "quote.pdf" (PDF, 52 KB), **When** it is synced and an authorized agent fetches its conversation, **Then** the message shows display name "Sam Rivera" alongside the from address and "Tyler Satre" alongside the to address, both the sent and received timestamps, read state unread, importance high, its flagged state, category "Orange category", folder Inbox, attachment "quote.pdf" with its type and size (the file itself is not stored), a link that opens the message in Outlook, and its internet message ID.
2. **Given** the synced message "Quote attached" above, **When** an authorized agent calls list-conversations, **Then** that conversation's entry shows an unread indicator and an attachment indicator alongside its existing subject, participants, message count, and latest-message date.

---

### User Story 3 - Sync all meaningful folders (Priority: P3)

Sync covers every mail folder except Junk, Deleted Items, and Drafts — including Archive and custom folders — and records which folder each message came from, so mail Tyler filed before syncing is no longer invisible.

**Why this priority**: Closes a real coverage gap (anything archived or filed before a sync run is currently missed), but the Inbox + Sent slice already captures the majority of correspondence.

**Independent Test**: Can be fully tested by seeding messages across Inbox, Archive, a custom folder, Junk, Drafts, and Deleted Items, syncing a range that covers them all, and checking which were stored and with what folder.

**Acceptance Scenarios**:

1. **Given** the mailbox contains messages all received 2026-08-06: "Hello" in Inbox, "Board minutes" in Archive, "Site survey" in the custom folder "Projects", "You won a prize" in Junk, "Half-written" in Drafts, and "Old news" in Deleted Items, with nothing synced yet, **When** a sync runs for 2026-08-01 to 2026-08-08, **Then** the run reports 3 new messages, an authorized agent fetching each conversation sees "Hello" with folder Inbox, "Board minutes" with folder Archive, and "Site survey" with folder Projects, and the Junk, Drafts, and Deleted Items messages appear nowhere in list-conversations.

---

### User Story 4 - Keep stored metadata fresh on re-sync (Priority: P4)

When a sync run covers a message that is already stored, the message's metadata (read state, flags, categories, importance, folder, attachment metadata, names, timestamps, link) is refreshed to the mailbox's current state, while its body, subject, and participants stay exactly as first synced — the snapshot rule from email-sync holds.

**Why this priority**: Makes overlapping syncs useful (read state and folder stay current, and messages synced before this feature gain the new fields) without building full change tracking. It only matters once the richer capture of Story 2 exists.

**Independent Test**: Can be fully tested by syncing a message, changing its read state and folder in the simulated mailbox, re-syncing an overlapping range, and checking what changed and what didn't.

**Acceptance Scenarios**:

1. **Given** "Quote attached" was synced while unread in Inbox, and in the mailbox it has since been marked read and moved to Archive, **When** a sync runs over an overlapping range, **Then** the run reports 0 new / 1 updated, the stored message now shows read state read and folder Archive while its subject, body, timestamps, and participants are unchanged, and the conversation's message count is unchanged (no duplicate).

---

### Edge Cases

- A sync whose range contains no messages at all completes successfully and records a history entry with 0 new / 0 updated.
- A second sync trigger while a run is in progress (the Sync button is disabled in the web UI, but an MCP sync-emails call can still arrive) is rejected with an "already running" error and records no additional run.
- A run that fails partway through (after some messages were stored) is recorded as failed with its error text; messages stored before the failure remain stored, and a later overlapping sync picks up the rest without duplicating them.
- A stored message that has since been deleted from the mailbox, or moved into an excluded folder (Junk, Deleted Items, Drafts), is simply not found by later syncs: it stays stored with its last-known metadata — nothing is ever removed or blanked by sync.
- A message with no attachments, normal importance, no flag, no categories, and no display names (address-only sender) syncs cleanly with those fields empty or defaulted — absence of optional metadata is not an error.
- Two runs whose ranges overlap store each message once; dedup is by message identity, and the since-last-sync prefill deliberately overlaps one day (the last run's end date) without creating duplicates.
- Messages in excluded folders are never synced even when their dates fall inside the range.

## Requirements *(mandatory)*

### Functional Requirements

#### Sync page (User Story 1)

- **FR-001**: The top navigation bar MUST include an "Email Sync" link that navigates to the Email Sync page and is marked active while on it, consistent with the existing nav sections.
- **FR-002**: The Email Sync page MUST show a start date picker, an end date picker, a Sync button, and the run history list (or a styled empty state when no runs exist).
- **FR-003**: The date pickers MUST prefill on page load: start = the end date of the most recent successful run, or 30 days before today if no successful run exists; end = today. Both remain freely editable.
- **FR-004**: Clicking Sync with a missing date or with start after end MUST be rejected with an inline validation message, run no sync, and record no history entry.
- **FR-005**: While a sync runs, the page MUST disable the Sync button and show an in-progress indicator; when the run finishes it MUST show the outcome (new and updated counts, or the error).
- **FR-006**: At most one sync run MUST be active at a time across the whole system; a trigger arriving while a run is active (from the web or via the sync-emails tool) MUST be rejected with an "already running" error and MUST NOT record a run.
- **FR-007**: Every sync run — succeeded or failed, web- or MCP-triggered — MUST be recorded in a persistent run history entry showing when it ran, its date range, its source ("web" or "MCP"), its status, its new and updated counts, and the error text on failure. History survives reloads and restarts, lists newest first, and is never pruned.
- **FR-008**: When the mailbox is unreachable or the run otherwise fails, the page MUST surface the error and the history entry MUST carry failure status and the error text; messages stored before a mid-run failure remain stored and are counted in that entry.

#### Capture (User Story 2)

- **FR-009**: Sync MUST capture, for every newly stored message: participant display names alongside their addresses; both the sent timestamp and the received timestamp; read state; importance; flag state; categories; whether it has attachments plus each attachment's filename, type, and size (never the file contents); the folder it came from; a link that opens the message in Outlook; and its internet message ID.
- **FR-010**: The existing MCP read tools MUST return the newly captured data: get-conversation (and emails-for-person, where a message is returned) exposes the per-message fields of FR-009, and list-conversations additionally shows, per conversation, an unread indicator, an attachment indicator, and the conversation's distinct participants (address, display name, and linked person when one matches) — the participants list is added by this feature, since the shipped listing does not yet include one.
- **FR-011**: Messages lacking optional metadata (no attachments, no display name, no categories, no flag) MUST sync without error, with those fields empty or defaulted.

#### Folders (User Story 3)

- **FR-012**: Sync MUST cover every mail folder except Junk, Deleted Items, and Drafts — including Archive and custom folders — and MUST record each message's source folder by name. Messages in the excluded folders MUST never be synced.

#### Refresh on re-sync (User Story 4)

- **FR-013**: When a sync run finds a message that is already stored, it MUST refresh that message's metadata (the FR-009 fields) to the mailbox's current state, MUST NOT alter the stored subject, body, or participants, MUST NOT create a duplicate, and MUST count the message as "updated" (not "new") in the run's result. Messages synced before this feature gain the new fields the same way.

#### Existing behavior preserved

- **FR-014**: The sync-emails MCP tool's interface is unchanged: an explicit start and end date remain required, and its date-range semantics (inclusive endpoints, server-local timezone) and validation behavior stay as specced in email-sync. Its runs use the same capture, folder coverage, and refresh behavior as web-triggered runs.
- **FR-015**: All shipped email-sync behavior not explicitly changed here MUST continue to hold: dedup by message identity, conversation grouping and ordering, address-role tagging (from/to/cc/bcc), case-insensitive person matching via shared address records, and the snapshot rule that mailbox deletions never remove stored mail.

### Key Entities

- **Sync Run**: A single execution of email sync. Attributes: when it ran, date range, source (web or MCP), status (success or failure), count of new messages, count of updated messages, error text when failed. Listed newest-first on the Email Sync page; never pruned.
- **Email Message (extended)**: The stored message gains participant display names, sent and received timestamps, read state, importance, flag state, categories, attachment metadata, source folder name, an open-in-Outlook link, and its internet message ID. Subject, body, and participant addresses/roles remain immutable after first sync; the new metadata refreshes on re-sync.
- **Attachment (metadata only)**: Filename, type, and size of an attachment on a stored message. No file contents.
- **Conversation (extended)**: Conversation listings gain an unread indicator and an attachment indicator derived from their messages, plus a distinct-participants list (address, display name, linked person when matched) aggregated across the conversation's messages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can pull in new mail entirely from the web: from any page in the app, reaching the Email Sync page and starting a correctly-ranged sync takes at most 2 clicks plus zero typing (prefill supplies the range), and the result is visible on the same page.
- **SC-002**: 100% of the metadata fields listed in FR-009 are retrievable through the MCP read tools for a newly synced message that has them.
- **SC-003**: Mail filed in Archive or custom folders before ever syncing appears in the store after one sync run covering its date — previously a permanent blind spot regardless of range.
- **SC-004**: Overlapping sync runs produce zero duplicate messages, and every run (web and MCP, success and failure) appears in the run history — none missing.
- **SC-005**: After a sync covering a message whose read state or folder changed in the mailbox, the store reflects the current state, while the stored subject, body, and participants are byte-for-byte unchanged.

## Assumptions

- The four "Confirmed (2026-08-10)" items in the feature doc are decisions: unpruned newest-first run history with the listed fields; a single-flight sync with "already running" rejection; metadata refresh applies to every already-stored message found in a synced range on every run; and no separate backfill for pre-feature messages (the refresh covers them, and resetting the dev store remains acceptable under the development-phase data policy).
- Connecting or re-connecting the mailbox remains a server-side operator step; the Email Sync page surfaces failures but offers no sign-in flow.
- A failed run's history entry records the counts of messages stored before the failure (possibly 0/0); "interrupted" outcomes from the shipped sync tool count as failures with their error text for history purposes.
- Nav link wording, page copy, and attachment-size formatting are acceptance-time details Tyler can adjust without a spec change; which upstream mailbox fields back each captured item is a `/speckit-plan` decision.
- Sync remains manual-only (web click or MCP call); scheduling, webhooks, attachment file storage, change history/events, and any email browsing UI are explicitly out of scope per the feature doc's Out of scope list and their recorded stubs.
