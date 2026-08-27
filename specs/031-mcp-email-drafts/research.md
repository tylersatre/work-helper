# Research: MCP Email Drafts

**Feature**: `031-mcp-email-drafts` | **Date**: 2026-08-27

Every open question the spec deferred to `/speckit-plan` is resolved below, along with the spec's four flagged assumptions. Sources: Microsoft Graph v1.0 reference docs (message: createReply, message: update, user: post messages) and direct exploration of the codebase.

## R1. Microsoft Graph API surface for draft operations

**Decision**: use the four native Graph message operations, all under the delegated `Mail.ReadWrite` scope:

| Operation | Graph call | Notes |
|---|---|---|
| Fresh draft | `POST /me/messages` | Saves to the Drafts folder by default; accepts `toRecipients`/`ccRecipients`/`bccRecipients`, `subject`, `body: { contentType: 'HTML', content }`; returns the full message (`id`, `conversationId`, `isDraft: true`). |
| Reply / reply-all draft | `POST /me/messages/{id}/createReply` / `.../createReplyAll` | Called with an **empty request body**. Exchange itself derives the "Re:" subject, the recipients (reply: sender only; reply-all: sender + other recipients with the mailbox owner excluded; honors `replyTo` per RFC 2822), and composes the quoted original thread into the draft's body — exactly what Outlook desktop produces. Returns the created draft message. |
| Edit draft | `PATCH /me/messages/{id}` | `body`, `toRecipients`, `ccRecipients`, `bccRecipients`, `subject` are updatable **only when `isDraft = true`** — Graph enforces the draft-only rule at the API level too. Returns the updated message. |
| Delete draft | `DELETE /me/messages/{id}` | Plain delete. Works on any message, so the draft-flag guard (FR-011) must be enforced in work-helper before calling it. |

**Rationale**: `createReply`/`createReplyAll` are the only way to get Outlook's own reply machinery (subject, recipient derivation, quoted thread) — confirming the spec's second assumption. Everything else is the minimal native call.

