# Quickstart: Suppress Address

How to validate this feature end-to-end once implemented — automated checks are the primary (and, per the spec's Assumptions, only) evidence surface, since this feature is MCP-only with no UI change.

## Prerequisites

- Dependencies installed (`npm install` — already done automatically in this worktree by the SessionStart hook).
- This feature is backend/MCP-only; no client build step or browser evidence is required (spec Assumptions: "No web UI surface is introduced or changed by this feature").

## 1. Automated checks (primary and sole evidence)

All three tools get exercised through a real `@modelcontextprotocol/sdk` client over the same OAuth-approval flow every other MCP integration test uses — see `tests/integration/mcp-unlinked-addresses.test.ts` and `tests/integration/mcp-people-write-tools.test.ts` for the established pattern (in-memory SQLite via `createDb(':memory:')`, `buildApp({...})`, `connectThroughApproval(...)` against a `startStubIdentityProvider()`, `FakeMailProvider`/`FakeCalendarProvider` to seed synced participant data).

```bash
# Run just this feature's new integration test file once /speckit-tasks creates it
npx vitest run tests/integration/mcp-suppress-address.test.ts

# Run the full suite (lint/typecheck/test/build all run in the Stop-hook verification gate)
npm run lint
npm run typecheck
npm test
npm run build
```

Each acceptance scenario in `spec.md` should map to one or more `it(...)` blocks in the new test file, calling `client.callTool({ name, arguments })` and asserting on both the tool's `structuredContent`/error, and a follow-up read (`list-unlinked-addresses` or `list-suppressed-addresses`) to confirm the effect persisted — mirroring how `mcp-unlinked-addresses.test.ts` seeds mail/calendar data via the fake providers and re-reads state after a mutation.

**Minimum coverage expected** (one scenario per FR, not exhaustive — `/speckit-tasks` will break this down further):
- `suppress-address`: removes a seen-and-unlinked address from `list-unlinked-addresses` on the next call; a second suppress call is a no-op that preserves the original `suppressedAt`; never-seen address rejected; linked address rejected with the linked person's name in the error; case-insensitive match (e.g. suppress `NEWS@Example.com`, seeded as `news@example.com`).
- `list-suppressed-addresses`: reflects a suppression immediately; orders multiple suppressions most-recent-first.
- `unsuppress-address`: clears the flag, address reappears in `list-unlinked-addresses` and drops from `list-suppressed-addresses`; calling it on a never-suppressed or unknown address succeeds as a no-op (`wasSuppressed: false`), no error.
- Auto-clear-on-link: suppress an address, then link it via `create-person` (and separately via `add-contact-entry` on an existing person) — confirm it drops from `list-suppressed-addresses` immediately as part of that same call's effect, with no separate `unsuppress-address` call.
- No-reactivation: suppress → link (clears flag) → unlink again (via `remove-contact-entry`) → confirm the address reappears in `list-unlinked-addresses` as an ordinary, non-suppressed entry (not back in `list-suppressed-addresses`).
- `list-unlinked-addresses` unaffected surfaces: confirm a suppressed address still appears normally in whatever read tool surfaces raw message/participant data (e.g. `get-conversation`/`list-conversations`), per FR-012.

## Expected outcome

- All acceptance scenarios in `spec.md` (User Stories 1–4) pass as automated integration-test assertions.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass clean — the same gate the Stop hook runs.
- No `docs/evidence/028-suppress-address/` browser-tester screenshots are expected or required — every acceptance criterion in this feature is reachable only through MCP tools (Constitution Principle III: "recorded output of automated checks... for criteria reachable only through APIs or MCP tools").
