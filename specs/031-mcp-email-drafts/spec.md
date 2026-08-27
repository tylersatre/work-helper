# Feature Specification: MCP Email Drafts

**Feature Branch**: `031-mcp-email-drafts`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-email-drafts.md" — Tyler's approved feature doc for `mcp-email-drafts`.

## User Scenarios & Testing *(mandatory)*

As Tyler, I want an agent to create, edit, and delete email drafts in my Outlook mailbox through the work-helper MCP — reply drafts quoted like a normal Outlook reply and fresh standalone drafts alike, with my signature included — so that email triage ends with ready-to-send drafts waiting in my Drafts folder, where I open, review, and send them myself from Outlook.

This feature widens the sanctioned exceptions to the "work-helper never modifies Outlook" rule from one to two: read state (existing) and now drafts — creating, editing, and deleting messages in the Drafts folder only. Every other mailbox write stays banned, and there is no send tool, ever — the agent drafts, only Tyler sends, from Outlook.

**Test approach**: automated checks for all acceptance scenarios run against a simulated mailbox seeded by test setup (the mechanism is a `/speckit-plan` decision). Tyler's manual acceptance pass drafts against his real mailbox and sends one draft from Outlook on his Mac. All subjects, addresses, ids, and dates below are illustrative concrete test data.

### User Story 1 - Fresh drafts land in the Drafts folder (Priority: P1)

An authorized agent creates a fresh standalone draft — recipients, subject, HTML body — and it appears in the mailbox's Drafts folder ready for Tyler to review and send from Outlook, with his saved signature appended below the body (or exactly the supplied body when no signature is saved). The draft shows up in work-helper immediately, without a sync run. Calls that cannot produce a draft fail with an error naming the problem, and never create anything.

**Why this priority**: this is the feature's core value — email triage ending with a ready-to-send draft in the Drafts folder — and the smallest slice that delivers it.

**Independent Test**: with a connected simulated mailbox, call the draft-creation tool and verify the draft in the Drafts folder and on work-helper's surfaces; the signature scenario additionally seeds a saved signature.

**Acceptance Scenarios**:

1. **Given** no signature is saved, **When** an authorized agent calls the draft-creation tool for a new email to ana.alvarez@example.com with subject "Pricing sheet" and body `<p>Hi Ana,</p><p>Here is the pricing sheet.</p>`, **Then** a draft with exactly that body — no signature, nothing else appended — sits in the mailbox's Drafts folder addressed to ana.alvarez@example.com with subject "Pricing sheet", and nothing was sent (the mailbox's Sent folder is unchanged).
2. **Given** the signature `<p>Tyler Satre</p><p>Example Corp</p>` is saved, **When** an authorized agent creates a new draft to ana.alvarez@example.com with cc sam.rivera@example.com, subject "Pricing sheet", and body `<p>Hi Ana,</p><p>Here is the pricing sheet.</p>`, **Then** the mailbox draft's body is exactly the supplied HTML with the signature below it and its recipients and subject are as given, and — without any sync run — the draft appears as its own conversation marked as a draft in list-conversations and get-conversation, and the Emails page shows that conversation with a visible draft marker on its list row and on the message in the conversation view.
3. **Given** the mailbox is not connected (or its sign-in has expired), and separately a mailbox connected with a sign-in that predates this feature and so lacks permission to write drafts, **When** in each state an authorized agent calls the draft-creation tool, **Then** each call fails with an error telling Tyler to connect (or reconnect) the mailbox on the Sync page, the two states are distinguishable in the error detail, and no draft was created.
4. **Given** an authorized agent and a connected mailbox, **When** the agent calls the draft-creation tool with an empty body, **Then** the call fails cleanly with an error saying a body is required and no draft was created.

---

### User Story 2 - Reply and reply-all drafts quoted like Outlook (Priority: P2)

