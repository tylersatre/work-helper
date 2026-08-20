# Feature Specification: MCP Mark Emails Read

**Feature Branch**: `022-mcp-mark-emails-read`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-mark-emails-read.md — AI agents mark synced email messages read (or back to unread) through the work-helper MCP, one or many messages per call, with the change written to Tyler's real Outlook mailbox and reflected immediately in work-helper."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent marks a message read, mailbox and work-helper agree instantly (Priority: P1)

An agent triaging Tyler's mail marks a synced message read through the work-helper MCP. The change is written to the real Outlook mailbox and work-helper's stored read state updates in the same call — no sync run involved — so every work-helper surface (query tools and the web Emails page) and the Outlook inbox agree immediately. Nothing else about the message changes: this is the one sanctioned exception to the "work-helper never modifies Outlook" rule, and it covers read/unread state only.

**Why this priority**: This is the entire point of the feature — after an agent triages the inbox (creating cards, linking people, filing things away), the Outlook inbox should show only what's actually left to deal with. Without the single-message happy path there is no feature.

**Independent Test**: Can be fully tested by seeding a simulated mailbox with one unread synced message, calling the tool with that message's id and state read, and confirming the mailbox state, the query-tool responses, the web UI after reload, the untouched sync history, and that no other message attribute changed.

**Acceptance Scenarios**:

1. **Given** the synced conversation "Quote attached" whose only message (from sam.rivera@example.com, received 2026-08-06, flagged, category "Orange category", folder Inbox) is unread in both the mailbox and work-helper's store, **When** an authorized agent calls the set-read-state tool with that message's id and state read, **Then** the response reports that message as marked read; the message is now read in the mailbox; get-conversation shows its read state as read; list-conversations no longer shows an unread indicator for "Quote attached"; the Emails page list row and the conversation detail view show no unread marker after a page reload — all without a sync having run — and nothing else about the message changed (still flagged, still "Orange category", still Inbox, subject and body intact) and no run was added to the Sync page's history.
2. **Given** the message in "Quote attached" is already read in both the mailbox and the store, **When** an authorized agent calls the tool with that message's id and state read, **Then** the call succeeds, the response reports the message as already read, and nothing changes in the mailbox or the store.

---

### User Story 2 - Agent marks many messages in one call with an outcome per message (Priority: P1)

An agent passes a list of message ids — up to 50 per call, individual messages only, never a whole conversation — and one desired state. The response carries an outcome for every id: marked, already in the requested state, not found, or failed with a reason. Successes stand regardless of what happens to other ids in the same list; nothing is rolled back.

**Why this priority**: The tool's contract is list-shaped ("one or many messages per call" is in the user story), and triage naturally touches several messages at once. Per-message outcomes with no-rollback semantics are what make the batch safe for automated callers.

**Independent Test**: Can be fully tested by seeding conversations with a mix of unread, read, mailbox-deleted, and nonexistent message ids, calling the tool once with the mixed list, and confirming each reported outcome and each message's resulting state in the mailbox and the store.

**Acceptance Scenarios**:

