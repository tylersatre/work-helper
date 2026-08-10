# Feature: email-sync-improvements

## User story

As Tyler, I want to trigger an email sync from the web — on a Sync page that remembers past runs and prefills the range since my last sync — and I want each sync to capture the full picture of every message (names, both timestamps, read state and markers, attachment info, folder, and a link back to Outlook) across all my mail folders, so that work-helper's copy of my correspondence is complete and I don't need an MCP client just to pull in new mail.

## Acceptance criteria

This feature builds on the shipped `email-sync` feature: its snapshot rule (body, subject, and participants never change after first sync), date-range semantics (inclusive endpoints, server-local timezone), and dedup by message all still hold. Sync criteria run against a simulated mailbox seeded by test setup; Tyler's manual acceptance pass syncs his real mailbox. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. All dates, subjects, and people are illustrative concrete test data; "today" means the day the check runs.

- **Given** no sync has ever run
  **When** I open the Email Sync page via an "Email Sync" link in the top navigation bar
  **Then** the nav marks Email Sync as the active section and the page shows start and end date pickers — start prefilled to 30 days before today, end prefilled to today — a Sync button, and a styled empty-state message (e.g. "No syncs yet") where run history would be

- **Given** the connected mailbox's Inbox contains "Pricing question" (received 2026-08-04) and its Sent folder contains "Re: Pricing question" (sent 2026-08-05), with nothing synced yet
  **When** I set the range 2026-08-01 to 2026-08-08 and click Sync
  **Then** the Sync button is disabled and an in-progress indicator shows while the run executes, and when it finishes the page reports 2 new messages and the run history lists the run with when it ran, the range 2026-08-01 to 2026-08-08, source "web", a success status, and counts 2 new / 0 updated — still listed after a page reload

- **Given** the successful run above, whose range ended 2026-08-08
  **When** I open the Email Sync page again
  **Then** the start date is prefilled to 2026-08-08 (the last successful run's end date — overlap is safe because already-synced messages dedupe) and the end date is prefilled to today

- **Given** the Email Sync page is open
  **When** I clear the date pickers and click Sync, and then set start 2026-08-09 with end 2026-08-02 and click Sync
  **Then** both attempts are rejected with an inline validation message (dates are required; start must not be after end), no sync runs, and no run history entry appears

- **Given** the mail connection is broken (test setup makes the mailbox unreachable)
  **When** I click Sync with the range 2026-08-01 to 2026-08-08
  **Then** the page shows an error message for the run, and the run history records it with a failure status and the error text — still listed after a page reload

- **Given** the mailbox contains messages all received 2026-08-06: "Hello" in Inbox, "Board minutes" in Archive, "Site survey" in the custom folder "Projects", "You won a prize" in Junk, "Half-written" in Drafts, and "Old news" in Deleted Items, with nothing synced yet
  **When** I sync the range 2026-08-01 to 2026-08-08 from the Sync page
  **Then** the run reports 3 new messages, an authorized agent fetching each conversation sees "Hello" with folder Inbox, "Board minutes" with folder Archive, and "Site survey" with folder Projects, and the Junk, Drafts, and Deleted Items messages appear nowhere in list-conversations

- **Given** an unsynced Inbox message "Quote attached" from "Sam Rivera" \<sam.rivera@example.com\> to "Tyler Satre" \<tyler@example.com\>, sent 2026-08-06 09:00 and received 2026-08-06 09:01, unread, importance high, flagged, with Outlook category "Orange category" and one attachment "quote.pdf" (PDF, 52 KB)
  **When** it is synced from the Sync page and an authorized agent fetches its conversation
  **Then** the message shows display name "Sam Rivera" alongside the from address and "Tyler Satre" alongside the to address, both the sent and received timestamps, read state unread, importance high, its flagged state, category "Orange category", folder Inbox, attachment "quote.pdf" with its type and size (the file itself is not stored), a link that opens the message in Outlook, and its internet message ID

- **Given** the synced message "Quote attached" above
  **When** an authorized agent calls list-conversations
  **Then** that conversation's entry shows an unread indicator and an attachment indicator alongside its existing subject, participants, message count, and latest-message date

- **Given** "Quote attached" was synced while unread in Inbox, and in the mailbox it has since been marked read and moved to Archive
  **When** I sync an overlapping range from the Sync page
  **Then** the run reports 0 new / 1 updated, the stored message now shows read state read and folder Archive while its subject, body, timestamps, and participants are unchanged, and the conversation's message count is unchanged (no duplicate)

- **Given** an authorized agent
  **When** it calls the sync-emails tool with the range 2026-08-01 to 2026-08-08
  **Then** the tool behaves as specced in email-sync (an explicit range is still required), the run uses the same capture, folders, and refresh behavior as a web-triggered sync, and it appears in the Sync page's run history with source "MCP" and its counts

## Out of scope

- Storing attachment files — this slice captures attachment metadata only (name, type, size); downloading and storing the files is split to the new `email-attachment-files` stub.
- Scheduled or automatic sync — sync still runs only when Tyler clicks Sync or an agent calls the tool. (The `email-sync-automation` stub; the run history and since-last-sync prefill built here are its natural foundation.)
- Change tracking beyond the metadata refresh — deletions and message edits in the mailbox are still ignored, and no history of changes is kept: refresh overwrites metadata with current state, it does not record events. (The `email-change-tracking` stub.)
- Any email browsing UI — the Sync page shows runs, not messages; conversation and message views stay in the `email-ui` stub.
- Live progress during a run — the page shows a busy state and then the result; no running counts.
- Syncing Junk, Deleted Items, or Drafts — deliberately excluded, not deferred.
- Making the sync-emails tool's date range optional — the explicit-range requirement from email-sync stands; only the web page gets prefill convenience.
- A Graph re-sign-in flow in the web UI — connecting the mailbox remains a server-side step; the page only surfaces the failure when the connection is broken.
- Free-text email search, email tagging, and other email tool expansion — the `mcp-tool-expansion` and `tag-emails` stubs.
- Notifications when a sync finishes or fails.
- Multiple mailboxes — one mailbox, Tyler's.

## Open questions

Interview resolved (2026-08-10): new doc rather than extending shipped email-sync; a Sync page in the nav with date range, run result, and run history; prefill = last successful run's end date through today (past 30 days on first run); capture adds display names, Outlook web link, internet message ID, both timestamps, read state, importance, flag, categories, and attachment metadata; folders expand to everything except Junk, Deleted Items, and Drafts; re-sync refreshes an existing message's metadata to current mailbox state while body/subject/participants stay snapshotted; MCP read tools return the new data; the sync-emails tool's interface is unchanged; busy state without live progress.

- **Confirmed (2026-08-10):** run history keeps every run (no pruning) and lists newest first, showing when it ran, the range, source (web or MCP), status, counts, and the error text on failure.
- **Confirmed (2026-08-10):** only one sync runs at a time — the Sync button is disabled while a run is active, and a sync-emails call arriving mid-run is rejected with an "already running" error.
- **Confirmed (2026-08-10):** the metadata refresh applies to every already-stored message found in the synced range on every run (not just rows predating this feature), so read state and folder stay as fresh as the last sync that covered them.
- **Confirmed (2026-08-10):** messages synced before this feature (missing the new fields) simply get them on the next overlapping sync via the refresh; no separate backfill, and resetting the dev store remains fine under the development-phase data policy.
- The exact wording of the nav link, page copy, and how attachment size is displayed are acceptance-time details Tyler can adjust; the Graph fields backing each captured item are `/speckit-plan` decisions.
- None remaining — ready for `/speckit-specify`.