For a message in a synced conversation, an authorized agent creates a reply draft or a reply-all draft — choosing which per call — and the result is shaped exactly like a reply composed in Outlook desktop: "Re:" subject, recipients derived the way Outlook derives them (Tyler's own address never a recipient), and a body reading top to bottom as the supplied HTML, then the signature, then the quoted original message. The draft sits inside the conversation it replies to.

**Why this priority**: replying is the bulk of email triage; this story turns the create path into the feature's main daily use, and depends on the synced store to find reply targets.

**Independent Test**: seed a synced conversation in the simulated mailbox, call the reply-creation tool for reply and reply-all, and verify each draft's subject, recipients, layered body shape, and placement in the conversation.

**Acceptance Scenarios**:

1. **Given** the saved signature `<p>Tyler Satre</p><p>Example Corp</p>` and the synced conversation "Pricing question", whose latest message is from sam.rivera@example.com to tyler@example.com with cc ana.alvarez@example.com, **When** an authorized agent creates a reply draft for that message with body `<p>Working on it.</p>`, then a reply-all draft for the same message with body `<p>Working on it — Ana, flagging for you too.</p>`, **Then** two separate drafts exist in the Drafts folder, both with subject "Re: Pricing question" and both appearing inside the "Pricing question" conversation marked as drafts: the reply draft addressed to sam.rivera@example.com only, the reply-all draft addressed to sam.rivera@example.com with cc ana.alvarez@example.com and tyler@example.com not a recipient, and each body reading top to bottom as the supplied HTML, then the signature, then the quoted original message — the same layered shape a reply composed in Outlook desktop would have.
2. **Given** an authorized agent and a connected mailbox, **When** the agent calls the reply-creation tool with message id 999999 (no such synced message), **Then** the call fails cleanly with an error saying there is no such message and no draft was created.

---

### User Story 3 - Edit and delete drafts, guarded by the draft flag (Priority: P3)

An authorized agent revises any draft in the mailbox — agent-created or started by Tyler by hand in Outlook — by replacing its body verbatim as a whole and optionally changing recipients and subject, or deletes a draft outright. The draft flag is what makes a message a valid target: real (non-draft) mail is out of the tools' reach by construction, and a draft that has meanwhile been sent or discarded in Outlook is refused cleanly.

**Why this priority**: editing and deleting complete the drafting loop (revise instead of duplicate, clean up abandoned drafts), and the draft-flag guard is the safety property that makes the whole feature trustworthy.

**Independent Test**: seed a synced draft and a synced non-draft message in the simulated mailbox, exercise edit and delete on the draft (verifying mailbox and store), then attempt both on the non-draft message and on a stale draft id and verify the rejections change nothing.

**Acceptance Scenarios**:

1. **Given** a draft "Quarterly numbers" that Tyler started by hand in Outlook (body `<p>Sam — numbers below.</p>`, to sam.rivera@example.com), synced into the store and marked as a draft, **When** an authorized agent calls the edit tool with that draft's id, the replacement body `<p>Sam — final numbers below.</p><p>Tyler Satre</p><p>Example Corp</p>`, and cc ana.alvarez@example.com, **Then** the mailbox draft's body is exactly the supplied HTML — the edit tool appends nothing, not even the signature — its cc is now ana.alvarez@example.com, its to recipient and subject are unchanged, and get-conversation shows the updated content immediately, without a sync run.
2. **Given** the reply draft from User Story 2 sitting in the "Pricing question" conversation alongside the conversation's real messages and the reply-all draft, **When** an authorized agent calls the delete tool with the reply draft's id, **Then** that draft is gone from the mailbox's Drafts folder and from the conversation in work-helper immediately, the conversation's real messages and the reply-all draft are untouched, and nothing was sent.
3. **Given** the synced (non-draft) Inbox message in "Pricing question", **When** an authorized agent calls the edit tool and then the delete tool with that message's id, **Then** each call is rejected with an error saying only draft messages can be edited or deleted, and nothing changed in the mailbox or the store — the draft flag is what makes a message a valid target, so real mail is out of the tools' reach by construction.
4. **Given** a synced draft that was sent from Outlook after its last sync, **When** an authorized agent calls the edit tool with that draft's id, **Then** the call fails cleanly with an error saying the mailbox no longer has that draft (the next sync reconciles the store) and no draft was created, changed, or deleted.

---

### User Story 4 - One signature, saved in work-helper (Priority: P4)

Tyler pastes and edits his email signature as a single HTML block in a new signature panel on the Email Sync page. It is work-helper's own independent copy of the signature Outlook inserts (keeping the two matching is Tyler's job), and once saved it is appended below the body of every created draft.

**Why this priority**: a small UI slice that upgrades drafts from "correct" to "ready to send as-is"; draft creation works signature-less without it, so it can land after the tool stories.

**Independent Test**: open the Email Sync page in a browser, verify the empty state, save a signature, reload, and see it persist.

**Acceptance Scenarios**:

1. **Given** no signature has ever been saved, **When** Tyler opens the Email Sync page, saves the signature HTML `<p>Tyler Satre</p><p>Example Corp</p>` in its new signature panel (which showed an empty state before saving), and reloads the page, **Then** the panel still shows the saved signature.

