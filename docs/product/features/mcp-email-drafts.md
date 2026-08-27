# Feature: mcp-email-drafts

## User story

As Tyler, I want an agent to create, edit, and delete email drafts in my Outlook mailbox through the work-helper MCP — reply drafts quoted like a normal Outlook reply and fresh standalone drafts alike, with my signature included — so that email triage ends with ready-to-send drafts waiting in my Drafts folder, where I open, review, and send them myself from Outlook.

## Acceptance criteria

This feature builds on `email-sync-improvements` (the synced store and Sync page), `web-mailbox-signin` (the connected mailbox), and `mcp-authentik-auth` ("an authorized agent" means an MCP client authenticated per that flow). It widens the sanctioned exceptions to the "work-helper never modifies Outlook" rule from one to two: read state (`mcp-mark-emails-read`) and now drafts — creating, editing, and deleting messages in the Drafts folder only; every other mailbox write stays banned, and there is no send tool, ever — the agent drafts, only Tyler sends, from Outlook. The Drafts folder joins sync, superseding email-sync-improvements' exclusion of it: every sync run pulls the entire Drafts folder regardless of the run's date range, and draft-flagged messages are the exception to the snapshot rule — their content mirrors the mailbox as of the last sync, while draft tool writes update the store immediately without a sync. The tools write exactly the HTML the caller supplies — no composing, rewriting, or sanitizing inside the tool — so content from a hostile email can never steer a draft without appearing verbatim in the tool call. Each create call makes a new draft, never updating an existing one; the tools' descriptions steer agents to the edit tool for revisions. Criteria run against a simulated mailbox seeded by test setup (the mechanism is a `/speckit-plan` decision); Tyler's manual acceptance pass drafts against his real mailbox and sends one draft from Outlook on his Mac. All subjects, addresses, ids, and dates are illustrative concrete test data.

- **Given** no signature has ever been saved
  **When** I open the Email Sync page, save the signature HTML `<p>Tyler Satre</p><p>Example Corp</p>` in its new signature panel (which showed an empty state before saving), and reload the page
  **Then** the panel still shows the saved signature

- **Given** no signature is saved
  **When** an authorized agent calls the draft-creation tool for a new email to ana.alvarez@example.com with subject "Pricing sheet" and body `<p>Hi Ana,</p><p>Here is the pricing sheet.</p>`
  **Then** a draft with exactly that body — no signature, nothing else appended — sits in the mailbox's Drafts folder addressed to ana.alvarez@example.com with subject "Pricing sheet", and nothing was sent (the mailbox's Sent folder is unchanged)

- **Given** the signature `<p>Tyler Satre</p><p>Example Corp</p>` is saved
  **When** an authorized agent creates a new draft to ana.alvarez@example.com with cc sam.rivera@example.com, subject "Pricing sheet", and body `<p>Hi Ana,</p><p>Here is the pricing sheet.</p>`
  **Then** the mailbox draft's body is exactly the supplied HTML with the signature below it and its recipients and subject are as given, and — without any sync run — the draft appears as its own conversation marked as a draft in list-conversations and get-conversation, and the Emails page shows that conversation with a visible draft marker on its list row and on the message in the conversation view

- **Given** the saved signature above and the synced conversation "Pricing question", whose latest message is from sam.rivera@example.com to tyler@example.com with cc ana.alvarez@example.com
  **When** an authorized agent creates a reply draft for that message with body `<p>Working on it.</p>`, then a reply-all draft for the same message with body `<p>Working on it — Ana, flagging for you too.</p>`
  **Then** two separate drafts exist in the Drafts folder, both with subject "Re: Pricing question" and both appearing inside the "Pricing question" conversation marked as drafts: the reply draft addressed to sam.rivera@example.com only, the reply-all draft addressed to sam.rivera@example.com with cc ana.alvarez@example.com and tyler@example.com not a recipient, and each body reading top to bottom as the supplied HTML, then the signature, then the quoted original message — the same layered shape a reply composed in Outlook desktop would have

- **Given** a draft "Quarterly numbers" that Tyler started by hand in Outlook (body `<p>Sam — numbers below.</p>`, to sam.rivera@example.com), synced into the store and marked as a draft
  **When** an authorized agent calls the edit tool with that draft's id, the replacement body `<p>Sam — final numbers below.</p><p>Tyler Satre</p><p>Example Corp</p>`, and cc ana.alvarez@example.com
  **Then** the mailbox draft's body is exactly the supplied HTML — the edit tool appends nothing, not even the signature — its cc is now ana.alvarez@example.com, its to recipient and subject are unchanged, and get-conversation shows the updated content immediately, without a sync run

- **Given** the reply draft from the criterion above sitting in the "Pricing question" conversation alongside the conversation's real messages and the reply-all draft
  **When** an authorized agent calls the delete tool with the reply draft's id
  **Then** that draft is gone from the mailbox's Drafts folder and from the conversation in work-helper immediately, the conversation's real messages and the reply-all draft are untouched, and nothing was sent

