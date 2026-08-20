# Implementation Plan: MCP Mark Emails Read

**Branch**: `022-mcp-mark-emails-read` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-mcp-mark-emails-read/spec.md`

## Summary

Add a `set-email-read-state` MCP tool that marks up to 50 synced email messages read or unread, writing each change to the Outlook mailbox first (Graph `PATCH /me/messages/{id}` with `{ isRead }`) and updating the stored `email_messages.is_read` only after the mailbox accepts, with a per-message outcome for every id. The read surfaces need zero work — `hasUnread`/`isRead` are already derived from the stored column by the shared query layer behind both the MCP read tools and the web Emails pages. The real design weight is in permission mechanics: the sign-in flow gains `Mail.ReadWrite` while all existing read/sync paths keep today's scopes, so a pre-feature sign-in keeps syncing and only the new tool fails — with the spec's distinguishable reconnect errors classified by a write-scope/read-scope token-acquisition probe (research R2). A new `setEmailReadState` service orchestrates preflight + sequential per-message writes, bypassing `SyncCoordinator` entirely so no sync run is ever recorded. The spec's simulated mailbox is the existing `FakeMailProvider` seam, extended with a mutable read-state map and write/permission failure knobs. No schema change, no migration, no UI change.

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js ≥ 22 — matches existing repo toolchain

**Primary Dependencies**: `@modelcontextprotocol/sdk` (McpServer, `registerTool`), `zod` v4, Fastify app host, Drizzle ORM over better-sqlite3, `@azure/msal-node` (device-code + silent token acquisition), bare `fetch` against Microsoft Graph v1.0 (no Graph SDK, no new dependencies)

**Storage**: SQLite via Drizzle — existing `email_messages.is_read` boolean column is the only thing written; no schema change → no migration. Mailbox tokens stay in the existing MSAL file cache; granted-scope state is derived at call time, never persisted (research R2)

**Testing**: Vitest — new `tests/integration/mcp-mark-read-tools.test.ts` over real StreamableHTTP MCP client + stub identity provider + `FakeMailProvider` (pattern: `tests/integration/email-read-tools.test.ts`); extended `tests/unit/email-graph-provider.test.ts` (stubbed-fetch PATCH coverage) and `tests/unit/email-graph-auth.test.ts` (scope split, probe classification)

**Target Platform**: Self-hosted Docker (Linux), same as the deployed app; writes against Tyler's real Outlook mailbox via Microsoft Graph in production, against the fake provider in tests

**Project Type**: Web service + MCP server (single TypeScript project, `src/server`)

**Performance Goals**: N/A — single-user mailbox; ≤50 sequential Graph PATCHes per call (MSAL token cache makes per-message token reads in-memory)

**Constraints**: Mailbox-first ordering per message (store updates only after Graph accepts — FR-003); per-message autonomy with no rollback (FR-006); whole-call preflight failure with no outcomes when the mailbox can't take writes (FR-008); no `sync_runs` row and no `SyncCoordinator` involvement (FR-011); pre-feature sign-ins must keep syncing untouched (research R2); read/unread is the only mailbox write in the product (FR-007); existing `mcp-authentik-auth` flow gates the tool at the route layer — no new auth work

**Scale/Scope**: 1 new MCP tool, 1 new service module (`read-state.ts`), 2 interface extensions (`MailProvider`, `MailboxAuth`), `GraphMailProvider`/`FakeMailProvider`/`FakeMailboxAuth` extended, ~3 new/extended test files, 2 doc touch-ups (`docs/deploy.md`, `.env.example`); mailboxes hold thousands of messages but calls touch ≤50

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec Is the Source of Truth | PASS | PRD at `docs/product/features/mcp-mark-emails-read.md`; spec at `specs/022-mcp-mark-emails-read/spec.md` with checklist fully checked. The PRD sanctions the narrow exception to the "never modifies Outlook" rule (read state only, this tool only) |
| II. Test-First | PASS (planned) | Every task in tasks.md will follow red → green; integration tests over real MCP transport with the fake mailbox are the primary evidence |
| III. Evidence Over Assertion | PASS (planned) | MCP-only criteria → recorded automated-check output; the "after a page reload" web clauses (US1/US3) → `browser-tester` evidence in `docs/evidence/022-mcp-mark-emails-read/`; Tyler's real-mailbox pass covers SC-006; `verifier` agent confirms all |
| IV. Architecture Constraints | PASS | `@modelcontextprotocol/sdk` `registerTool` only; TypeScript; agents remain MCP consumers — the write path is a service the MCP tool calls, not an ingestion change; sync/ingestion code untouched; no schema change so no migration risk to production data |
| V. Small Vertical Slices, Trunk via PR | PASS | One branch, one PR, Conventional Commits |

**Post-Phase-1 re-check**: PASS — design introduces no new projects, no schema change, no new dependencies, and no constitution deviations. The one rule change (work-helper writing to Outlook) is a product-level exception the PRD and spec record explicitly; the constitution itself constrains architecture (ingestion path, SDK, TypeScript, Docker), none of which this design touches. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/022-mcp-mark-emails-read/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── mcp-tools.md     # Phase 1 output — set-email-read-state tool contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── services/email/
│   │   ├── graph-auth.ts        # split SCOPES into SIGN_IN/READ/WRITE sets; MailboxAuth.getWriteAccessToken()
│   │   │                        #   with probe classification; new MailWritePermissionError (research R2)
│   │   ├── provider.ts          # MailProvider gains verifyWriteAccess() + setMessageReadState() (research R3)
│   │   ├── graph-provider.ts    # widen authorizedFetch for PATCH; implement the two new members
│   │   ├── fake-provider.ts     # mutable read-state map; writeAccess/deleted/fail-write knobs; read accessor (research R8)
│   │   ├── fake-mailbox-auth.ts # (only if needed for unit-level auth scenarios; integration uses fake-provider knobs)
│   │   └── read-state.ts        # NEW — setEmailReadState(db, provider, messageIds, state): preflight + sequential loop (research R4)
│   ├── mcp/
│   │   └── tools.ts             # NEW tool set-email-read-state: hand-validated input, whole-call error mapping,
│   │                            #   outcome formatting (research R5–R7); McpToolsContext unchanged
│   └── index.ts                 # wire getWriteAccessToken closure into GraphMailProvider construction
├── client/                      # unchanged — Emails page already reflects stored state
└── shared/                      # unchanged

docs/
├── deploy.md                    # scope list gains Mail.ReadWrite + one-time reconnect note
└── (evidence/022-mcp-mark-emails-read/ at implementation time)
.env.example                     # scope mention updated

tests/
├── unit/
│   ├── email-graph-provider.test.ts  # extend: PATCH shape, 200/404/401/network mapping via stubbed fetch
│   └── email-graph-auth.test.ts      # extend: sign-in scopes, write-token acquisition, probe classification
└── integration/
    └── mcp-mark-read-tools.test.ts   # NEW: US1–US5 over real MCP client; asserts tool outcomes, MCP read tools,
                                      #   REST endpoints (web data source), fake-mailbox state, sync-run history
```

**Structure Decision**: Existing single-project layout; every change lives in `src/server/services/email/` and `src/server/mcp/tools.ts`. The tool stays thin over a new email write-service module (matching the `moveTask` layering precedent), the mailbox write sits behind the `MailProvider` interface so the established fake-provider test seam covers it, and the scope split is confined to `graph-auth.ts` so read/sync paths are provably untouched.

## Complexity Tracking

No constitution violations — table intentionally empty.