---

### User Story 5 - Drafts folder mirrors the mailbox on every sync (Priority: P5)

The Drafts folder joins sync, superseding its previous deliberate exclusion: every sync run pulls the entire Drafts folder regardless of the run's date range, and draft-flagged messages mirror the mailbox rather than being snapshotted — edits made in Outlook show up, sent drafts stop being drafts, discarded drafts disappear. Non-draft sync behavior is untouched.

**Why this priority**: keeps every other story's surfaces truthful as Tyler works his drafts in Outlook between syncs; the tool paths already update the store immediately, so this story is about staying accurate over time.

**Independent Test**: seed synced drafts, mutate them in the simulated mailbox without syncing (edit one, send one, discard one, leave one untouched), run a sync with a narrow date range, and verify each outcome in the store.

**Acceptance Scenarios**:

1. **Given** four synced drafts, after which — in Outlook, with no sync yet — "Quote follow-up" is edited to body `<p>New wording.</p>`, "Intro for Ana" is sent, and "Never mind" is discarded, while "Old idea" (last modified 2026-05-01) is left untouched, **When** a sync runs with range 2026-08-01 to 2026-08-08, **Then** "Quote follow-up" shows the new body and is still marked a draft, "Intro for Ana" no longer appears as a draft anywhere — the sent message now sits in its conversation as a normal snapshotted message — "Never mind" is gone from the store, and "Old idea" is still present and marked as a draft despite its date sitting outside the range (the whole Drafts folder syncs on every run).

---

### Edge Cases

