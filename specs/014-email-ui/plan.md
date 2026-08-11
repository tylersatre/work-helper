# Implementation Plan: email-ui

**Branch**: `014-email-ui` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-email-ui/spec.md`

## Summary

Add a read-only email browsing UI over the existing synced store: an Emails page (25-per-page conversation list with load-more), a routed conversation detail page rendering sanitized HTML bodies with full message metadata, an email section on the person record, and link/create-person controls for unmatched addresses. Technically: three new GET endpoints in a new `routes/emails.ts` that reuse (and minimally parameterize) the existing `queries.ts` helpers so MCP tool behavior is untouched; both write actions reuse the existing `POST /api/people/:id/emails` and `POST /api/people` endpoints, whose services already link unmatched synced addresses; HTML bodies are sanitized client-side with DOMPurify and rendered inside a shadow root so embedded scripts never execute and embedded styles never bleed into the app. The one sync change records each attachment's `isInline` flag (Graph already returns it) via the first additive migration on the production DB, and a one-time backfill service re-fetches attachment metadata for stored messages with attachment rows — triggered at startup and after each successful sync until a completion marker in a new `app_state` table is set. Browser evidence syncs a scenario-rich `FakeMailProvider` seed through the real ingestion path. Full decisions in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥22 (ESM, `verbatimModuleSyntax` — `.js` import suffixes)

**Primary Dependencies**: Fastify 5 (API), drizzle-orm 0.45 + better-sqlite3 (store), Vue 3.5 + Naive UI + vue-router 4 (client), Vite 8 (dev proxy), zod 4 (validation), **new: `dompurify` ^3 (client-side HTML sanitization; ships its own types)**. `@modelcontextprotocol/sdk` untouched.

**Storage**: SQLite via drizzle. One additive migration (`drizzle/0001_*.sql` — the first on top of the deployed baseline): `email_attachments.is_inline` integer boolean NOT NULL DEFAULT 0, plus a new `app_state` key-value table for the backfill completion marker. Both are pure `ADD COLUMN`/`CREATE TABLE` — no table recreation, no data loss, no hand-adjustment expected (verified against generated SQL).

**Testing**: Vitest 4 — unit (sanitizer wrapper, display-name split, backfill helpers), component (`// @vitest-environment jsdom`, @testing-library/vue, stubbed `fetch`), integration (`buildApp` over `createDb(':memory:')` + `app.inject`, email data seeded through `FakeMailProvider` + a real sync run). `browser-tester` agent (Playwright MCP) against `npm run dev` with `MAIL_PROVIDER=fake` for UI evidence; `verifier` agent re-runs the gate.

**Target Platform**: Self-hosted Docker (Linux), single-user web app; dev on macOS worktree with per-branch ports (014 → API 3014, UI 5114); SPA fallback already routes unknown paths like `/emails` to `index.html`.

**Project Type**: Web application — one repo, `src/server` (Fastify + MCP) and `src/client` (Vue SPA) with a Vite `/api` proxy in dev.

**Performance Goals**: Personal scale (one user, thousands of messages). List page serves 25 rows per request via the existing keyset cursor; the existing per-row participant lookup (N+1) is the established pattern and fine at this scale. Backfill is sequential one-Graph-call-per-message, run in the background off the request path.

**Constraints**: Production data — migration must preserve existing rows (constitution Data & migrations). MCP tools MUST NOT change behavior (FR-018): inline filtering is opt-in per call site, MCP call sites keep defaults, pinned by regression tests. Read-only over the mailbox (`Mail.Read` scope only; backfill only reads). Stored bodies are untrusted input: sanitize before render, everywhere bodies render (FR-008, SC-003). No live updating.

**Scale/Scope**: 2 new pages + 1 nav link, ~4 new components, 1 new route file (3 GET endpoints), 1 new backfill service + tiny app-state helper, 1 migration, ~2 query-helper extensions + 1 new query, extended dev seed, ~10 new/extended test suites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Spec is the source of truth | Tyler-approved PRD at `docs/product/features/email-ui.md` (interview-resolved 2026-08-11) → `/speckit-specify` spec with 5 recorded clarifications; this plan builds only FR-001…FR-019 | PASS |
| II. Test-first (non-negotiable) | Every slice starts red: integration tests for each endpoint and the backfill, component tests per page/section, unit tests for sanitizer/prefill; sync `isInline` recording tested through `FakeMailProvider` before provider code changes | PASS |
| III. Evidence over assertion | quickstart.md maps every acceptance scenario to its surface: browser-tester evidence for all UI scenarios (US1–US4), recorded automated-check output for sync ingestion and backfill (FR-018/FR-019, no UI surface); verifier re-runs both | PASS |
| IV. Architecture constraints | TypeScript throughout; no new frameworks (DOMPurify is a library, client-only); MCP tools byte-for-byte unchanged in behavior (regression-pinned); ingestion and backfill stay inside the server using the existing Graph provider — agents remain consumers only; Docker target unaffected | PASS |
| V. Small vertical slices, trunk via PR | Single feature branch `014-email-ui` in its own worktree; four independently testable user stories land as one PR via CI review; Conventional Commits | PASS |
| Data & migrations | Additive-only migration (ADD COLUMN with default + CREATE TABLE); deployed rows untouched; `DEFAULT 0` = non-inline errs toward showing attachments until the backfill corrects history; nothing lossy to flag | PASS |