**Alternatives considered**: composing the reply quote ourselves (rejected — reimplementing Outlook's quote header/format is fragile and violates the "matching what Outlook itself would compose" requirement); MIME-format draft creation (rejected — needless complexity, JSON covers everything); `message: reply` single-shot send API (forbidden — it sends).

## R2. Layered reply body: supplied HTML, then signature, then quote

**Decision**: create-then-patch. For replies: (1) `POST .../createReply[All]` with no body → Graph returns a draft whose body is the quoted original thread; (2) build the prefix `suppliedHtml + signatureHtml` (signature omitted when none is saved); (3) insert the prefix into the returned body's HTML immediately after the opening `<body …>` tag (fallback: plain string-prepend when the returned content has no `<body>` tag); (4) `PATCH` the draft's body with the merged HTML. The final body reads top to bottom as supplied HTML → signature → quoted original (FR-006, SC-002).

**Rationale**: the createReply docs state you must specify *either* `comment` *or* `message.body` (both → HTTP 400), and specifying `message.body` **replaces** the whole body, destroying the quote. The `comment` parameter gives no reliable control over exact HTML. Create-then-patch is Microsoft's documented pattern ("You can update the draft later to add reply content to the body") and gives byte-level control over the prefix, which FR-007 (verbatim HTML, no rewriting) demands.

**Alternatives considered**: `comment` parameter (rejected — content-type handling is implicit and the signature/body boundary is uncontrollable); building the quote locally and using a single `POST /me/messages` (rejected per R1).

For fresh drafts the body is simply `suppliedHtml + signatureHtml` concatenated (nothing appended when no signature is saved), sent in the single `POST`. Note for tests: Graph (and Outlook) normalize stored HTML — the mailbox wraps content in an `<html><head>…</head><body>…</body></html>` envelope — so "body is exactly the supplied HTML" is asserted against the simulated mailbox (which stores verbatim), and real-mailbox verification is Tyler's acceptance pass.

## R3. Permissions: no new scope, no forced reconnect for current sign-ins

**Decision**: reuse the existing write-token plumbing unchanged: `getWriteAccessToken()` → `verifyWriteAccess()` in `src/server/services/email/graph-auth.ts`, which already requests `WRITE_SCOPES = ['Mail.ReadWrite']` and classifies failures into `MailboxNotConnectedError` (`reason: 'never-signed-in' | 'expired'`) and `MailWritePermissionError` (sign-in alive but never consented to `Mail.ReadWrite`).

**Spec assumption resolved (partially disconfirmed)**: the spec assumed draft-writing "needs a broader mailbox permission than today's sign-in holds". In fact `SIGN_IN_SCOPES` already includes `Mail.ReadWrite` (added by the email-read-state feature, `graph-auth.ts:6`), and every draft operation in R1 needs exactly that scope — so a mailbox connected since the read-state feature shipped needs **no reconnect**. Only a sign-in predating *read-state* lacks the scope, and that state is already detected live by the write-scope probe (no stored scope tracking exists or is needed). The FR-021 "lacks draft permission" error path stays fully implemented and testable (the fake provider simulates it), it just should not fire for Tyler's current sign-in.

**One change**: `MailWritePermissionError`'s message hardcodes "predates read-state changes" (`graph-auth.ts:64-67`). Reword to be operation-neutral, e.g. "The mailbox sign-in lacks permission to change mail — add delegated Mail.ReadWrite to the Entra app registration, then reconnect the mailbox on the Sync page to grant it." This keeps the three failure states (not connected / expired / no write permission) distinguishable in the error detail, satisfying FR-021 and SC-006.

**Alternatives considered**: persisting granted scopes in the db (rejected — the live probe already answers the question and the codebase deliberately has no scope tracking).

## R4. Simulated mailbox for automated acceptance checks

**Decision**: extend `FakeMailProvider` (`src/server/services/email/fake-provider.ts`) — the existing in-memory `MailProvider` implementation used by every email integration test and by the dev-only seeded mailbox (`MAIL_PROVIDER=fake`). Additions:

- Implement the new draft methods of the `MailProvider` interface (see contracts/mail-provider.md): in-memory Drafts folder state, deterministic generated ids, and a simulated `createReply[All]` that derives "Re:" subject, recipients (sender → to; reply-all keeps other recipients, excluding the mailbox owner's address), and appends a recognizable quote block — mirroring Graph's behavior shape for assertions. The fake gains an `ownerAddress` option so reply-all self-exclusion is testable (Graph does this server-side; the fake must be told who "me" is).
- Mailbox-side manipulation hooks for User Story 5's between-sync mutations: edit a draft in the "mailbox", mark one sent (moves it to the fake's sent messages, exposed to ranged sync), discard one. Plus inspection accessors in the style of the existing `readStateOf()` / `recordedWrites` (e.g. `draftsInMailbox()`, `sentMessages()`), so tests can assert Drafts-folder contents and Sent-folder invariance (SC-004).
- The existing `writeAccess: 'ok' | 'not-connected' | 'expired' | 'no-write-permission'` knob already covers all FR-021 failure states; `deletedGraphMessageIds`/`failWriteGraphMessageIds` cover the stale-draft (sent/discarded since last sync) 404 path.

MCP tool tests follow `tests/integration/mcp-mark-read-tools.test.ts`: boot the real Fastify app on port 0, run the OAuth approval dance via the stub identity provider, drive a real `@modelcontextprotocol/sdk` client over `StreamableHTTPClientTransport`, and assert tool responses + REST payloads (`app.inject`) + fake-mailbox state in one file. The raw Graph HTTP mechanics (exact URLs, verbs, `Prefer: IdType="ImmutableId"`, payload shapes for the four operations in R1) are pinned separately in `tests/unit/email-graph-provider.test.ts` via the established `vi.stubGlobal('fetch', …)` pattern.

**Rationale**: the seam already exists and is the codebase's deliberate testing mechanism; adding draft methods to the `MailProvider` interface forces both implementations (Graph + fake) to stay in lockstep. **Alternatives considered**: an HTTP-level mock Graph server (rejected — no precedent in the repo, duplicates the provider seam); in-process handler unit tests for MCP tools (rejected — existing tool tests go through the real transport and auth, which also exercises FR-020).

## R5. Draft flag in the store and in responses

**Decision**: add `is_draft` (integer boolean, not null, default false) to `email_messages` via additive migration `0008_*` (non-lossy; generated with `npx drizzle-kit generate`). Surface it as:

- `isDraft: boolean` on each message in `get-conversation` / `emails-for-person` MCP responses and the web conversation payload (`ConversationMessage` in `src/shared/types.ts`).
- `hasDraft: boolean` on conversation summaries in `list-conversations` (MCP + REST), computed in the `listConversations` CTE as `MAX(CASE WHEN is_draft = 1 THEN 1 ELSE 0 END)` — exactly parallel to the existing `hasUnread` rollup.
- Graph reads: add `isDraft` to `SELECT_FIELDS` and `MailMessage` so sync and the draft tools carry the flag end to end.

**Rationale**: FR-013 requires the marker on every surface that shows synced mail; the rollup pattern and the migration mechanics are both established. **Alternatives considered**: inferring draft-ness from `sourceFolder === 'Drafts'` (rejected — free-text display name, breaks the FR-011 guard's "by construction" property and the sent/discarded transitions).

## R6. Drafts-folder sync: dedicated whole-folder mirror phase

**Decision**: keep `drafts` in `EXCLUDED_WELL_KNOWN_FOLDERS` (the date-ranged folder walk stays untouched — FR-017) and add a dedicated drafts phase to every sync run:

1. **Pull**: a new provider method pages the *entire* Drafts folder with no date filter (FR-015), after the normal ranged folder sync.
2. **Mirror-ingest**: draft messages bypass the snapshot rule — for a row with `is_draft = 1`, sync updates all content fields (subject, body, recipients/participants full-replace like attachments, dates, metadata) instead of the metadata-only refresh list. The snapshot rule for non-draft messages is unchanged (`tests/unit/email-refresh-rules.test.ts` gains the draft exception; its non-draft cases stay locked).
3. **Sent-draft transition**: the ranged folder ingest's refresh path additionally writes `is_draft` (a metadata-class field), so a draft sent from Outlook whose immutable id reappears in Sent Items flips to a normal snapshotted message in place. (Reads use `Prefer: IdType="ImmutableId"`, so ids survive the Drafts → Sent Items transition; the reconciliation below makes the design robust even where an id does change.)
4. **Reconcile removals**: at the end of the run, delete every store row still flagged `is_draft = 1` whose `graphMessageId` was not seen in this run's Drafts pull — that covers discarded drafts and sent drafts whose sent copy wasn't (or wasn't yet) ingested. Conversations left with zero messages are deleted too. If a sent draft's sent copy lies outside the run's range, the message is absent until a later run covering its date pulls it — consistent with SC-003 ("the drafts work-helper shows exactly match the mailbox's Drafts folder").

**Sync-run counts (spec-deferred decision)**: drafts newly inserted count in `newCount`; re-encountered drafts count in `updatedCount` (matching how re-encountered non-draft messages already count); reconciliation removals are not counted — `sync_runs` has no removal column and adding one is out of scope. Draft tool writes never create `sync_runs` rows and never touch the `SyncCoordinator` single-flight lock (FR-014, mirroring the read-state precedent); the drafts phase inside a sync run is part of that run's normal recording.

**Rationale**: a separate phase satisfies "entire folder regardless of range" without contorting the ranged walk, and the mirror/reconcile pair delivers FR-016's four outcomes. **Alternatives considered**: un-excluding drafts in `flattenSyncableFolders` (rejected — the ranged `receivedDateTime` filter would miss old drafts, violating FR-015); Graph delta queries on the Drafts folder (rejected — new machinery, whole-folder listing is cheap at personal-mailbox scale).

## R7. Immediate store updates from the draft tools

**Decision**: every tool write updates the store synchronously from the Graph response, through the same draft ingest/mirror helpers sync uses (FR-012):

- **create / create-reply**: the Graph response is a full message (id, conversationId, recipients, body, `isDraft: true`) — upsert the conversation by `graphConversationId` (a fresh draft starts a new conversation row; a reply's `conversationId` matches the original, so the draft lands inside that conversation) and ingest the message with participants.
- **update**: PATCH's response message mirror-updates the row (body, bodyText, participants, subject).
- **delete**: remove the message row and its participants; delete the conversation if it now has no messages.

The store body is what the mailbox reports back (post-normalization), so `get-conversation` immediately shows what Outlook will show; `bodyText` derives through the existing ingest text-extraction path. This resolves the spec's third assumption (immediate updates, no run-history entries) in the affirmative.

## R8. Tool names and parameter shapes (spec-deferred decision)

**Decision**: four tools, named per the codebase's `verb-noun` kebab convention — `create-draft`, `create-reply-draft`, `update-draft`, `delete-draft`. (`update-draft`, not `edit-draft`: the codebase's revision verb is `update-` — `update-task`, `update-person`.) Full schemas in contracts/mcp-tools.md; highlights:

- `create-draft`: `to` (1+ addresses), optional `cc`/`bcc`, `subject`, `bodyHtml` (non-empty after trim). To/cc/bcc all supported on create and update, confirming the spec's fourth assumption.
- `create-reply-draft`: `messageId` (synced store message id, same id-space as `set-email-read-state`), `replyAll` boolean (default false) choosing reply vs reply-all per call, `bodyHtml`.
- `update-draft`: `messageId`, required `bodyHtml` (whole-body replace, verbatim, nothing appended), optional `to`/`cc`/`bcc`/`subject` — anything not supplied stays unchanged.
- `delete-draft`: `messageId`.
- All four return a human sentence plus `structuredContent` (draft summary: message id, conversation id, subject, recipients, `isDraft: true`, webLink). Tool descriptions steer revision to `update-draft` (FR-008) and state the drafts-only guard; `set-email-read-state`'s "this is the only mailbox-modifying tool" description sentence is updated.

**Rationale**: matches every existing naming/response convention; store message ids (not Graph ids) keep the id-space consistent with the read-state tool and make the FR-011 guard a store lookup.

## R9. Error taxonomy and exact strings

**Decision**: follow the `set-email-read-state` mapping verbatim (service throws typed errors; the tool layer converts to `toolError` text — `isError: true`, no structuredContent). Strings:

| Condition | String |
|---|---|
| Provider missing / never signed in | `The mailbox is not connected — connect the mailbox on the Sync page.` |
| Sign-in expired | `` The mailbox sign-in has expired (${detail}) — reconnect the mailbox on the Sync page. `` |
| Sign-in lacks Mail.ReadWrite | Generalized `MailWritePermissionError` message (R3) |
| Reply target not synced | `` Message ${messageId} not found `` |
| Edit/delete target not a draft | `` Message ${messageId} is not a draft — only draft messages can be edited or deleted. `` |
| Draft gone from mailbox (Graph 404) | `The mailbox no longer has this draft — the next sync will reconcile it.` |
| Empty body | `A body is required` |

Order of operations guarantees FR-022's no-side-effects property: preflight `verifyWriteAccess()` → input validation → store lookup + draft-flag guard → mailbox write → store update. Every failure fires before the mailbox write except the 404 path, which by definition changed nothing; the store is only touched after a successful mailbox write.

## R10. Signature storage, API, and panel

**Decision**: store the signature as a single HTML string in the existing `app_state` key-value table under key `email.signature` (no migration needed), via `getAppState`/`setAppState`. New route file `src/server/routes/email-signature.ts` exposing `GET /api/email-signature` → `{ signature: string | null }` and `PUT /api/email-signature` `{ signature: string }` (echoes the saved value; a whitespace-only string clears the signature → GET returns null), zod schema in `src/shared/validation.ts` — the exact `dashboard.ts` saved-view pattern. The panel is a new self-contained section on `SyncPage.vue` (`data-testid="signature-section"`, naive-ui textarea + save button, empty state before first save), following the `MailboxPanel`/`UpNextDashboard` fetch-on-mount + PUT-on-save house style. Draft creation reads the signature at call time — one signature, used for every create until changed (FR-002); `update-draft` never touches it.

**Alternatives considered**: a dedicated settings table/column (rejected — `app_state` exists for exactly this); rich-text editor for the panel (rejected — spec says "paste and edit as a single HTML block"; a plain textarea is the truthful UI).

## R11. Web draft markers

**Decision**: EmailsPage list rows get a `Draft` chip next to the existing unread-dot/attachment markers (`v-if="conversation.hasDraft"`, `data-testid="draft-indicator"`); the conversation view gets a `.email-meta-badge email-meta-badge-draft` "Draft" badge on draft messages (`v-if="message.isDraft"`, `data-testid="message-draft"`), following the existing badge system and its local tinted-color convention. Component tests extend `tests/component/emails-page.test.ts` / `email-conversation-page.test.ts`; a seeded draft is added to `dev-seed.ts` so the `browser-tester` agent can capture evidence against `MAIL_PROVIDER=fake`.

## R12. Layering of new code

**Decision**: mirror the read-state split exactly — "service owns the loop, tool owns the messaging":

- `MailProvider` interface (+ Graph and fake implementations) gains the draft operations and the Drafts-folder pull (contracts/mail-provider.md).
- New service `src/server/services/email/drafts.ts`: preflight, signature lookup, body composition (R2), provider calls, store ingest (shared helpers with the sync mirror path).
- Sync changes live in `src/server/services/email/sync.ts` (drafts phase + reconciliation + refresh-path `is_draft`).
- Tools registered in `src/server/mcp/tools.ts` per house pattern; routes in `src/server/routes/email-signature.ts`; shared types/validation in `src/shared/`.
