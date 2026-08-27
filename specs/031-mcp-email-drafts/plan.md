# Implementation Plan: MCP Email Drafts

**Branch**: `031-mcp-email-drafts` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-mcp-email-drafts/spec.md`

## Summary

Add draft create/update/delete to the work-helper MCP — fresh standalone drafts and Outlook-shaped reply/reply-all drafts, with Tyler's saved signature appended on create — writing through Microsoft Graph's native draft operations (`POST /me/messages`, `createReply`/`createReplyAll` + patch, `PATCH`, `DELETE`) under the already-granted `Mail.ReadWrite` scope. Drafts join the synced store with a new `is_draft` flag: tool writes update the store immediately, every sync run mirrors the entire Drafts folder (a specced exception to the snapshot rule), and drafts are visibly marked on all existing surfaces. The web app gains exactly one panel — the signature editor on the Sync page. There is no send capability anywhere. Technical approach per [research.md](research.md): extend the `MailProvider` seam (Graph + fake implementations), a new `drafts.ts` service mirroring the read-state layering, a dedicated whole-folder Drafts phase in sync with end-of-run reconciliation, and the `FakeMailProvider` as the simulated mailbox for all automated acceptance checks.

## Technical Context

**Language/Version**: TypeScript ~5.9 (strict), Node.js >= 22, ESM

**Primary Dependencies**: Fastify 5 (HTTP), `@modelcontextprotocol/sdk` ^1.30 (MCP server + test client), zod 4 (raw-shape tool schemas), Drizzle ORM ^0.45 + better-sqlite3 (store), `@azure/msal-node` 5 (device-code auth, file token cache), Vue 3.5 + Vite + naive-ui (client)

**Storage**: SQLite via Drizzle; migrations in `drizzle/` applied at startup; production data exists — next migration is `0008_*`, additive only (`email_messages.is_draft`); signature in the existing `app_state` key-value table (no migration)

**Testing**: vitest 4 — `tests/unit` (node), `tests/integration` (real Fastify app on port 0 + real MCP client over `StreamableHTTPClientTransport`), `tests/component` (jsdom + @testing-library/vue); simulated mailbox = `FakeMailProvider` behind the `MailProvider` interface; Graph HTTP mechanics via `vi.stubGlobal('fetch', …)`

**Target Platform**: self-hosted Docker on Tyler's home server (Linux); dev on macOS

**Project Type**: web application (single npm project: Fastify server + MCP server + Vue SPA) — feature 031 dev ports: API 3031, UI 5131

**Performance Goals**: N/A beyond interactive feel — single-user personal CRM; whole-Drafts-folder pull per sync is trivially small at personal-mailbox scale

**Constraints**: never send mail (no send tool, Sent folder untouched — SC-004); mailbox writes limited to read state + Drafts folder; draft tools write caller HTML verbatim (no composing/sanitizing — FR-007); failed calls have zero side effects; landed migrations immutable; store updates from tools must be sync-free and never appear in run history

**Scale/Scope**: one user, one mailbox; 4 new MCP tools, 1 new column, 1 new settings key, 2 new REST endpoints, 1 new Sync-page panel, 2 draft markers; ~6 new/extended test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-research | Post-design |
|---|---|---|
| I. Spec is the source of truth | PASS — Tyler-approved PRD (`docs/product/features/mcp-email-drafts.md`) run through `/speckit-specify`; spec at `specs/031-mcp-email-drafts/spec.md` | PASS — every design decision traces to an FR/SC or a spec-deferred plan decision |
| II. Test-first (non-negotiable) | PASS — plan commits to failing-test-first for every slice | PASS — quickstart.md maps each story to the test files that must be written red-first; refresh-rule and folder-pruning tests are updated (red) before the sync behavior changes |
| III. Evidence over assertion | PASS | PASS — surface mapping fixed in quickstart.md: MCP/API criteria via recorded integration-test output, UI criteria (signature panel, draft markers) via `browser-tester` evidence in `docs/evidence/mcp-email-drafts/`, both independently confirmed by `verifier` |
| IV. Architecture constraints | PASS — TypeScript throughout; MCP on the official SDK; draft writes are MCP-consumer operations through server services (ingestion/sync stays inside the server, agents never become the ingestion path); Docker target unaffected | PASS — no new frameworks, no new infra; the `MailProvider` seam keeps Graph access inside the server |
| V. Small vertical slices, trunk via PR | PASS — one feature branch, lands via PR with CI review | PASS — stories P1→P5 are independently testable slices in priority order |
| Data & migrations | PASS — schema change identified as additive | PASS — `0008_*` adds a defaulted boolean column; no data loss possible; no landed migration touched. Draft-row deletions at sync are specced mirror behavior (FR-016), not migration data loss |

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/031-mcp-email-drafts/
├── plan.md              # This file
├── research.md          # Phase 0 — all spec-deferred decisions + assumption resolutions
├── data-model.md        # Phase 1 — schema change, entities, lifecycles, response shapes
├── quickstart.md        # Phase 1 — validation guide (gates, story→test map, browser evidence, Tyler's pass)
├── contracts/
│   ├── mcp-tools.md     # create-draft / create-reply-draft / update-draft / delete-draft + changed tool schemas
│   ├── http-api.md      # GET/PUT /api/email-signature + hasDraft/isDraft payload additions + UI contracts
│   └── mail-provider.md # MailProvider draft operations (Graph + fake implementations)
└── tasks.md             # Phase 2 — /speckit-tasks output (not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── db/schema.ts                          # email_messages + is_draft column (migration drizzle/0008_*)
│   ├── mcp/tools.ts                          # 4 new tools; conversationSummary/Message schema additions; description updates
│   ├── routes/email-signature.ts             # NEW — GET/PUT /api/email-signature
│   ├── app.ts                                # register email-signature routes
│   └── services/email/
│       ├── provider.ts                       # MailProvider draft methods + MailMessage.isDraft
│       ├── graph-provider.ts                 # Graph draft ops, create-then-patch reply, whole-folder Drafts pull
│       ├── fake-provider.ts                  # simulated mailbox: draft state, reply derivation, mutation hooks
│       ├── graph-auth.ts                     # generalize MailWritePermissionError message
│       ├── drafts.ts                         # NEW — draft service: preflight, signature, compose, ingest
│       ├── sync.ts                           # drafts phase, mirror ingest exception, reconciliation, is_draft refresh
│       ├── queries.ts                        # hasDraft rollup, isDraft in message payloads
│       └── dev-seed.ts                       # seeded draft for browser evidence
├── shared/
│   ├── types.ts                              # hasDraft / isDraft / signature payload types
│   └── validation.ts                         # email-signature PUT schema
└── client/
    ├── pages/SyncPage.vue                    # signature panel section
    ├── pages/EmailsPage.vue                  # Draft chip on conversation rows
    ├── pages/EmailConversationPage.vue       # Draft badge on messages
    └── components/SignaturePanel.vue         # NEW — self-contained panel (MailboxPanel pattern)

tests/
├── unit/email-graph-provider.test.ts         # extended — draft endpoints, reply layering, Drafts paging
├── unit/email-refresh-rules.test.ts          # extended — draft mirror exception
├── unit/email-folder-pruning.test.ts         # unchanged behavior confirmed (drafts stay out of ranged walk)
├── integration/mcp-draft-tools.test.ts       # NEW — US1/US2/US3 acceptance via real MCP client
├── integration/email-signature.test.ts       # NEW — US4 API
├── integration/email-sync.test.ts            # extended — US5 mirror scenarios
└── component/
    ├── sync-page.test.ts                     # extended — signature panel
    ├── emails-page.test.ts                   # extended — draft chip
    └── email-conversation-page.test.ts       # extended — draft badge
```

**Structure Decision**: single npm project with `src/server` + `src/client` + `src/shared`, tests by tier under `tests/` — the repository's existing layout; this feature only adds files inside it (two new source files, one new component, two new test files; the rest are targeted extensions).

## Complexity Tracking

No constitution violations to justify.
