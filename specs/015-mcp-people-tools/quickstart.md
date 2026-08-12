# Quickstart: MCP People Tools

**Feature**: 015-mcp-people-tools | Validation guide — proves the feature end-to-end. Contracts in [contracts/mcp-tools.md](contracts/mcp-tools.md), shapes in [data-model.md](data-model.md), decisions in [research.md](research.md).

## Prerequisites

- Node.js >= 22; dependencies installed (the worktree SessionStart hook runs the install; otherwise `npm install`).
- No migration to apply — this feature ships no schema change. `config/person-fields.json` (already present, `["Nickname"]`) is the field configuration the unknown-field rejection validates against.

## Primary validation: automated checks

Feature-focused suites (each acceptance scenario maps to a named test; tests drive the real MCP client over StreamableHTTP against the real app on in-memory SQLite):

```bash
npx vitest run tests/integration/mcp-people-write-tools.test.ts tests/integration/mcp-unlinked-addresses.test.ts tests/integration/mcp-read-tools.test.ts tests/integration/people.test.ts tests/integration/contact-entries.test.ts
```

Expected: all pass. Coverage by user story — US1 create (incl. synced-address linking, case-insensitive duplicate with holder name, whitespace name, unknown field) and US3/US4 write flows in `mcp-people-write-tools.test.ts`; US2 discovery content/ordering/link-reactivity in `mcp-unlinked-addresses.test.ts`; US5 full-lists-on-get-person plus unchanged search rows in `mcp-read-tools.test.ts`; conflict-holder enrichment at the service seam in `people.test.ts` / `contact-entries.test.ts`. The auth edge case (tokenless call reaches no tool, reads/changes nothing) is asserted in the new MCP suites on top of the shipped `mcp-connect` / `mcp-forged-identity` / `mcp-revocation` coverage.

Full verification gate (what the Stop hook runs):

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: all four green; the recorded output is the automated-check evidence for MCP-only criteria.

## Browser evidence (UI-surface criteria)

The `browser-tester` agent produces screenshot + results evidence under `docs/evidence/mcp-people-tools/` against the dev server:

```bash
npm run dev
```

(Feature 015 ports: API http://localhost:3015, UI http://localhost:5115.) Scenarios needing browser confirmation, after the corresponding MCP call is made by the test driver: agent-created person listed on the People page and their record showing email/phone (primary-marked) and extra fields — still true after a reload (US1, SC-001, FR-014); conversation detail showing a linked address attributed to the new person (US1-AS2); contact-list state after add / mark-primary / remove sequences surviving reload (US3, SC-005); edited name/field on People page and record after reload (US4).

## Manual smoke (optional)

With a dev server running and an MCP client authenticated per the mcp-authentik-auth flow (e.g. MCP Inspector pointed at `http://localhost:3015/mcp`): `list-unlinked-addresses` → pick an address → `create-person` with it → `get-person` shows full contact lists → `emails-for-person` returns its mail → `list-unlinked-addresses` no longer lists it. That sequence is SC-003's sweep in miniature. Tyler's acceptance pass is the same loop with a real agent against the deployed server and real mail.

## Expected outcomes checklist

- [ ] Every acceptance scenario in [spec.md](spec.md) has a passing named automated check.
- [ ] Verification gate (lint, typecheck, test, build) green.
- [ ] Browser evidence recorded for the UI-surface criteria above; verifier independently confirms both evidence kinds.
- [ ] `search-people` output and all REST/UI behavior demonstrably unchanged (existing suites stay green untouched).
