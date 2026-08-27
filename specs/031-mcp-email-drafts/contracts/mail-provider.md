# Internal Contract: `MailProvider` draft operations

**Feature**: `031-mcp-email-drafts`

The `MailProvider` interface (`src/server/services/email/provider.ts`) is the seam between work-helper and the mailbox; extending it forces both implementations — `GraphMailProvider` (production) and `FakeMailProvider` (tests + `MAIL_PROVIDER=fake` dev seed) — to stay in lockstep. Exact TypeScript signatures are finalized at implementation; the behavioral contract is fixed here.

## New interface methods

| Method | Contract |
|---|---|
| `createDraft({ to, cc, bcc, subject, bodyHtml })` | Creates a fresh draft in the Drafts folder with exactly the given recipients/subject/body (body is the already-composed HTML — signature appending happens in the service, not the provider). Returns the created message (graph id, conversation id, recipients, body, `isDraft: true`, webLink). |
| `createReplyDraft(graphMessageId, { replyAll, prefixHtml })` | Creates a reply (or reply-all) draft via the mailbox's own reply machinery — "Re:" subject, derived recipients with the owner excluded, quoted original thread — then inserts `prefixHtml` (supplied HTML + signature, composed by the service) above the quote and persists the merged body. Returns the final draft message. Throws not-found for an unknown graph id. |
| `updateDraft(graphMessageId, { bodyHtml?, to?, cc?, bcc?, subject? })` | Patches exactly the supplied fields on the draft; omitted fields untouched. Returns the updated message. Throws not-found when the mailbox no longer has the message (sent/discarded since last sync). |
| `deleteDraft(graphMessageId)` | Removes the draft from the Drafts folder, touching nothing else. Throws not-found when already gone. |
| `fetchDraftMessages(onMessage)` | Pages the **entire** Drafts folder, no date filter, invoking `onMessage` per draft — the sync run's Drafts phase (FR-015). Same shape as the existing `fetchMessages` streaming contract. |

All write methods require write access (`verifyWriteAccess()` semantics): they throw `MailboxNotConnectedError` (`never-signed-in` / `expired`) or `MailWritePermissionError` exactly as `setMessageReadState` does today. `MailMessage` gains `isDraft: boolean` (Graph: added to `SELECT_FIELDS`).

## `GraphMailProvider` mapping

- `createDraft` → `POST /me/messages` (`body.contentType: 'HTML'`).
- `createReplyDraft` → `POST /me/messages/{id}/createReply` or `/createReplyAll` with empty body, then insert `prefixHtml` after the returned body's opening `<body …>` tag (fallback: string-prepend), then `PATCH` the body. (Graph rule: `comment` and `message.body` are mutually exclusive in createReply, and supplying `body` replaces the quote — hence create-then-patch; see research R2.)
- `updateDraft` → `PATCH /me/messages/{id}`; `deleteDraft` → `DELETE /me/messages/{id}`; 404s map to the not-found signal via the existing `allowNotFound` convention.
- `fetchDraftMessages` → `GET /me/mailFolders/drafts/messages` paged, no `$filter`, existing `$select` + `Prefer: IdType="ImmutableId"` headers.

## `FakeMailProvider` (the simulated mailbox)

Implements the same methods against in-memory state, plus test-only hooks (final naming at implementation, following the existing `readStateOf()` / `recordedWrites` style):

- Constructor option `ownerAddress` — "me", for reply-all self-exclusion.
- Simulated reply derivation: `Re:` prefix (not doubled), reply → original sender as `to`; reply-all → sender as `to` + other to/cc recipients as `cc`, owner excluded; body = prefix + a recognizable quote block containing the original message (so layered-body assertions can check ordering: supplied HTML, then signature, then quote).
- Mailbox-side mutation hooks for User Story 5: edit a draft's body, mark a draft sent (removes it from the fake Drafts folder and exposes the sent copy to ranged sync in its conversation), discard a draft.
- Inspection accessors: current Drafts-folder contents, sent-folder contents (for SC-004 Sent-invariance assertions), recorded draft writes.
- Failure knobs: existing `writeAccess: 'ok' | 'not-connected' | 'expired' | 'no-write-permission'` covers FR-021; `deletedGraphMessageIds`-style knobs produce the stale-draft not-found path.