- Mailbox never connected, or its sign-in has expired: draft tool calls fail with the connect/reconnect error; nothing is written.
- Mailbox connected with a sign-in that predates this feature and lacks draft-write permission: same reconnect direction, distinguishable from the not-connected state in the error detail.
- Reply target id does not exist in the synced store: "no such message" error, nothing created — replying to messages work-helper hasn't synced is out of scope; sync first.
- Empty body on create: "a body is required" error, nothing created.
- A draft was sent or discarded in Outlook after its last sync, and edit or delete then targets its id: the call fails saying the mailbox no longer has that draft, and the next sync reconciles the store.
- Edit or delete targets a non-draft message: rejected by the draft-flag guard — real mail is out of the tools' reach by construction.
- A second create call for the same message: makes a second draft, by design; the tools' descriptions steer agents to the edit tool for revisions.
- No signature saved: creation proceeds signature-less; nothing is appended in its place.
- A draft's date sits outside the sync run's range: it syncs anyway — the whole Drafts folder is pulled on every run.
- Content from a hostile email attempting to steer a draft: impossible without appearing verbatim in the tool call, because the tools write exactly the HTML the caller supplies — no composing, rewriting, or sanitizing inside the tool.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Email Sync page MUST include a signature panel that shows an empty state until a signature is first saved, lets Tyler paste and edit a signature as a single HTML block, and shows the saved signature on every later visit (it persists across reloads).
- **FR-002**: There is exactly one signature — no per-context selection — and once saved it is used for every draft creation until Tyler changes it in the panel.
- **FR-003**: An authorized agent MUST be able to create a fresh standalone draft by supplying recipients (to, and optionally cc and bcc), a subject, and an HTML body; the draft lands in the connected mailbox's Drafts folder addressed and titled exactly as supplied.
- **FR-004**: An authorized agent MUST be able to create a reply draft or a reply-all draft for a synced message, choosing reply vs reply-all per call, identifying the target by its synced message id.
- **FR-005**: Reply drafts MUST carry the reply subject (e.g. "Re: Pricing question"), recipient derivation (reply: the sender only; reply-all: the sender plus the other recipients, with Tyler's own address excluded), and the quoted original thread that the mailbox's own reply machinery produces — matching what Outlook itself would compose.
- **FR-006**: On every create, when a signature is saved the draft body MUST read top to bottom as the supplied HTML, then the signature, and — for replies — then the quoted original message below the signature, the same layered shape a reply composed in Outlook desktop would have; when no signature is saved, the body is exactly the supplied HTML with nothing appended, and creation proceeds without error.
- **FR-007**: The draft tools MUST write exactly the HTML the caller supplies — no composing, rewriting, or sanitizing inside the tool — so content from a hostile email can never steer a draft without appearing verbatim in the tool call.
- **FR-008**: Each create call MUST make a new draft, never update an existing one; the tools' descriptions MUST steer agents to the edit tool for revisions.
- **FR-009**: An authorized agent MUST be able to edit any draft in the mailbox — including drafts Tyler started by hand in Outlook — by its id: the supplied body replaces the existing body verbatim and whole (the edit tool appends nothing, not even the signature), recipients (to/cc/bcc) and subject MAY be changed in the same call, and anything not supplied stays unchanged.
- **FR-010**: An authorized agent MUST be able to delete any draft in the mailbox by its id, removing it from the mailbox's Drafts folder without touching any other message.
- **FR-011**: Edit and delete MUST accept only messages marked as drafts; a call targeting a non-draft message is rejected with an error saying only draft messages can be edited or deleted, and nothing changes in the mailbox or the store.
- **FR-012**: Draft tool writes (create, edit, delete) MUST update work-helper's store immediately, without a sync run: a fresh draft appears at once as its own conversation, a reply draft appears at once inside the conversation it replies to, edits show at once in get-conversation, and deleted drafts disappear at once.
- **FR-013**: Drafts MUST be marked as drafts on every surface that already shows synced mail: in list-conversations and get-conversation responses, and on the Emails page with a visible draft marker on the conversation's list row and on the draft message in the conversation view.
- **FR-014**: Draft tool writes MUST NOT appear in the Sync page's run history — they are not sync runs.
- **FR-015**: Every sync run MUST pull the entire Drafts folder regardless of the run's date range, superseding the previous exclusion of the Drafts folder from sync.
- **FR-016**: Draft-flagged messages are the exception to the snapshot rule — sync MUST mirror the mailbox for them: a draft edited in Outlook shows its new content and stays marked a draft, a draft sent from Outlook stops appearing as a draft anywhere (the sent message then sits in its conversation as a normal snapshotted message), a draft discarded in Outlook is removed from the store, and an untouched draft stays present and marked as a draft even when its date is outside the sync range.
- **FR-017**: Nothing changes in how non-draft folders sync, in the snapshot rule for non-draft messages, or in the sync tool's explicit-range requirement.
- **FR-018**: There MUST be no send capability: no tool sends mail, and no draft operation ever changes the mailbox's Sent folder — the agent drafts, only Tyler sends, from Outlook.
- **FR-019**: Mailbox writes MUST stay limited to the two sanctioned exceptions — read state (existing) and messages in the Drafts folder (this feature); every other mailbox write (move, archive, flag, categories, folder management) stays banned.
- **FR-020**: The draft tools MUST be available only to authorized agents — MCP clients authenticated per the existing MCP auth flow.
- **FR-021**: When the mailbox is not connected or its sign-in has expired, and likewise when the connected sign-in predates this feature and lacks permission to write drafts, draft tool calls MUST fail with an error telling Tyler to connect (or reconnect) the mailbox on the Sync page, with the two states distinguishable in the error detail and no draft created.
- **FR-022**: Failed tool calls MUST name the problem and have no side effects: a reply creation for an unknown message id fails saying there is no such message, a create with an empty body fails saying a body is required, and an edit or delete of a draft the mailbox no longer has fails saying so (the next sync reconciles the store) — in every failure case no draft is created, changed, or deleted.

### Key Entities

- **Draft**: a message in the mailbox's Drafts folder, mirrored in work-helper's store and carrying a draft flag; has recipients (to/cc/bcc), a subject, and an HTML body; a fresh draft starts its own conversation while a reply draft belongs to the conversation it replies to; the draft flag is what makes a message a valid edit/delete target.
- **Signature**: the single HTML block Tyler saves on the Email Sync page; work-helper's independent copy of what Outlook inserts (keeping them matching is Tyler's job); appended below the body on create, never touched by edit.
- **Conversation**: the existing grouping of synced messages on work-helper's surfaces; now also contains drafts, each visibly marked as a draft.
- **Sync run**: the existing explicit-range mailbox pull; now additionally pulls the whole Drafts folder on every run; draft tool writes are not sync runs and never appear in run history.
- **Mailbox connection**: the existing sign-in made on the Sync page; its permissions must cover writing drafts for this feature's tools to work, which sign-ins predating this feature do not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single tool call takes an agent from intent to a draft sitting in the mailbox's Drafts folder, with no manual step in between and no sync run needed for it to appear on work-helper's surfaces.
- **SC-002**: A reply draft opened in Outlook is indistinguishable in shape from a reply Tyler would have composed there — same subject prefix, same derived recipients with his own address excluded, and the body layered as new text, then signature, then quoted thread.
- **SC-003**: After any sync run, the drafts work-helper shows exactly match the mailbox's Drafts folder — no stale content, no missing drafts, no ghosts of sent or discarded drafts — regardless of the run's date range.
- **SC-004**: Zero emails are ever sent by work-helper: across every operation in this feature, the mailbox's Sent folder changes only when Tyler himself sends from Outlook.
- **SC-005**: 100% of edit and delete attempts against non-draft messages are rejected with no change to the mailbox or the store.
- **SC-006**: Every failed draft tool call names the actionable problem, and Tyler can tell a disconnected or expired mailbox apart from one whose sign-in lacks draft permission from the error detail alone.
- **SC-007**: Tyler's acceptance pass ends with him sending an agent-created draft from Outlook on his Mac without recomposing it — the draft is ready to send as reviewed.

