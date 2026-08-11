# Tasks: Email UI — Browse Synced Email

**Input**: Design documents from `/specs/014-email-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/emails-api.md, contracts/mail-provider.md, quickstart.md

**Tests**: Included and mandatory — the constitution (Principle II) requires TDD: every behavior change starts with a failing test written before the code that makes it pass. Test tasks precede implementation tasks in every phase. The MCP regression tasks are deliberate characterization tests (they pass immediately and pin FR-018's invariance).

**Organization**: Tasks are grouped by user story so each story is an independently implementable, independently testable increment. Ingestion-side work (schema migration, provider delta, `isInline` recording, backfill — FR-018/FR-019) serves multiple stories and therefore lives in the Foundational phase per the earliest-story rule.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US4); Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path(s)

## Path Conventions

Single-repo web app per plan.md: server code in `src/server/`, client code in `src/client/`, shared wire types in `src/shared/types.ts`, tests in `tests/{unit,component,integration}/`, migrations in `drizzle/`. Dev ports for this branch: API 3014 / UI 5114.

---

## Phase 1: Setup

**Purpose**: Dependency and baseline for the feature — the project itself already exists.

- [ ] T001 Install `dompurify` ^3 as a client-side dependency (`npm install dompurify`; it ships its own types — no `@types/` package) and confirm `npm run typecheck` still passes; changes land in `package.json` and `package-lock.json`
- [ ] T002 Run the full gate (`npm run lint && npm run typecheck && npm test && npm run build`) to record a green baseline before any feature change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The entire ingestion/data layer every story reads through: the additive schema migration (`is_inline` + `app_state`), the `MailProvider` contract delta, sync recording of `isInline`, the MCP-invariance regression pin (FR-018), the one-time inline-flag backfill (FR-019), and the scenario-rich dev seed used for browser evidence.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — the UI's non-inline filtering (FR-004/FR-010) is meaningless until the flag exists, is recorded by sync, and MCP invariance is pinned.

- [ ] T003 Edit `src/server/db/schema.ts`: add `is_inline` integer-boolean column (NOT NULL DEFAULT 0) to `email_attachments`, and add the new `app_state` table (`key` text primary key, `value` text NOT NULL) per data-model.md
- [ ] T004 Generate the migration with `npx drizzle-kit generate` producing `drizzle/0001_*.sql`; verify it contains ONLY `ALTER TABLE email_attachments ADD COLUMN is_inline ...` and `CREATE TABLE app_state ...` (no table recreation, no data movement — constitution Data & migrations; the `0000_futuristic_sunspot` baseline is never touched), and confirm `tests/integration/db.test.ts` (fresh `:memory:` migration) stays green
- [ ] T005 Extend the provider contract in `src/server/services/email/provider.ts`: `MailAttachmentMeta` gains `isInline: boolean`; `fetchAttachmentMetadata(messageId, options?: { allowNotFound?: boolean })` now returns `Promise<MailAttachmentMeta[] | null>` — `null` if and only if `allowNotFound` is set and the message no longer exists (contracts/mail-provider.md)
- [ ] T006 [P] Update `src/server/services/email/graph-provider.ts`: add `isInline` to the attachment `$select`, map `isInline: attachment.isInline === true` (absent → false), and pass `allowNotFound` through to the existing `authorizedFetch` option, returning `null` on its `null`; without options, 404 behavior is exactly today's throw
- [ ] T007 [P] Update `src/server/services/email/fake-provider.ts`: `SeedAttachment` gains optional `isInline` (default `false`) passed through verbatim; an unknown `messageId` returns `null` under `allowNotFound` and throws otherwise, matching Graph semantics
- [ ] T008 Extend `tests/integration/email-sync-runs.test.ts` with FAILING tests: seed `FakeMailProvider` messages whose attachments mix `isInline: true` and `false`, run a sync, and assert `email_attachments.is_inline` is recorded correctly on the new-message insert path AND on the refresh delete+reinsert path (red — sync does not persist the flag yet)
- [ ] T009 Persist `isInline` in `src/server/services/email/sync.ts` on both the new-message attachment insert and the refresh delete+reinsert paths, turning T008 green; no other ingestion behavior changes (FR-018)
- [ ] T010 [P] Extend `tests/integration/email-read-tools.test.ts` with MCP regression pins: over a synced store that contains inline attachments, assert `list-conversations`, `get-conversation`, and `emails-for-person` output is unchanged from today — inline attachments still count toward `hasAttachments` and still appear in attachment lists, and no `bodyOriginal`/`bodyContentType` fields appear (characterization tests: they must pass immediately and guard the `queries.ts` option work in US1–US3 against FR-018 violations)
- [ ] T011 [P] Create `tests/integration/attachment-backfill.test.ts` with FAILING tests covering the contract table in contracts/mail-provider.md: flags updated for stored rows matched by `(name, sizeBytes)`; message gone (`null` under `allowNotFound`) → permanently skipped, rows keep `is_inline = 0`, run still completes; transient thrown error → run aborts, partial flag updates kept, NO marker, next `run()` retries from the top; marker `attachment-inline-backfill` written in `app_state` only on completion (value = ISO timestamp); fresh DB with no attachment rows → marker written immediately; existing marker → `run()` is a no-op; concurrent `run()` is single-flight; after a successful sync via `POST /api/email-sync/runs` the backfill observably runs (sync trigger wiring)
- [ ] T012 Create `src/server/services/app-state.ts`: minimal get/set helpers over the `app_state` key-value table
- [ ] T013 Create `src/server/services/email/attachment-backfill.ts` per contracts/mail-provider.md: constructor takes the app DB, the app's single `MailProvider`, and a logger; exposes `run(): Promise<void>` with single-flight guard, marker no-op, fresh-DB immediate completion, sequential per-message `fetchAttachmentMetadata(graphMessageId, { allowNotFound: true })`, `(name, sizeBytes)` matching with `UPDATE ... SET is_inline` only (structurally no insert and no delete — FR-019), skip-on-gone, abort-on-error without marker; turns T011 green except the trigger test
- [ ] T014 Wire the backfill triggers: construct the service in `src/server/app.ts` and hand it to `SyncCoordinator`; kick it after every successful sync run in `src/server/services/email/sync-coordinator.ts`; fire-and-forget a run after listen in `src/server/index.ts` — all triggers non-blocking, completing T011 fully green
- [ ] T015 [P] Extend `src/server/services/email/dev-seed.ts` into the scenario-rich evidence mailbox (research R10 / quickstart): the US1 pair with exact spec metadata ("Pricing question" — 2 messages, latest 2026-08-05, all read, no attachments, first body containing bold "updated pricing sheet", a link to https://example.com/pricing, and a `<script>` tag; "Quote attached" — 1 message sent 2026-08-06 09:00 / received 09:01, unread, importance high, flagged, category "Orange category", folder Inbox, attachment quote.pdf PDF 52 KB, from "Sam Rivera" <sam.rivera@example.com> to "Tyler Satre" <tyler@example.com>), 30 conversations total for load-more, a message whose only attachments are inline (signature image), unmatched addresses ana.alvarez@example.com (cc, for US4 sc1) and "Jordan Smith" <jordan.smith@example.com> (from, for US4 sc2), and Sam Rivera's second address sam.personal@example.com (US3)

**Checkpoint**: Ingestion records `isInline`, historical rows are backfillable, MCP invariance is pinned, migration is additive-only and green both fresh and upgraded — user story implementation can now begin.

---

## Phase 3: User Story 1 - Browse conversations on the Emails page (Priority: P1) 🎯 MVP

**Goal**: An "Emails" nav link opens a routed `/emails` page listing synced conversations newest-first — subject, participants, message count, latest date, unread and (non-inline) attachment indicators — 25 at a time with load-more, and a styled empty state when nothing is synced (FR-001…FR-006).

**Independent Test**: Seed conversations into the synced store via `FakeMailProvider` + a real sync, open the Emails page from the nav, and check ordering, row contents, indicators, paging, and the empty state — no detail view needed.

### Tests for User Story 1 (write first, confirm red)

- [ ] T016 [P] [US1] Extend `tests/component/app-shell.test.ts`: the top nav renders an "Emails" link and marks it with `aria-current` when the route is `/emails` (red — link doesn't exist)
- [ ] T017 [P] [US1] Create `tests/component/emails-page.test.ts` (jsdom, @testing-library/vue, stubbed `fetch`): rows ordered as returned, each showing subject, participants (display name when present, bare address otherwise), message count, and latest-message date via `absoluteLocal`; styled "(no subject)" placeholder for empty subjects; unread indicator and attachment indicator shown/hidden per row flags; load-more present only when `nextCursor` is non-null and appends the next page; styled empty state (`data-testid="emails-empty"`) on an empty response (red)
- [ ] T018 [P] [US1] Create `tests/integration/email-api.test.ts` covering `GET /api/emails/conversations` (contracts/emails-api.md): default limit 25 ordered `(latestMessageAt DESC, id DESC)`; `nextCursor` non-null when more exist and the cursor fetches the remainder; `nextCursor` null on the last page; `limit` validation (400 on non-integer/out-of-range); 400 on malformed `cursor`; empty store returns `{ conversations: [], nextCursor: null }`; `hasAttachments` true only for non-inline attachments (a conversation whose only attachments are inline shows `hasAttachments: false`); `hasUnread` rollup; participants carry `person` links when addresses are linked — all seeded through `FakeMailProvider` + a real sync run (red — endpoint doesn't exist)
- [ ] T019 [P] [US1] Create `tests/unit/email-format.test.ts`: the shared subject-fallback helper returns the "(no subject)" presentation for empty/whitespace subjects and passes real subjects through (red)

### Implementation for User Story 1

- [ ] T020 [P] [US1] Add `EmailConversationSummary` (id, subject, messageCount, latestMessageAt, hasUnread, hasAttachments, participants with nullable person) and the `{ conversations, nextCursor }` page envelope to `src/shared/types.ts` per data-model.md
- [ ] T021 [P] [US1] Extend `listConversations` in `src/server/services/email/queries.ts` with an opt-in `attachmentRollup: 'all' | 'non-inline'` option (default `'all'`); `'non-inline'` adds `WHERE is_inline = 0` inside the attachment rollup CTE; ordering, cursor, and participants unchanged; MCP call sites in `src/server/mcp/tools.ts` untouched — T010 regression pins must stay green
- [ ] T022 [US1] Create `src/server/routes/emails.ts` with `GET /api/emails/conversations` (query `limit` 1–100 default 25, opaque `cursor`; maps `listConversations(..., { attachmentRollup: 'non-inline' })` onto the wire envelope; 400 `Invalid limit` / `Invalid cursor` per contract) and register the routes in `src/server/app.ts`; turns T018 green
- [ ] T023 [P] [US1] Create `src/client/utils/email-format.ts` with the shared subject-fallback helper used wherever subjects render (FR-003); turns T019 green
- [ ] T024 [P] [US1] Register the `/emails` route in `src/client/router.ts` and add the "Emails" nav link to `src/client/App.vue` with `activeSection` treating `/emails` and `/emails/...` as Emails (mirroring the `/people/:id` pattern); turns T016 green
- [ ] T025 [US1] Create `src/client/pages/EmailsPage.vue`: hand-rolled list rows in the app's shared row style, subject via the T023 helper, participants, message count, `absoluteLocal` date, unread dot/badge + bold row text, paperclip glyph with accessible label, plain `NButton` load-more shown only while `nextCursor` is non-null, `NEmpty` empty state with `data-testid="emails-empty"`, `<p role="alert">` error text, rows navigating to `/emails/:id`; turns T017 green

**Checkpoint**: US1 is fully functional — gate green, and the US1 acceptance scenarios (nav + empty state, ordering/indicators, 25+load-more→30) are browser-checkable against the dev seed (`MAIL_PROVIDER=fake ... npm run dev`, quickstart flow). Consolidated browser evidence is captured in Phase 7.

---

## Phase 4: User Story 2 - Read a conversation in full detail (Priority: P2)

**Goal**: A routed `/emails/:id` detail page shows every message oldest-first, fully expanded: sanitized HTML bodies rendered in shadow roots (scripts inert, styles contained), escaped plain-text bodies, full per-message metadata, non-inline attachment metadata, an open-in-Outlook link, and linked addresses navigating to person records (FR-007…FR-011).

**Independent Test**: Seed a conversation with known bodies and metadata, open its detail view from the list, and check message order, body rendering, script safety, and every displayed metadata field.

### Tests for User Story 2 (write first, confirm red)

- [ ] T026 [P] [US2] Create `tests/unit/sanitize-email.test.ts` (jsdom): `<script>` tags and event-handler attributes (e.g. `onerror`) are stripped, `javascript:` URLs removed, bold markup and `https:` links are kept, and every surviving anchor gets `target="_blank"` + `rel="noopener noreferrer"` (red)
- [ ] T027 [P] [US2] Create `tests/component/email-body.test.ts` (jsdom): for `bodyContentType: 'html'` the component attaches an open shadow root containing the sanitized formatting (bold renders as an element, link as an anchor) and a body containing `<script>` produces no script side effects; for `'text'` the body renders as escaped text with line breaks and blank-line paragraphs preserved (`white-space: pre-wrap`), URLs stay plain text (no anchor), and markup-looking text stays literal (red)
- [ ] T028 [P] [US2] Create `tests/component/email-conversation-page.test.ts` (jsdom, stubbed `fetch`): messages render fully expanded oldest-first; each message shows from/to/cc display names alongside addresses (bare address when no display name), sent and received timestamps, unread marker when unread, importance, flagged state, categories, folder, attachment name/type/size, and the open-in-Outlook link pointing at `webLink`; a participant with a `person` renders as a link to `/people/:id`; conversation-level "(no subject)" placeholder; and the view offers no mailbox write actions — no mark read/unread, flag, move, delete, reply, forward, or compose controls anywhere (FR-017) (red)
- [ ] T029 [P] [US2] Extend `tests/integration/email-api.test.ts` with `GET /api/emails/conversations/:id`: messages complete and ordered `(sentAt ASC, id ASC)`; `bodyOriginal` + `bodyContentType` present exactly as stored; `attachments` excludes inline rows (a message whose only attachments are inline yields `attachments: []`) and `isInline` itself never crosses the wire; participants carry role and nullable person; 404 `Conversation not found` on unknown and non-numeric ids (red)
- [ ] T030 [P] [US2] Extend `tests/unit/email-format.test.ts` with `formatBytes` cases (bytes → human-readable KB/MB, e.g. 53248 → "52 KB") (red)
- [ ] T031 [P] [US2] Extend `tests/component/app-shell.test.ts`: `aria-current` marks Emails as active on `/emails/:id` too (red until the route exists)

### Implementation for User Story 2

- [ ] T032 [P] [US2] Extend `getConversation` in `src/server/services/email/queries.ts` with opt-in `{ attachments: 'all' | 'non-inline', includeOriginalBody?: boolean }` (defaults `'all'`, `false`): non-inline filters the attachment fetch on `is_inline = 0`; `includeOriginalBody` additionally selects `body_original`/`body_content_type` into optional `ConversationMessage` fields; MCP call sites untouched — T010 pins stay green
- [ ] T033 [P] [US2] Add `EmailConversationDetail`, `EmailConversationMessage` (with participants, attachments, `bodyOriginal`, `bodyContentType`) to `src/shared/types.ts` per data-model.md
- [ ] T034 [US2] Add `GET /api/emails/conversations/:id` to `src/server/routes/emails.ts`: `getConversation(..., { attachments: 'non-inline', includeOriginalBody: true })` mapped onto the wire shape, 404 `Conversation not found` on unknown/non-numeric id; turns T029 green
- [ ] T035 [P] [US2] Create `src/client/utils/sanitize-email.ts`: `sanitizeEmailHtml()` wrapping DOMPurify's default safe profile with an `afterSanitizeAttributes` hook forcing `target="_blank"` + `rel="noopener noreferrer"` on anchors (research R2); turns T026 green
- [ ] T036 [P] [US2] Add `formatBytes` to `src/client/utils/email-format.ts`; turns T030 green
- [ ] T037 [US2] Create `src/client/components/EmailBody.vue`: `html` bodies → `sanitizeEmailHtml()` output injected into a per-message open shadow root; `text` bodies → ordinary escaped Vue interpolation styled `white-space: pre-wrap`, no shadow root, no auto-linking (research R2/R3); turns T027 green
- [ ] T038 [US2] Create `src/client/pages/EmailConversationPage.vue` and register `/emails/:id` in `src/client/router.ts`: fetch the detail endpoint, render all messages oldest-first fully expanded with `EmailBody`, full metadata per FR-009 (both timestamps via `absoluteLocal`, unread marker, importance, flag, categories, folder), non-inline attachments with `formatBytes`, open-in-Outlook link, linked participants as `RouterLink` to `/people/:id`, "(no subject)" via the shared helper, `<p role="alert">` error text and a not-found state; turns T028 and T031 green

**Checkpoint**: US1 and US2 both work — a conversation opens from the list, bodies render with formatting and without script execution, all metadata fields display, linked addresses click through to people.

---

## Phase 5: User Story 3 - See a person's correspondence on their record (Priority: P3)

**Goal**: Every person record shows an email section listing that person's conversations newest-first — each row showing every distinct involved address with all of its distinct roles — 5 at a time with an in-place show-all, an empty state otherwise, and rows clicking through to the detail view (FR-015/FR-016).

**Independent Test**: Seed a person with linked addresses involved in a known set of conversations, open the person record, and check the section's ordering, roles, show-all behavior, click-through, and empty state.

### Tests for User Story 3 (write first, confirm red)

- [ ] T039 [P] [US3] Extend `tests/integration/email-api.test.ts` with `GET /api/people/:personId/email-conversations`: all of the person's conversations ordered `(latestMessageAt DESC, conversationId DESC)`; each row's `addresses` lists the person's distinct involved addresses with each address's distinct roles across the conversation's messages (seed a conversation where one address holds several roles and one where two of the person's addresses appear — clarification 2026-08-11); a person involved only as cc still gets the conversation with role `cc`; a person with no synced mail returns `{ conversations: [] }`; 404 `Person not found` (red)
- [ ] T040 [P] [US3] Create `tests/component/person-email-section.test.ts` (jsdom, stubbed `fetch`): shows the 5 newest conversations with subject (incl. "(no subject)" placeholder), date, and address+role chips (e.g. "sam.rivera@example.com — to, cc"); a show-all control reveals the remaining rows in place and is absent at ≤5; entries link to `/emails/:conversationId`; styled empty state (`data-testid="person-emails-empty"`) when the list is empty (red)
- [ ] T041 [P] [US3] Extend `tests/component/person-detail-page.test.ts`: the person record renders the email section between the Phones and Tags sections (stub its email-conversations fetch alongside the page's existing stubbed requests) — pins the FR-015 mount itself, not just the component (red — the section isn't mounted yet)

### Implementation for User Story 3

- [ ] T042 [P] [US3] Add `conversationsForPerson(db, personId)` to `src/server/services/email/queries.ts`: join `email_participants → email_addresses (person_id = ?) → email_messages → email_conversations`, group to distinct conversations with per-address distinct-role rollups, ordered `(MAX(sent_at) DESC, conversation_id DESC)` (research R8)
- [ ] T043 [P] [US3] Add `PersonEmailConversation` (conversationId, subject, latestMessageAt, addresses with roles) and its `{ conversations }` envelope to `src/shared/types.ts` per data-model.md
- [ ] T044 [US3] Add `GET /api/people/:personId/email-conversations` to `src/server/routes/emails.ts`: 404 `Person not found` when the person doesn't exist, else all rows from `conversationsForPerson`; turns T039 green
- [ ] T045 [US3] Create `src/client/components/PersonEmailSection.vue`: fetches the person's conversations, renders the 5 newest with address+role chips and subject/date, plain `NButton` show-all revealing the rest in place (absent at ≤5), rows as `RouterLink` to `/emails/:conversationId`, `NEmpty` empty state with `data-testid="person-emails-empty"`; turns T040 green
- [ ] T046 [US3] Mount `PersonEmailSection` in `src/client/pages/PersonDetailPage.vue` between the Phones and Tags sections; turns T041 green

**Checkpoint**: US1–US3 all work — correspondence is visible on person records with correct address+role rollups and click-through to detail.

---

## Phase 6: User Story 4 - Link an unmatched address to a person, or create the person, from an email (Priority: P4)

**Goal**: In the detail view, every unmatched address offers a link control (person search over the existing `GET /api/people?q=`, posting to the existing `POST /api/people/:personId/emails`) and a create-person control (inline `PersonForm` prefilled from the display-name split and address, submitting the existing `POST /api/people`); both leave the address linked everywhere, persisting across reload (FR-012…FR-014).

**Independent Test**: Seed messages with unlinked addresses, exercise the link and create-person controls in the detail view, and check the resulting links on the person record — including after a page reload.

### Tests for User Story 4 (write first, confirm red)

- [ ] T047 [P] [US4] Extend `tests/unit/email-format.test.ts` with the display-name split: two-word "Jordan Smith" → first "Jordan" / last "Smith"; one-word, empty, missing, and more-than-two-word display names (e.g. "Sam J. Rivera") → both fields blank (FR-013 edge case) (red)
- [ ] T048 [P] [US4] Extend `tests/integration/email-person-linking.test.ts`: linking an unmatched synced address via `POST /api/people/:personId/emails { value }` makes it appear with `person` set in `GET /api/emails/conversations/:id` participants AND surfaces the conversation in `GET /api/people/:personId/email-conversations`; creating a person via `POST /api/people` with the prefill payload links the pre-existing unlinked address row (no duplicate) with the same two observations; linking an already-linked address returns 409 `That email is already in use` (red — the new-endpoint observations don't exist for these flows yet)
- [ ] T049 [P] [US4] Extend `tests/component/email-conversation-page.test.ts`: link/create controls render only for participants with `person: null` (linked addresses show none); the link control searches `GET /api/people?q=` (300 ms debounce) and renders "First Last — email" result rows with `data-testid="search-result"`; selecting a result POSTs to `/api/people/:personId/emails` and the view then shows the address as linked; the create-person control expands `PersonForm` inline prefilled with first/last from the display-name split and the email address; a 409 response surfaces as the control's error text (red)

### Implementation for User Story 4

- [ ] T050 [P] [US4] Add the display-name split helper to `src/client/utils/email-format.ts` (pure function per research R12); turns T047 green
- [ ] T051 [US4] Create `src/client/components/AddressLinkControls.vue`: link control reusing the `LinkedPeople.vue` search pattern (debounced `GET /api/people?q=`, result rows "First Last — email", `data-testid="search-result"`) posting `{ value: address }` to `POST /api/people/:personId/emails`; create-person control expanding `PersonForm` (create mode, `initialValues` from the split helper + address) inline under the address — not a modal — submitting the existing `POST /api/people`; 409/400 errors shown as control-local error text; emits a linked event on success
- [ ] T052 [US4] Wire `AddressLinkControls` into `src/client/pages/EmailConversationPage.vue` for every participant with `person: null`, refreshing the conversation detail on the linked event so the address immediately renders as linked; turns T048 and T049 green

**Checkpoint**: All four user stories are functional — unmatched correspondence becomes CRM data in one flow from the detail view, and the links persist.

---

## Phase 7: Polish & Verification Evidence

**Purpose**: Cross-cutting validation and the constitution's evidence requirements (Principle III).

- [ ] T053 [P] Verify the migration upgrade path per quickstart.md: run the server against a copy of an existing dev database, confirm `drizzle/0001_*.sql` applies without data loss, and confirm the upgraded schema matches a fresh-DB schema (both paths converge)
- [ ] T054 Run the full gate (`npm run lint && npm run typecheck && npm test && npm run build`) and record its output as the automated-check evidence for the API/MCP-only criteria (FR-018 via `email-sync-runs.test.ts` + `email-read-tools.test.ts`, FR-019 via `attachment-backfill.test.ts`)
- [ ] T055 Dispatch the `browser-tester` agent through the quickstart evidence flow (`MAIL_PROVIDER=fake MAIL_AUTH=fake DATABASE_PATH=./data/email-ui-evidence.db npm run dev`, UI at http://localhost:5114): capture the fresh-DB empty state first, create Sam Rivera (+ both addresses) and Ana Alvarez (without her address) through the People page, sync from the Sync page, then walk US1 sc1–sc3, US2 sc1–sc3 (asserting no script-injected content), US3 sc1–sc2, and US4 sc1–sc2 including a page reload after each link — screenshots + `results.md` to `docs/evidence/014-email-ui/`
- [ ] T056 Dispatch the `verifier` agent to independently confirm every acceptance criterion: re-run the gate, cross-check T055's browser evidence against each UI scenario, and confirm the recorded automated-check output covers FR-018 (sync records `isInline`; MCP output unchanged) and FR-019 (backfill match/skip/abort/marker/trigger behavior)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. Internal order: T003 → T004 (schema before migration); T005 → T006/T007 (interface before implementations); T007+T004 → T008 → T009 (fake-provider seed support and the column before the failing sync test, test before sync code); T009 → T010 (regression pin needs recorded inline flags); T004+T007 → T011 → T012 → T013 → T014 (failing backfill tests, then state helper, then service, then triggers); T007 → T015 (seed needs `SeedAttachment.isInline`)
- **User Stories (Phases 3–6)**: All depend on Foundational. US1 has no story dependencies. US2 extends files US1 created (`routes/emails.ts`, `email-api.test.ts`, `email-format.*`, router/nav) — implement after US1. US3 extends the same server files — after US2 (or after US1 if reordered, it has no US2 dependency beyond shared files). US4 depends on US2's detail page (its only mount point) and is verified through US3's endpoint — implement last
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within Each User Story

- All test tasks are written and confirmed FAILING before their implementation tasks (constitution Principle II; T010 is the deliberate characterization exception and must PASS immediately)
- Types and queries before routes (T020/T021 → T022; T032/T033 → T034; T042/T043 → T044)
- Utils and child components before pages (T023 → T025; T035 → T037 → T038; T045 → T046; T050 → T051 → T052)
- The MCP regression pins (T010) must stay green through every `queries.ts` change (T021, T032, T042)

### Parallel Opportunities

- Phase 2: T006 ∥ T007 (after T005); T010 ∥ T011 ∥ T015 (after T009/T007)
- Phase 3: T016 ∥ T017 ∥ T018 ∥ T019 (all test files distinct), then T020 ∥ T021 ∥ T023 ∥ T024
- Phase 4: T026 ∥ T027 ∥ T028 ∥ T029 ∥ T030 ∥ T031, then T032 ∥ T033 ∥ T035 ∥ T036
- Phase 5: T039 ∥ T040 ∥ T041, then T042 ∥ T043
- Phase 6: T047 ∥ T048 ∥ T049, then T050 alongside nothing else pending
- Phase 7: T053 can run parallel to nothing gate-dependent; T054 → T055 → T056 are sequential

---

## Parallel Example: User Story 1

```text
# After Foundational completes, launch all US1 test tasks together (confirm each red):
Task T016: extend tests/component/app-shell.test.ts (Emails nav link, aria-current on /emails)
Task T017: create tests/component/emails-page.test.ts
Task T018: create tests/integration/email-api.test.ts (list endpoint)
Task T019: create tests/unit/email-format.test.ts (subject fallback)

