# Implementation Plan: Email Sync

**Branch**: `007-email-sync` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-email-sync/spec.md`

## Summary

On-demand, date-range email ingestion from Tyler's Outlook mailbox into work-helper's own store, plus three MCP read tools. A new `GraphMailProvider` (native `fetch` against Microsoft Graph REST v1.0, MSAL device-code auth with a file token cache) pulls Inbox + Sent messages for a server-local-timezone day window; a sync service stores each message once (dedupe on Graph immutable id, per-message transactions for interruption-safe partial progress) as a permanent snapshot grouped by the mailbox's `conversationId`. The existing `person_emails` table is restructured into a shared `email_addresses` table with nullable `person_id`, making ingested addresses and People-page addresses the same case-insensitively-unique records — linking a previously synced address to a person is just setting `person_id`. Four MCP tools (`sync-emails`, `list-conversations`, `get-conversation`, `emails-for-person`) register on the existing bearer-token-gated MCP server; list tools use opaque keyset cursors (default page 50). Tests fake only the mailbox edge via a `MailProvider` seam; everything else (app, OAuth, SQLite) runs real.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, ESM), Node ≥ 22

**Primary Dependencies**: Fastify 5, `@modelcontextprotocol/sdk` ^1.30 (MCP server), drizzle-orm + better-sqlite3, zod 4; Vue 3 client (no client changes this slice). New: `@azure/msal-node` (device-code auth, research R1), `html-to-text` (plain-text derivation, research R5)

**Storage**: SQLite via better-sqlite3/drizzle; schema edited in place with migrations squashed to a single regenerated baseline per the dev-phase data policy (research R8)

**Testing**: vitest (unit + integration with in-memory SQLite and a real MCP client over the OAuth flow); mailbox faked at a `MailProvider` interface seam (research R6); browser evidence via the `browser-tester` agent for People-page criteria

**Target Platform**: self-hosted Docker (Linux server); dev on macOS; token cache and DB on the data volume

**Project Type**: web app + MCP server, single project (`src/server`, `src/client`, `src/shared`)

**Performance Goals**: one-month real-mailbox sync completes and reports in < 5 minutes (SC-006; budget analysis in research R11); read tools page at default 50, max 200

**Constraints**: mailbox access strictly read-only (FR-015, delegated `Mail.Read` only); stored messages immutable snapshots (FR-003, SC-005); idempotent sync under overlapping ranges (FR-004); range = whole days in the server's local timezone (R4); partial progress kept on interruption (FR-016, R10); all email tools behind the existing MCP bearer auth (FR-014)

**Scale/Scope**: one user, one mailbox; thousands of messages per synced month; 4 new MCP tools; no new UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-research | Post-design |
|---|---|---|
| I. Spec is the source of truth | PASS — Tyler-authored PRD (`docs/product/features/email-sync.md`) run through `/speckit-specify` with clarifications; spec at `specs/007-email-sync/spec.md` | PASS — every design element traces to an FR/SC/clarification (annotated throughout research/data-model/contracts) |
| II. Test-first (non-negotiable) | PASS — plan must make TDD possible for an external-API feature | PASS — the `MailProvider` seam (R6) exists precisely so failing integration tests can be written against a seeded fake before any Graph code; provider request-building unit-tested against fixtures |
| III. Evidence over assertion | PASS — plan must define checkable validation | PASS — quickstart.md maps every user story to named automated suites and defines browser-tester evidence for the People-page criteria; verifier re-runs both |
| IV. Architecture constraints | PASS — ingestion pulls directly from Graph inside the server; TypeScript; official MCP SDK; Docker. Note: the sync MCP tool means an agent *triggers* ingestion, but message content flows Graph → server only — agents remain consumers of query/link tools and are never the path mail travels through. Scheduled/webhook ingestion is the separate `email-sync-automation` stub. This reading is consistent with the Tyler-approved spec, which mandates the on-demand tool | PASS — design holds that boundary: `GraphMailProvider` and the sync service live in `src/server/services/email/`; the tool handler only invokes them |
| V. Small vertical slices, trunk via PR | PASS — one slice: sync + read tools + address linking; UI, automation, change-tracking, search all explicitly out of scope with stubs | PASS — lands as one PR from `007-email-sync` |
| Dev-phase data policy | PASS — no real data exists yet (this feature's first *real* ingestion will end the policy, to be handled at deployment time, not now) | PASS — schema edited in place, migrations squashed, dev DBs recreated, data-preserving carry-over test removed (R8) |

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-email-sync/
├── plan.md              # This file
├── research.md          # Phase 0 — 11 decisions (R1–R11)
├── data-model.md        # Phase 1 — email_addresses restructure + 3 new tables
├── quickstart.md        # Phase 1 — validation guide (automated, browser, real mailbox)
├── contracts/
│   ├── mcp-email-tools.md       # sync-emails, list-conversations, get-conversation, emails-for-person
│   └── people-email-linking.md  # People REST behavior delta (shapes unchanged)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── schema.ts                    # person_emails → email_addresses (nullable person_id); + email_conversations, email_messages, email_participants
├── mcp/
│   └── tools.ts                     # + the four email tools (same registration pattern, same auth gate)
├── services/
│   ├── contact-entries.ts           # email add → link-existing-unlinked; remove → unlink-if-referenced
│   ├── people.ts                    # person delete applies the same unlink rule
│   └── email/
│       ├── provider.ts              # MailProvider interface + MailMessage shape (the test seam)
│       ├── graph-auth.ts            # MSAL public client, device-code + acquireTokenSilent, file cache plugin
│       ├── graph-provider.ts        # GraphMailProvider: fetch, $filter/$select/$top/nextLink, Prefer: ImmutableId
│       ├── sync.ts                  # window calc, per-message ingest transactions, dedupe, interrupted-run result
│       └── queries.ts               # list-conversations / get-conversation / emails-for-person + keyset cursor codec
└── index.ts                         # wires GraphMailProvider from env (MS_CLIENT_ID, MAIL_TOKEN_CACHE_PATH)

scripts/
└── mail-signin.ts                   # npm run mail:signin — one-time device-code sign-in, writes token cache

drizzle/                             # squashed: single regenerated 0000_* baseline (R8)

tests/
├── unit/                            # sync window (local-tz days), cursor codec, graph request building, html→text
├── integration/
│   ├── email-sync.test.ts           # US1 via real MCP client + FakeMailProvider
│   ├── email-read-tools.test.ts     # US2
│   ├── email-person-linking.test.ts # US3 (MCP + People REST)
│   └── helpers/fake-mail-provider.ts
│   └── (migration-carry-over.test.ts DELETED per R8)
└── component/                       # unchanged — no client changes
```

**Structure Decision**: Single-project layout, extended in place. All new server logic lives under `src/server/services/email/` behind the `MailProvider` seam; MCP registration stays centralized in `src/server/mcp/tools.ts` following the existing pattern; `buildApp` gains an optional `mailProvider` so tests inject the fake while `index.ts` wires the real one. No client-side changes (the People-page delta is purely server behavior behind unchanged REST shapes).

## Complexity Tracking

No constitution violations — table intentionally empty.