1. **Given** the synced conversation "Pricing question" with three messages: Sam's question (received 2026-08-04, unread), Tyler's reply (sent 2026-08-05, in Sent, read), and Sam's follow-up (received 2026-08-06, unread), **When** an authorized agent calls the tool once with the ids of all three messages and state read, **Then** the response reports Sam's question and Sam's follow-up as marked read and Tyler's reply as already read; both of Sam's messages are now read in the mailbox; get-conversation shows all three messages read; and list-conversations shows no unread indicator for "Pricing question".
2. **Given** "Quote attached" (one unread message), "Pricing question" (Sam's follow-up of 2026-08-06 unread), and no message with id 999999, **When** an authorized agent calls the tool once with three message ids — the "Quote attached" message, Sam's follow-up, and 999999 — and state read, **Then** the call succeeds with an outcome per message: the "Quote attached" message marked read, Sam's follow-up marked read, and 999999 reported as not found; the two real messages are read in the mailbox and the store, and the not-found id changed nothing.
3. **Given** "Quote attached" (unread) and the conversation "Lunch Thursday", whose only message was synced unread and has since been deleted from the mailbox (work-helper still holds it, per the snapshot rule), **When** an authorized agent calls the tool with both message ids and state read, **Then** the call succeeds with per-message outcomes: the "Quote attached" message marked read (read in the mailbox and the store), and the "Lunch Thursday" message failed with a reason saying the mailbox no longer has that message — it remains unread in the store and the failure does not undo the other message.

---

### User Story 3 - Agent marks a message back to unread (Priority: P2)

The tool works in both directions: an agent can return a message to unread — for example after marking something read by mistake, or to deliberately resurface a message in Tyler's inbox — and the mailbox and every work-helper surface reflect the unread state the same way.

**Why this priority**: Both directions were an explicit product decision, but unread is the recovery/resurface direction rather than the core triage flow — the feature is viable for triage with read-only marking, so this lands second.

**Independent Test**: Can be fully tested by seeding a read message, calling the tool with state unread, and confirming the mailbox, query tools, and web UI all show unread.

**Acceptance Scenarios**:

1. **Given** the message in "Quote attached" is read in both the mailbox and the store, **When** an authorized agent calls the tool with that message's id and state unread, **Then** the response reports it as marked unread; the message is unread in the mailbox; get-conversation shows read state unread; list-conversations shows an unread indicator for "Quote attached"; and the Emails page list row and conversation detail view show the unread marker after a page reload.

---

### User Story 4 - A later sync confirms the mark instead of reverting it (Priority: P2)

Because the tool writes to the mailbox first, the next email sync over a range containing a tool-marked message finds the mailbox already agreeing with the store: the sync's read-state refresh confirms the mark rather than undoing it. Sync behavior itself does not change.

**Why this priority**: Durability across sync is what makes the feature trustworthy — a mark that silently reverted on the next sync would make agent triage worse than useless — but it is a property of the existing sync interacting with User Story 1, not new behavior of its own.

**Independent Test**: Can be fully tested by marking a message read through the tool, running an email sync from the Sync page over a range including that message's date, and confirming the read state is unchanged afterward.

**Acceptance Scenarios**:

1. **Given** the message in "Quote attached" was marked read through the tool (read in both the mailbox and the store), **When** I run an email sync from the Sync page over a range that includes 2026-08-06, **Then** after the run the message still shows read state read in get-conversation and on the Emails page — sync confirms the mark rather than reverting it, because the mailbox agrees.

---

### User Story 5 - A call the mailbox can't take fails with nothing changed (Priority: P1)

When the mailbox can't accept the write at all — not connected, sign-in expired, or connected with a sign-in that predates this feature and so lacks permission to change mail — the call fails as a whole with no per-message outcomes and an error telling the agent (and through it, Tyler) to connect or reconnect the mailbox on the Sync page. Invalid input — too many ids, an empty list, or a state other than read or unread — fails validation before anything is touched. In every failure of this story, nothing changes in the mailbox or the store.

**Why this priority**: Agents are automated callers writing to Tyler's real mailbox; whole-call failure with zero side effects and a self-explanatory error is as critical as the happy path. This is also where the one-time reconnect after shipping (to grant the new permission) surfaces.

**Independent Test**: Can be fully tested by calling the tool in each failure state (mailbox disconnected, sign-in expired, pre-feature permission, 51 ids, empty list, invalid state) and confirming each error's content and that mailbox and store are byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** the mailbox is not connected (or its sign-in has expired), and separately a mailbox connected with a sign-in that predates this feature and so lacks permission to change mail, **When** in each state an authorized agent calls the tool with the unread "Quote attached" message id and state read, **Then** each call fails as a whole — no per-message outcomes — with an error telling me to connect (or reconnect) the mailbox on the Sync page, the two states distinguishable in the error detail, and the message remains unread in the store and the mailbox.
2. **Given** an authorized agent, **When** it calls the tool with 51 message ids, then with an empty list, then with one valid message id and the state "archived", **Then** each call fails with a validation error (at most 50 messages per call; at least one message id is required; state must be read or unread), and nothing is marked in the mailbox or the store.

---

### Edge Cases

- A message already in the requested state: the call succeeds and the outcome says already read (or already unread); nothing changes anywhere (User Story 1, scenario 2).
- A message id that matches nothing: reported not found in that message's outcome; every other id in the list proceeds normally (User Story 2, scenario 2).
- A message work-helper holds but the mailbox has deleted (snapshot rule): that message's outcome is a failure whose reason says the mailbox no longer has it; its stored state is untouched and other messages' successes stand (User Story 2, scenario 3).
- The mailbox rejecting a write partway through a list: reported in that message's outcome; messages already marked stay marked — outcomes are per message, nothing is transactional or rolled back.
- The same message id appearing twice in one list: each occurrence gets an outcome; because marking a message already in the requested state is a no-op success, repeats are harmless.
- Whole-call failures (mailbox unavailable, missing permission, validation) return no per-message outcomes and change nothing in the mailbox or the store (User Story 5).
- Unauthenticated or unauthorized MCP calls: rejected by the existing mcp-authentik-auth flow before reaching the tool; no mailbox or store change.
- Messages in any folder — including Sent — are valid individual targets; conversation-level targets are not accepted (an agent wanting a whole thread read fetches it with get-conversation and passes the message ids).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The work-helper MCP MUST offer a set-read-state tool that an authorized agent — an MCP client authenticated per the existing mcp-authentik-auth flow — can call with a list of synced message ids and a desired state of read or unread.
- **FR-002**: The tool MUST accept between 1 and 50 message ids per call, individual messages only; it MUST reject an empty list, more than 50 ids, or a state other than read or unread with a validation error stating the violated rule, marking nothing.
- **FR-003**: For each targeted message, the tool MUST write the read state to the connected mailbox first and update work-helper's stored read state only once the mailbox has accepted the change, all within the call — no sync run is involved or created.
- **FR-004**: The tool's response MUST carry an outcome per message: marked read, marked unread, already in the requested state, not found, or failed with a reason (such as the mailbox no longer having the message).
- **FR-005**: Marking a message already in the requested state MUST succeed as a no-op, reported as already in that state, with nothing changed in the mailbox or the store.
- **FR-006**: A per-message failure (not found, mailbox no longer has the message, mailbox rejection) MUST leave that message's stored state untouched and MUST NOT undo or block any other message in the same call — successes stand, nothing is rolled back.
- **FR-007**: The read/unread state MUST be the only thing the tool changes about a message: flag, categories, folder, subject, body, and received/sent times are untouched; and read state MUST remain the only mailbox write anywhere in work-helper — every other mailbox or calendar write stays prohibited.
- **FR-008**: When the mailbox is not connected, its sign-in has expired, or its sign-in lacks permission to change mail, the call MUST fail as a whole with no per-message outcomes and an error directing to connect (or reconnect) the mailbox on the Sync page, with the no-connection/expired state and the missing-permission state distinguishable in the error detail; nothing changes in the mailbox or the store.
- **FR-009**: get-conversation MUST show each message's updated read state and list-conversations MUST reflect the conversation's unread indicator immediately after a successful call, without any sync having run.
- **FR-010**: The Emails page list rows and the conversation detail view MUST reflect the updated stored read state on next page load; no new UI control for marking read or unread is added, and nothing other than an explicit tool call ever changes read state (fetching, opening, or linking a conversation never does).
- **FR-011**: The tool's writes MUST NOT appear in the Sync page's run history — they are not sync runs.
- **FR-012**: A subsequent email sync over a range containing a tool-marked message MUST leave the marked state intact, because the mailbox already agrees; sync's existing read-state refresh behavior is unchanged.

### Key Entities

- **Email message**: A synced snapshot of a mailbox message; belongs to one conversation; stores the read state captured from the mailbox (per email-sync-improvements), which this tool is the only work-helper surface allowed to change — and only by writing the mailbox first.
- **Conversation**: A synced email thread; its unread indicator in list-conversations and on the Emails page derives from its messages' stored read states.
- **Mailbox connection**: The signed-in Outlook mailbox from web-mailbox-signin; carries the permission to change mail granted at sign-in, which sign-ins predating this feature lack until reconnected.
- **Per-message outcome**: The tool's report for one requested id: marked read, marked unread, already in the requested state, not found, or failed with a reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can flip any synced message's read state in a single tool call, with the change present in the real mailbox and on every work-helper surface (query tools immediately, web pages on next load) without any sync run — 100% of the spec's marking scenarios produce the exact expected states.
- **SC-002**: One call handles up to 50 messages and returns an outcome for every id passed, including mixed lists of markable, already-in-state, unknown, and mailbox-deleted messages — no id is ever silently dropped.
- **SC-003**: 100% of per-message failures leave that message's stored state untouched while every success in the same call stands — no call partially corrupts state or rolls back completed marks.
- **SC-004**: 100% of whole-call failures (mailbox unavailable or unpermissioned, invalid input) change nothing in the mailbox or the store and carry an error that tells the caller exactly how to proceed.
- **SC-005**: Tool-set read states survive subsequent email syncs 100% of the time — no mark is ever reverted by a later sync run.
- **SC-006**: After an agent triage pass, Tyler's real Outlook inbox shows read exactly the messages the agent marked — confirmed in the manual acceptance pass by a real agent marking a real email read and Outlook showing it read, with nothing else about the message changed.

## Assumptions

- Granting work-helper permission to change read state means reconnecting the mailbox once after this ships (Connect on the Sync page), exactly as calendar-sync required for calendar access; until then the tool fails with the reconnect error of User Story 5. The permission mechanics are a `/speckit-plan` decision.
- Automated acceptance criteria run against a simulated mailbox seeded by test setup that accepts and exposes read-state changes; the simulation mechanism is a `/speckit-plan` decision. Tyler's manual acceptance pass has a real agent mark a real email read and checks it shows read in Outlook.
- The tool's name and response field shapes are `/speckit-plan` decisions; the criteria hold under any naming.
- The older feature docs' "work-helper never modifies Outlook (permanent)" wording is superseded by this spec's narrow exception (read state only, only via this tool); those docs are historical records and are not edited.
- Out of scope per the PRD: conversation-level targets, any UI control for marking (recorded in the `mark-email-read-ui` stub), implicit marking by viewing or linking, query-shaped targets ("everything unread from Sam"), every other mailbox or calendar write, transactional semantics across a list, an audit trail of who marked what (the `email-change-tracking` stub's territory), reflecting Outlook-side read changes without a sync (the `email-sync-automation` stub), and marking anything other than synced email messages.
- "An authorized agent" means an MCP client authenticated per the existing mcp-authentik-auth flow; no new authorization model is introduced.
- Subjects, people, ids, and dates in scenarios ("Quote attached", sam.rivera@example.com, 999999, 2026-08-06, etc.) are illustrative concrete test data, not fixed product content.