**Post-design re-check (after Phase 1)**: No new violations. The design adds one client-side dependency (DOMPurify), no MCP surface, no second ingestion path (backfill reuses the app's single `MailProvider`), and the migration remains purely additive. Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-email-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── emails-api.md    # Phase 1 output — REST read endpoints + reused write endpoints
│   └── mail-provider.md # Phase 1 output — provider interface delta + backfill contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
drizzle/
└── 0001_<generated>.sql                      # NEW: ADD COLUMN email_attachments.is_inline; CREATE TABLE app_state

src/server/
├── db/schema.ts                              # CHANGED: is_inline column on email_attachments; app_state table
├── index.ts                                  # CHANGED: fire-and-forget backfill attempt after listen
├── app.ts                                    # CHANGED: register emails routes; construct backfill service; hand it to SyncCoordinator
├── routes/
│   └── emails.ts                             # NEW: GET /api/emails/conversations, GET /api/emails/conversations/:id, GET /api/people/:personId/email-conversations
└── services/
    ├── app-state.ts                          # NEW: get/set over the app_state key-value table
    └── email/
        ├── provider.ts                       # CHANGED: MailAttachmentMeta.isInline; fetchAttachmentMetadata optional { allowNotFound } → null on 404
        ├── graph-provider.ts                 # CHANGED: $select adds isInline; allowNotFound passthrough
        ├── fake-provider.ts                  # CHANGED: SeedAttachment.isInline (default false); null for unknown message ids when allowNotFound
        ├── sync.ts                           # CHANGED: persist isInline on attachment insert/refresh
        ├── queries.ts                        # CHANGED: opt-in non-inline attachment filtering + opt-in bodyOriginal/bodyContentType (MCP call sites keep defaults); NEW conversationsForPerson
        ├── attachment-backfill.ts            # NEW: one-time inline-flag backfill (single-flight, resumable, marker in app_state)
        ├── sync-coordinator.ts               # CHANGED: kick backfill after each successful run
        └── dev-seed.ts                       # CHANGED: scenario-rich seed for browser evidence (30 conversations, script body, inline + regular attachments, unmatched addresses)

src/shared/
└── types.ts                                  # CHANGED: EmailConversationSummary/Detail, PersonEmailConversation response types

src/client/
├── router.ts                                 # CHANGED: /emails, /emails/:id routes
├── App.vue                                   # CHANGED: Emails nav link; activeSection covers /emails and /emails/:id
├── pages/
│   ├── EmailsPage.vue                        # NEW: conversation list, indicators, load-more, empty state
│   ├── EmailConversationPage.vue             # NEW: detail view — messages oldest-first, metadata, attachments, address link state + controls
│   └── PersonDetailPage.vue                  # CHANGED: mount PersonEmailSection between Phones and Tags
├── components/
│   ├── EmailBody.vue                         # NEW: html → DOMPurify + shadow root; text → escaped pre-wrap
│   ├── AddressLinkControls.vue               # NEW: unmatched-address link (person search) + create-person (prefilled PersonForm) controls
│   └── PersonEmailSection.vue                # NEW: 5 newest conversations with address+role chips, show-all, empty state
└── utils/
    ├── sanitize-email.ts                     # NEW: DOMPurify wrapper (safe profile, target="_blank" rel="noopener noreferrer" on links)
    └── email-format.ts                       # NEW: formatBytes, "(no subject)" fallback helper, display-name split for prefill

tests/
├── unit/
│   ├── sanitize-email.test.ts                # NEW (jsdom): script/event-handler stripped, bold/links kept, link target rewrite
│   └── email-format.test.ts                  # NEW: formatBytes, subject fallback, two-word/one-word/empty display-name split
├── component/
│   ├── app-shell.test.ts                     # EXTENDED: Emails nav link + aria-current on /emails and /emails/:id
│   ├── emails-page.test.ts                   # NEW: ordering, row fields, indicators, load-more presence/absence, empty state
│   ├── email-conversation-page.test.ts       # NEW: oldest-first expansion, metadata fields, linked-person rendering, controls shown only for unmatched addresses
│   ├── email-body.test.ts                    # NEW (jsdom): html renders formatting into shadow root, no script side effects; text preserves breaks/blank lines, no auto-linking
│   ├── person-detail-page.test.ts            # EXTENDED: email section mounted on the person record between Phones and Tags
│   └── person-email-section.test.ts          # NEW: 5-then-show-all, address+role rollup rendering, empty state, click-through link
└── integration/
    ├── email-api.test.ts                     # NEW: list paging/cursor/limit, detail (bodies, 404), person conversations (roles rollup, 404), inline filtering on all three
    ├── attachment-backfill.test.ts           # NEW: flags updated by name+size match, message-gone skip, transient abort + retry, marker set, idempotent re-run, sync + fresh-DB triggers
    ├── email-sync-runs.test.ts               # EXTENDED: sync records isInline on new + refreshed messages
    ├── email-read-tools.test.ts              # EXTENDED: regression — MCP list/get/emails-for-person output unchanged when inline attachments exist
    └── email-person-linking.test.ts          # EXTENDED: link + create-person flows observed through the new person email-conversations endpoint
```

**Structure Decision**: Existing single-repo web layout — an additive vertical slice: one new route file + one new service server-side, two new pages + three components client-side, wired through the existing `app.ts` decoration and flat client router. The only schema change is the additive migration above; everything else reuses established modules (`queries.ts`, `contact-entries.ts`, `people.ts`, `PersonForm.vue`, `FakeMailProvider`).

## Complexity Tracking

No constitution violations — table intentionally empty.