# Then launch the independent implementation tasks together:
Task T020: EmailConversationSummary types in src/shared/types.ts
Task T021: attachmentRollup option in src/server/services/email/queries.ts
Task T023: subject helper in src/client/utils/email-format.ts
Task T024: /emails route + nav in src/client/router.ts and src/client/App.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T015) — the ingestion/data layer, FR-018/FR-019 fully tested
3. Phase 3: US1 (T016–T025)
4. **STOP and VALIDATE**: gate green; browse the seeded list at http://localhost:5114/emails — US1 alone already gives a readable overview of synced mail

### Incremental Delivery

1. Setup + Foundational → sync records `isInline`, backfill ready, MCP pinned
2. US1 → the Emails list works end-to-end (MVP)
3. US2 → conversations are readable in full, safely
4. US3 → correspondence appears on person records
5. US4 → unmatched addresses become CRM links
6. Polish → migration upgrade check, gate evidence, browser-tester evidence, verifier confirmation → PR

Each story lands as a complete vertical slice (query option → endpoint → wire type → page/component) without breaking the previous ones; the single PR carries all four per the plan.

---

## Notes

- [P] = different files and no dependency on an incomplete task; never run two tasks touching the same file in parallel (`queries.ts`, `routes/emails.ts`, `src/shared/types.ts`, `email-format.*`, `email-api.test.ts`, and `email-conversation-page.test.ts` are each touched by multiple stories — sequential across phases by design)
- TDD is non-negotiable here: red before green in every slice; code written before its failing test is discarded (constitution Principle II)
- FR-018 guardrail: after every `queries.ts` task, re-run `tests/integration/email-read-tools.test.ts` — any diff in MCP output is a defect
- Commit after each task or logical group (Conventional Commits); everything lands via the single `014-email-ui` PR
- Evidence directory: `docs/evidence/014-email-ui/` (screenshots + results.md from browser-tester), independently confirmed by the verifier agent before the feature is reported done
