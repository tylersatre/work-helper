# Tasks: MCP Email Drafts

**Input**: Design documents from `/specs/031-mcp-email-drafts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (mcp-tools.md, http-api.md, mail-provider.md), quickstart.md

**Tests**: REQUIRED — the constitution makes TDD non-negotiable (Principle II): every test task is written first and confirmed failing (red) before its implementation tasks begin. Code written before its failing test is discarded.

**Organization**: Tasks are grouped by user story (P1–P5 from spec.md) so each story is an independently implementable, independently testable vertical slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in its group)
- **[Story]**: Which user story this task belongs to (US1–US5); Setup/Foundational/Polish tasks carry no story label
- Every task names exact file paths

## Path Conventions

Single npm project at repository root: `src/server/`, `src/client/`, `src/shared/`, tests by tier under `tests/` (unit / integration / component), migrations in `drizzle/`. Feature 031 dev ports: API 3031, UI 5131.

---

## Phase 1: Setup

**Purpose**: confirm the worktree is a green baseline before any red test is written.

- [X] T001 Confirm dependencies are installed in the worktree and the gate commands pass on the untouched branch: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

**Checkpoint**: clean baseline — any later failure is caused by this feature's work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the `is_draft` flag end to end — schema column plus `MailMessage.isDraft` plumbing through both providers and ingest. Every user story reads or writes this flag.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

- [X] T002 [P] Add `is_draft` column (integer boolean mode, NOT NULL, DEFAULT false) to `email_messages` in `src/server/db/schema.ts`, generate the additive migration `drizzle/0008_*.sql` via `npx drizzle-kit generate`, and verify the generated SQL is purely additive (no table recreate, no data loss) with migrations `0000`–`0007` untouched (data-model.md)
- [X] T003 [P] Extend `tests/unit/email-graph-provider.test.ts` with failing (red) assertions that `isDraft` is requested in the Graph `$select` field list and mapped onto the returned `MailMessage`
- [X] T004 Make T003 green: add `isDraft: boolean` to `MailMessage` in `src/server/services/email/provider.ts`, add `isDraft` to `SELECT_FIELDS` and the message mapping in `src/server/services/email/graph-provider.ts`, carry the flag on `FakeMailProvider` messages in `src/server/services/email/fake-provider.ts`, and persist it into `email_messages.is_draft` at message ingest in `src/server/services/email/sync.ts`

**Checkpoint**: the draft flag flows provider → ingest → store; user stories can begin.

---

## Phase 3: User Story 1 — Fresh drafts land in the Drafts folder (Priority: P1) 🎯 MVP

**Goal**: `create-draft` MCP tool — fresh standalone drafts with the saved signature appended, landing in the mailbox's Drafts folder and on every work-helper surface immediately (no sync run), with clean no-side-effect failures; draft markers appear on the Emails page surfaces (US1 acceptance scenario 2).

**Independent Test**: with a connected simulated mailbox (`FakeMailProvider`), call `create-draft` over a real MCP client and verify the draft in the fake Drafts folder and on `list-conversations`/`get-conversation`/REST surfaces; the signature scenario seeds `app_state['email.signature']`; error scenarios flip the fake's `writeAccess` knob.

### Tests for User Story 1 (write first — must FAIL before implementation) ⚠️

- [X] T005 [P] [US1] Extend `tests/unit/email-graph-provider.test.ts` (red): `createDraft` issues `POST /me/messages` with `toRecipients`/`ccRecipients`/`bccRecipients`, `subject`, `body: { contentType: 'HTML', content }` and the existing auth + `Prefer: IdType="ImmutableId"` headers, returning the created message (id, conversationId, `isDraft: true`, webLink) — research R1
- [X] T006 [P] [US1] Create `tests/integration/mcp-draft-tools.test.ts` (red, modeled on `tests/integration/mcp-mark-read-tools.test.ts`: real Fastify app on port 0, OAuth approval dance, real `@modelcontextprotocol/sdk` client over `StreamableHTTPClientTransport` — exercises FR-020) covering US1: no-signature create writes exactly the supplied body with nothing appended (AC1); with a saved signature, body reads supplied HTML then signature, recipients/subject as given — including a bcc recipient, confirming to/cc/bcc all land through the tool (spec assumption 4, research R8) — and the draft appears at once — no sync run, no new `sync_runs` row — as its own conversation with `hasDraft` in `list-conversations` and `isDraft` in `get-conversation` (MCP) and in the REST payloads `GET /api/emails/conversations` / `GET /api/emails/conversations/:id` (AC2, FR-012/FR-013/FR-014); after changing the saved signature, a further create appends the new value (FR-002 — signature read at call time); Sent folder unchanged throughout (SC-004); not-connected, expired, and no-write-permission calls each fail with the exact R9 error strings, distinguishable, creating nothing (AC3, FR-021); empty/whitespace `bodyHtml` fails with `A body is required` and creates nothing (AC4, FR-022)
- [X] T007 [P] [US1] Extend `tests/component/emails-page.test.ts` (red): a conversation summary with `hasDraft: true` renders a "Draft" chip with `data-testid="draft-indicator"` alongside the existing unread/attachment markers; `hasDraft: false` renders none
- [X] T008 [P] [US1] Extend `tests/component/email-conversation-page.test.ts` (red): a message with `isDraft: true` renders a "Draft" badge with `data-testid="message-draft"` in the `.email-meta-badges` row; a non-draft message renders none

### Implementation for User Story 1

- [X] T009 [US1] Add `createDraft({ to, cc, bcc, subject, bodyHtml })` to the `MailProvider` interface in `src/server/services/email/provider.ts` per contracts/mail-provider.md (body arrives already composed — signature appending is the service's job)
- [X] T010 [P] [US1] Implement `GraphMailProvider.createDraft` in `src/server/services/email/graph-provider.ts` — `POST /me/messages`, HTML content type, returns the mapped created message (makes T005 green)
- [X] T011 [P] [US1] Implement `FakeMailProvider.createDraft` in `src/server/services/email/fake-provider.ts` — in-memory Drafts-folder state, deterministic generated ids, honoring the existing `writeAccess` knob — plus inspection accessors in the `readStateOf()`/`recordedWrites` style (e.g. `draftsInMailbox()`, `sentMessages()`) for Drafts-contents and Sent-invariance assertions
- [X] T012 [P] [US1] Generalize the `MailWritePermissionError` message in `src/server/services/email/graph-auth.ts` to operation-neutral wording ("The mailbox sign-in lacks permission to change mail — add delegated Mail.ReadWrite to the Entra app registration, then reconnect the mailbox on the Sync page to grant it.") — research R3, keeps the three failure states distinguishable
- [X] T013 [US1] Create `src/server/services/email/drafts.ts` — the draft service's create path: preflight `verifyWriteAccess()` → validate `bodyHtml` non-empty after trim → read signature from `app_state['email.signature']` via `getAppState` → compose body (`bodyHtml` + signature; nothing appended when none saved) → `provider.createDraft` → ingest the response into the store (conversation upsert by `graphConversationId` starting a new conversation, message insert with participants, `is_draft = true`) — typed errors per research R9, store touched only after the mailbox write succeeds (FR-022)
- [X] T014 [P] [US1] Add the `hasDraft` rollup (`MAX(is_draft)` per conversation, parallel to `hasUnread`) to `listConversations` and `isDraft` to per-message payloads in `src/server/services/email/queries.ts`, and add `hasDraft` to `EmailConversationSummary` / `isDraft` to `ConversationMessage` in `src/shared/types.ts` (flows to the REST payloads per contracts/http-api.md)
- [X] T015 [US1] Register the `create-draft` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md — zod raw-shape input, `draftSummarySchema` output + `structuredContent`, success sentence `Created draft "<subject>" (message <id>).`, `toolError` mapping of the R9 typed errors, description steering revisions to `update-draft` (FR-008) and noting the signature append — and add `hasDraft` to `conversationSummarySchema` / `isDraft` to the message schemas used by `get-conversation` and `emails-for-person` (makes T006 green)
- [X] T016 [P] [US1] Add the "Draft" chip (`v-if="conversation.hasDraft"`, `data-testid="draft-indicator"`) to conversation rows in `src/client/pages/EmailsPage.vue` next to the existing unread/attachment markers, following the house badge conventions (makes T007 green)
- [X] T017 [P] [US1] Add the "Draft" badge (`v-if="message.isDraft"`, `data-testid="message-draft"`, `.email-meta-badge email-meta-badge-draft` with the local tinted-color convention) to messages in `src/client/pages/EmailConversationPage.vue` (makes T008 green)

**Checkpoint**: US1 fully functional — `create-draft` works end to end against the simulated mailbox, all US1 tests green. MVP deliverable.

---

## Phase 4: User Story 2 — Reply and reply-all drafts quoted like Outlook (Priority: P2)

**Goal**: `create-reply-draft` MCP tool — reply and reply-all drafts shaped exactly like Outlook desktop replies ("Re:" subject, mailbox-derived recipients with Tyler's address excluded, body layered supplied HTML → signature → quoted original), landing inside the conversation they reply to.

**Independent Test**: seed a synced conversation in the `FakeMailProvider`, call `create-reply-draft` with `replyAll` false and true, and verify each draft's subject, recipients, layered body order, and conversation placement; call with an unknown message id and verify the clean failure.

### Tests for User Story 2 (write first — must FAIL before implementation) ⚠️

- [X] T018 [P] [US2] Extend `tests/unit/email-graph-provider.test.ts` (red): `createReplyDraft` posts to `POST /me/messages/{id}/createReply` or `/createReplyAll` with an **empty request body**, inserts the prefix HTML immediately after the returned body's opening `<body …>` tag (string-prepend fallback when no `<body>` tag), then `PATCH`es the merged body; a Graph 404 on the createReply call maps to the not-found signal — research R2
- [X] T019 [P] [US2] Extend `tests/integration/mcp-draft-tools.test.ts` (red) covering US2: against the seeded "Pricing question" conversation and saved signature, a reply draft and a reply-all draft both carry subject "Re: Pricing question", sit inside that conversation marked as drafts, and read top to bottom as supplied HTML → signature → quote block; the reply addresses the sender only, the reply-all keeps the other recipients with the owner's address excluded (AC1, FR-005/FR-006, SC-002); `messageId: 999999` fails with `Message 999999 not found` and creates nothing (AC2, FR-022)

### Implementation for User Story 2

- [X] T020 [US2] Add `createReplyDraft(graphMessageId, { replyAll, prefixHtml })` to the `MailProvider` interface in `src/server/services/email/provider.ts` per contracts/mail-provider.md
- [X] T021 [P] [US2] Implement `GraphMailProvider.createReplyDraft` in `src/server/services/email/graph-provider.ts` — create-then-patch per research R2 (makes T018 green)
- [X] T022 [P] [US2] Implement `FakeMailProvider.createReplyDraft` in `src/server/services/email/fake-provider.ts` — new `ownerAddress` constructor option; simulated derivation: `Re:` prefix (not doubled), reply → original sender as `to`, reply-all → sender as `to` plus other to/cc recipients as `cc` with the owner excluded; body = prefix + a recognizable quote block containing the original message so layered-order assertions work
- [X] T023 [US2] Extend `src/server/services/email/drafts.ts` with the reply path: preflight → validate body → look up the store row by synced `messageId` (missing → not-found error, before any mailbox call) → compose prefix (`bodyHtml` + signature) → `provider.createReplyDraft` → ingest the returned draft into the existing conversation (matched by `graphConversationId`)
- [X] T024 [US2] Register the `create-reply-draft` MCP tool in `src/server/mcp/tools.ts` per contracts/mcp-tools.md — `messageId`/`replyAll`/`bodyHtml` input, draft-summary output, success sentence naming reply vs reply-all (makes T019 green)

**Checkpoint**: US1 and US2 both green — the create paths (fresh + reply/reply-all) are complete.

---

## Phase 5: User Story 3 — Edit and delete drafts, guarded by the draft flag (Priority: P3)

**Goal**: `update-draft` and `delete-draft` MCP tools — verbatim whole-body replace (nothing appended, not even the signature) with optional recipient/subject changes, and outright delete; the `is_draft` store flag is the guard that keeps real mail out of reach, and stale drafts (sent/discarded in Outlook since last sync) are refused cleanly.

**Independent Test**: seed a synced draft and a synced non-draft message in the `FakeMailProvider`; update then delete the draft verifying mailbox + store both change immediately; attempt update/delete on the non-draft id and on a stale draft id (fake 404 knob) and verify each rejection changes nothing.

### Tests for User Story 3 (write first — must FAIL before implementation) ⚠️

- [ ] T025 [P] [US3] Extend `tests/unit/email-graph-provider.test.ts` (red): `updateDraft` issues `PATCH /me/messages/{id}` carrying exactly the supplied fields (omitted fields absent from the payload); `deleteDraft` issues `DELETE /me/messages/{id}`; Graph 404s on both map to the not-found signal via the existing `allowNotFound` convention
- [ ] T026 [P] [US3] Extend `tests/integration/mcp-draft-tools.test.ts` (red) covering US3: `update-draft` on a hand-started synced draft replaces the body with exactly the supplied HTML — nothing appended, signature untouched — changes cc, leaves to/subject unchanged, and `get-conversation` shows the update immediately with no sync run (AC1, FR-009/FR-012); `delete-draft` removes the reply draft from the fake Drafts folder and its conversation immediately, leaving the conversation's real messages and the reply-all draft untouched, nothing sent, and neither the update nor the delete added a `sync_runs` row (AC2, FR-010, FR-014); update and delete against a non-draft message id each fail with `Message <id> is not a draft — only draft messages can be edited or deleted.` and change nothing in mailbox or store (AC3, FR-011, SC-005); update against a stale draft (fake 404 knob) fails with `The mailbox no longer has this draft — the next sync will reconcile it.` and the store is untouched (AC4, FR-022)

### Implementation for User Story 3

- [ ] T027 [US3] Add `updateDraft(graphMessageId, { bodyHtml?, to?, cc?, bcc?, subject? })` and `deleteDraft(graphMessageId)` to the `MailProvider` interface in `src/server/services/email/provider.ts` per contracts/mail-provider.md
- [ ] T028 [P] [US3] Implement `GraphMailProvider.updateDraft` (PATCH, only supplied fields) and `GraphMailProvider.deleteDraft` (DELETE) with 404 → not-found mapping in `src/server/services/email/graph-provider.ts` (makes T025 green)
- [ ] T029 [P] [US3] Implement `FakeMailProvider.updateDraft`/`deleteDraft` in `src/server/services/email/fake-provider.ts` against the in-memory Drafts folder, plus the stale-draft failure knob (`deletedGraphMessageIds`-style) producing the not-found path
- [ ] T030 [US3] Extend `src/server/services/email/drafts.ts` with the update and delete paths: preflight → validate (update: body non-empty) → store lookup **and** `is_draft = true` guard before any mailbox call (FR-011) → provider call → on update, mirror the response into the store (all content fields, participants replaced wholesale — the shared mirror helper sync reuses in US5; data-model.md); on delete, remove the row + participants and delete the conversation when it now has no messages; provider not-found → stale-draft error with the store untouched
- [ ] T031 [US3] Register the `update-draft` and `delete-draft` MCP tools in `src/server/mcp/tools.ts` per contracts/mcp-tools.md — update returns the draft summary, delete returns `{ messageId, deleted: true }`, both with the R9 `toolError` mapping and drafts-only wording in their descriptions (makes T026 green)

**Checkpoint**: the full drafting loop (create / reply / update / delete) is functional and guard-protected; all four tools exist.

---

## Phase 6: User Story 4 — One signature, saved in work-helper (Priority: P4)

**Goal**: the signature panel on the Email Sync page — paste/edit one HTML block, persisted in `app_state['email.signature']` via new GET/PUT REST endpoints, shown on every later visit. (US1/US2 already consume the stored value; this story adds the UI + API to manage it.)

**Independent Test**: `app.inject` the GET/PUT pair and verify null-before-save, echo-on-save, verbatim-on-GET, whitespace-clears; mount the Sync page component and verify empty state → save → persistence across remount.

### Tests for User Story 4 (write first — must FAIL before implementation) ⚠️

- [ ] T032 [P] [US4] Create `tests/integration/email-signature.test.ts` (red): `GET /api/email-signature` returns `{ signature: null }` before any save; `PUT` with `{ signature: '<p>Tyler Satre</p><p>Example Corp</p>' }` echoes the saved value and a subsequent GET returns it verbatim; a whitespace-only PUT clears it (GET returns null again); a non-string body gets `400` with the house `{ error: { message } }` shape — contracts/http-api.md
- [ ] T033 [P] [US4] Extend `tests/component/sync-page.test.ts` (red): the `data-testid="signature-section"` panel shows its empty state when GET returns null; entering HTML in the textarea and saving PUTs the value; a remount with the saved value shows it in the panel (persistence, US4 AC1); a failed save shows the error line

### Implementation for User Story 4

- [ ] T034 [P] [US4] Add the email-signature PUT request schema (`signature` must be a string) to `src/shared/validation.ts` and the `{ signature: string | null }` payload type to `src/shared/types.ts` — the `dashboard.ts` saved-view pattern
- [ ] T035 [P] [US4] Create `src/server/routes/email-signature.ts` — `GET /api/email-signature` and `PUT /api/email-signature` backed by `getAppState`/`setAppState` on key `email.signature` (whitespace-only save clears; GET then returns null) — and register the routes in `src/server/app.ts` (makes T032 green)
- [ ] T036 [P] [US4] Create `src/client/components/SignaturePanel.vue` (MailboxPanel/UpNextDashboard house style: fetch-on-mount, naive-ui textarea holding the raw HTML block, save button, error line, empty state before first save) and add the `data-testid="signature-section"` section to `src/client/pages/SyncPage.vue` (makes T033 green)

**Checkpoint**: Tyler can save his signature in the UI and every create appends it; US1–US4 all green.

---

## Phase 7: User Story 5 — Drafts folder mirrors the mailbox on every sync (Priority: P5)

**Goal**: every sync run pulls the entire Drafts folder regardless of date range and mirrors draft-flagged rows (Outlook edits show up, sent drafts stop being drafts, discarded drafts disappear, untouched out-of-range drafts stay); non-draft sync behavior is untouched.

**Independent Test**: seed four synced drafts in the `FakeMailProvider`, mutate the fake mailbox without syncing (edit one, send one, discard one, leave one untouched), run a sync with a narrow date range, and verify all four FR-016 outcomes in the store.

### Tests for User Story 5 (write first — must FAIL before implementation) ⚠️

- [ ] T037 [P] [US5] Extend `tests/unit/email-refresh-rules.test.ts` (red): rows with `is_draft = 1` mirror **all** content fields (subject, body, participants full-replace, dates, metadata) on re-encounter; non-draft snapshot cases stay locked unchanged (FR-017); `is_draft` joins the ranged refresh's metadata field list so a sent draft's row flips to non-draft when its immutable id reappears in a normal folder — research R6
- [ ] T038 [P] [US5] Extend `tests/unit/email-graph-provider.test.ts` (red): `fetchDraftMessages` pages the entire Drafts folder via `GET /me/mailFolders/drafts/messages` with **no** `$filter`, using the existing `$select` list and `Prefer: IdType="ImmutableId"` header, following `@odata.nextLink` pagination
- [ ] T039 [P] [US5] Extend `tests/integration/email-sync.test.ts` (red) with the US5 AC1 scenario: four synced drafts; fake-mailbox mutations (edit "Quote follow-up" to `<p>New wording.</p>`, send "Intro for Ana" with its sent copy dated 2026-08-05 — inside the sync range, per US5 AC1 — discard "Never mind", leave "Old idea" of 2026-05-01 untouched); sync range 2026-08-01→2026-08-08; assert the edited draft shows the new body still flagged, the sent draft appears nowhere as a draft and its in-range sent copy sits in the conversation as a normal snapshotted message, the discarded draft is gone from the store, the out-of-range untouched draft is still present and flagged (FR-015/FR-016, SC-003); drafts fold into `newCount`/`updatedCount` while reconciliation removals are uncounted, and emptied conversations are deleted — research R6
- [ ] T040 [P] [US5] Confirm `tests/unit/email-folder-pruning.test.ts` still locks the Drafts folder out of the ranged folder walk (`drafts` stays in `EXCLUDED_WELL_KNOWN_FOLDERS`), extending the assertion if the drafts phase changes folder handling (FR-017)

### Implementation for User Story 5

- [ ] T041 [US5] Add `fetchDraftMessages(onMessage)` (whole-folder streaming pull, same shape as `fetchMessages`) to the `MailProvider` interface in `src/server/services/email/provider.ts` and implement it in `src/server/services/email/graph-provider.ts` (makes T038 green)
- [ ] T042 [US5] Implement `FakeMailProvider.fetchDraftMessages` plus the mailbox-side mutation hooks in `src/server/services/email/fake-provider.ts`: edit a draft's body in the "mailbox", mark a draft sent (leaves the fake Drafts folder, sent copy exposed to ranged sync in its conversation and to the `sentMessages()` accessor), discard a draft
- [ ] T043 [US5] Extend `src/server/services/email/sync.ts`: a dedicated drafts phase after the ranged folder walk that pulls the whole Drafts folder and mirror-ingests draft rows (reusing US3's mirror helper — all content fields, participants full-replace); `is_draft` added to the ranged ingest's metadata refresh list (sent-draft flip); end-of-run reconciliation deleting every store row still `is_draft = 1` whose `graphMessageId` was not seen in this run's Drafts pull, plus conversations left with zero messages; counts per research R6 (new drafts → `newCount`, re-encountered → `updatedCount`, removals uncounted) (makes T037/T039 green)
- [ ] T044 [P] [US5] Update the `sync-emails` tool description in `src/server/mcp/tools.ts`: the Drafts folder now syncs in full on every run (folder-exclusion wording changes; the explicit-range requirement is untouched) — contracts/mcp-tools.md

**Checkpoint**: all five stories independently green — every surface stays truthful as Tyler works his drafts in Outlook between syncs.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: description touch-ups, dev seed for browser evidence, gates, and the constitution's evidence + verification requirements.

- [ ] T045 [P] Update the `set-email-read-state` tool description in `src/server/mcp/tools.ts` — replace the "only mailbox-modifying tool" sentence to name the four draft tools as the other sanctioned mailbox writes (contracts/mcp-tools.md "Changes to existing tools")
- [ ] T046 [P] Add a seeded draft to `src/server/services/email/dev-seed.ts` so the Draft chip and badge are visible under `MAIL_PROVIDER=fake` without any tool call (research R11)
- [ ] T047 Run the gate commands and record their passing output: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (quickstart.md gates; also enforced by the Stop hook)
- [ ] T048 Capture `browser-tester` agent evidence into `docs/evidence/mcp-email-drafts/` against the dev server (`MAIL_PROVIDER=fake npm run dev` — API 3031, UI 5131): Sync page signature panel empty state → save `<p>Tyler Satre</p><p>Example Corp</p>` → reload → still shown (US4 AC1); Emails page conversation row shows the Draft chip → open conversation → draft message shows the Draft badge (US1 AC2 / FR-013 UI surfaces)
- [ ] T049 Run the `verifier` agent to independently confirm every acceptance criterion has a passing automated check plus surface-appropriate evidence (integration/unit/component output for MCP+API criteria, browser evidence for UI criteria) per quickstart.md's story→test map and the constitution's Definition of Done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories** (every story reads/writes `is_draft`). T004 depends on T002 + T003.
- **User Stories (Phases 3–7)**: all depend on Foundational. Priority order P1→P5 is the default execution order; independence notes below.
- **Polish (Phase 8)**: T045 needs all four tools (Phases 3–5); T046 needs the marker surfaces (Phase 3); T047–T049 need every implemented story — run last, in order T047 → T048 → T049.

### User Story Dependencies

- **US1 (P1)**: only Foundational. Creates `drafts.ts`, the queries/types/schema surface additions, and the marker UI that later stories reuse.
- **US2 (P2)**: builds on US1's `drafts.ts` service (signature compose, ingest helpers) and tool patterns — start after US1.
- **US3 (P3)**: builds on US1's `drafts.ts` and seeded-draft test setup; its mirror-update helper is reused by US5 — start after US1 (US2 not strictly required, but priority order keeps the shared integration test file conflict-free).
- **US4 (P4)**: independent of US1–US3 (touches only signature API/panel files) — can run in parallel with any story after Foundational if capacity allows.
- **US5 (P5)**: depends on Foundational and reuses US3's mirror helper — start after US3.

### Within Each User Story

- Test tasks first, confirmed failing (red), before any implementation task — constitution Principle II.
- Provider interface before the two implementations (Graph + fake); service before tool registration; server payloads (queries/types) before UI markers.
- Same-file sequencing: tasks touching `provider.ts`, `graph-provider.ts`, `fake-provider.ts`, `drafts.ts`, `tools.ts`, or `mcp-draft-tools.test.ts` in different stories are serialized by running the stories in order.

### Parallel Opportunities

- **Foundational**: T002 ∥ T003.
- **US1**: T005 ∥ T006 ∥ T007 ∥ T008 (all red tests); after T009: T010 ∥ T011 ∥ T012; T014 ∥ T013; T016 ∥ T017.
- **US2**: T018 ∥ T019; after T020: T021 ∥ T022.
- **US3**: T025 ∥ T026; after T027: T028 ∥ T029.
- **US4**: T032 ∥ T033 ∥ T034; then T035 ∥ T036. The whole story can run alongside US1–US3/US5.
- **US5**: T037 ∥ T038 ∥ T039 ∥ T040; T044 ∥ T041–T043.
- **Polish**: T045 ∥ T046.

---

## Parallel Example: User Story 1

```bash
# Write all four red tests together:
Task: "Extend tests/unit/email-graph-provider.test.ts — createDraft POST mechanics (T005)"
Task: "Create tests/integration/mcp-draft-tools.test.ts — create-draft acceptance (T006)"
Task: "Extend tests/component/emails-page.test.ts — draft-indicator chip (T007)"
Task: "Extend tests/component/email-conversation-page.test.ts — message-draft badge (T008)"