- **Given** the synced (non-draft) Inbox message in "Pricing question"
  **When** an authorized agent calls the edit tool and then the delete tool with that message's id
  **Then** each call is rejected with an error saying only draft messages can be edited or deleted, and nothing changed in the mailbox or the store — the draft flag is what makes a message a valid target, so real mail is out of the tools' reach by construction

- **Given** four synced drafts, after which — in Outlook, with no sync yet — "Quote follow-up" is edited to body `<p>New wording.</p>`, "Intro for Ana" is sent, and "Never mind" is discarded, while "Old idea" (last modified 2026-05-01) is left untouched
  **When** a sync runs with range 2026-08-01 to 2026-08-08
  **Then** "Quote follow-up" shows the new body and is still marked a draft, "Intro for Ana" no longer appears as a draft anywhere — the sent message now sits in its conversation as a normal snapshotted message — "Never mind" is gone from the store, and "Old idea" is still present and marked as a draft despite its date sitting outside the range (the whole Drafts folder syncs on every run)

- **Given** the mailbox is not connected (or its sign-in has expired), and separately a mailbox connected with a sign-in that predates this feature and so lacks permission to write drafts
  **When** in each state an authorized agent calls the draft-creation tool
  **Then** each call fails with an error telling me to connect (or reconnect) the mailbox on the Sync page, the two states are distinguishable in the error detail, and no draft was created

- **Given** an authorized agent, the saved signature, and a synced draft that was sent from Outlook after its last sync
  **When** the agent calls the reply-creation tool with message id 999999 (no such synced message), then the draft-creation tool with an empty body, then the edit tool with the sent draft's id
  **Then** each call fails cleanly with an error naming the problem — no such message; a body is required; the mailbox no longer has that draft (the next sync reconciles the store) — and no draft was created, changed, or deleted by any of them

## Out of scope

- Sending email — never, in this feature or any future one: no send tool, ever. The binding boundary from the 2026-08-21 audit stands — the AI files, drafts, and flags; a human sends, from Outlook.
- Every other mailbox write — move, archive, flag, categories, folder management. The Outlook-write line now holds at read state (`mcp-mark-emails-read`) plus the Drafts folder (this feature).
- Any drafting or composing UI in the work-helper web app — decided permanently in the 2026-08-21 audit: drafting is MCP-only; this feature's only web additions are the signature panel and the draft markers on surfaces that already show synced mail.
- Reading the signature from Outlook or Microsoft's cloud — Microsoft Graph exposes no API for classic or roaming signatures; work-helper's stored signature is an independent copy, and keeping it matching what Outlook inserts is Tyler's job. Revisit only if Microsoft ever ships a signature API.
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

## Open questions

Interview resolved (2026-08-27): scope is create (fresh and reply/reply-all, the caller choosing reply vs reply-all per call) plus edit and delete; the signature lives in work-helper, pasted and edited in a panel on the Email Sync page and appended below the body on create, with creation proceeding signature-less until one is saved; edit and delete can target any draft in the mailbox — including drafts Tyler wrote by hand — guarded by the draft flag; the agent supplies HTML bodies, written verbatim; the Drafts folder joins sync (reversing email-sync-improvements' deliberate exclusion) — full folder on every run, mirroring the mailbox rather than snapshotting, with drafts shown and marked everywhere synced mail already shows; reply drafts carry the quoted original thread below the signature exactly as an Outlook desktop reply would, because Tyler opens and sends them from Outlook on his Mac; edit is a verbatim whole-body replace — the agent reads the current body first and preserves the signature or quote as needed; repeat create makes a second draft but the tool descriptions discourage it in favor of edit; no machine-authored marking.

- **Assumption to confirm:** writing drafts needs a broader Graph permission than today's sign-in holds, so the mailbox must be reconnected once on the Sync page after this ships (the mcp-mark-emails-read precedent); until then the tools fail with the reconnect error specced above.
- **Assumption to confirm:** the reply subject ("Re: …"), reply-all recipient derivation (sender to To, other recipients kept, Tyler's own address excluded), and the quoted-thread block all come from the mailbox's own reply machinery, matching what Outlook itself would produce.
- **Assumption to confirm:** draft tool writes update work-helper's store immediately and never appear in the Sync page's run history (they are not sync runs) — mirroring mcp-mark-emails-read.
- **Assumption to confirm:** to/cc/bcc are all supported on fresh-draft create and on edit; the criteria exercise to and cc.
- How draft additions, refreshes, and removals show up in a sync run's new/updated counts is a `/speckit-plan` decision, as are tool names, parameter shapes, and how the draft flag appears in tool responses.
- Signature panel copy and layout are acceptance-time details Tyler can adjust.