## Out of Scope

- Sending email — never, in this feature or any future one: no send tool, ever. The binding boundary from the 2026-08-21 audit stands — the AI files, drafts, and flags; a human sends, from Outlook.
- Every other mailbox write — move, archive, flag, categories, folder management. The Outlook-write line now holds at read state (existing) plus the Drafts folder (this feature).
- Any drafting or composing UI in the work-helper web app — decided permanently in the 2026-08-21 audit: drafting is MCP-only; this feature's only web additions are the signature panel and the draft markers on surfaces that already show synced mail.
- Reading the signature from Outlook or Microsoft's cloud — no API exists for classic or roaming signatures; work-helper's stored signature is an independent copy, and keeping it matching what Outlook inserts is Tyler's job. Revisit only if Microsoft ever ships a signature API.
- Managing or changing Outlook's own signature settings.
- Multiple signatures or per-context signature selection — one signature, used for every draft.
- Signature images embedded as attachments — the signature is one HTML block; image references that require attaching files are not supported.
- Attachments on drafts — creating, attaching, or removing files. (Recorded in the `mcp-tool-expansion` stub.)
- Forward drafts — reply, reply-all, and fresh drafts only. (Recorded in the `mcp-tool-expansion` stub.)
- Replying to messages work-helper hasn't synced — reply targets are synced message ids; sync first.
- Editing draft metadata beyond recipients (to/cc/bcc), subject, and body — importance, categories, and everything else are untouched.
- Update-in-place create — declined: a second create call for the same message makes a second draft; revision goes through the edit tool.
- Marking agent-created drafts as machine-authored (category, body marker, or otherwise) — declined: every draft is human-reviewed before sending; that review is the safety net.
- Any change to how non-draft folders sync, to the snapshot rule for non-draft messages, or to the sync tool's explicit-range requirement.

## Dependencies

- `email-sync-improvements` — the synced store and the Sync page this feature extends (and whose deliberate exclusion of the Drafts folder it supersedes).
- `web-mailbox-signin` — the connected mailbox the tools write to.
- `mcp-authentik-auth` — "an authorized agent" means an MCP client authenticated per that flow.
- A mailbox sign-in whose permissions cover writing drafts — sign-ins made before this feature lack it and must be reconnected once on the Sync page (see Assumptions).

## Assumptions

- Writing drafts needs a broader mailbox permission than today's sign-in holds, so the mailbox must be reconnected once on the Sync page after this ships (the same one-time reconnect the read-state feature required); until then the tools fail with the reconnect error specced above. *(Tyler flagged this as an assumption to confirm.)*
- The reply subject ("Re: …"), reply-all recipient derivation (sender to To, other recipients kept, Tyler's own address excluded), and the quoted-thread block all come from the mailbox's own reply machinery, matching what Outlook itself would produce. *(Assumption to confirm.)*
- Draft tool writes update work-helper's store immediately and never appear in the Sync page's run history (they are not sync runs) — mirroring the read-state precedent. *(Assumption to confirm.)*
- To, cc, and bcc are all supported on fresh-draft create and on edit; the acceptance scenarios exercise to and cc. *(Assumption to confirm.)*
- Acceptance scenarios run against a simulated mailbox seeded by test setup; the simulation mechanism is a `/speckit-plan` decision.
- How draft additions, refreshes, and removals show up in a sync run's new/updated counts is a `/speckit-plan` decision, as are tool names, parameter shapes, and how the draft flag appears in tool responses.
- Signature panel copy and layout are acceptance-time details Tyler can adjust.