# After the interface lands (T009), the two provider implementations and the auth-message reword run together:
Task: "GraphMailProvider.createDraft in src/server/services/email/graph-provider.ts (T010)"
Task: "FakeMailProvider.createDraft + accessors in src/server/services/email/fake-provider.ts (T011)"
Task: "Generalize MailWritePermissionError in src/server/services/email/graph-auth.ts (T012)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline gates) → Phase 2 (is_draft column + flag plumbing).
2. Phase 3: US1 red tests, then implementation to green.
3. **STOP and VALIDATE**: `npx vitest run tests/unit/email-graph-provider.test.ts tests/integration/mcp-draft-tools.test.ts tests/component/emails-page.test.ts tests/component/email-conversation-page.test.ts` — `create-draft` alone already delivers the feature's core value (triage ending with a ready-to-send draft).

### Incremental Delivery

1. Setup + Foundational → flag plumbing ready.
2. US1 → validate → MVP (fresh drafts + markers).
3. US2 → validate (reply/reply-all — the main daily use).
4. US3 → validate (full drafting loop, guard proven).
5. US4 → validate (signature manageable from the UI).
6. US5 → validate (surfaces stay truthful over time).
7. Polish: descriptions, dev seed, gates, browser evidence, verifier — then PR.

Each story lands green without breaking the previous ones; the Stop-hook gate (lint/typecheck/test/build) holds at every checkpoint.

---

## Notes

- [P] = different files and no dependency on an incomplete task; same-file tasks are never [P] against each other.
- Every red test task cites the acceptance scenario / FR it proves; the quickstart.md story→test map is the cross-reference.
- `tests/integration/mcp-draft-tools.test.ts` is shared by US1/US2/US3 — each story extends it in story order, which is why those stories serialize.
- Commit after each task or logical red→green group (Conventional Commits); no code before its failing test exists.
