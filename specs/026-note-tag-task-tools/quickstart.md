# Quickstart: MCP Note, Tag & Task Tools

How to validate this feature end-to-end once implemented — automated checks, then a manual walkthrough covering the UI-visible surfaces automated MCP tests can't see.

## Prerequisites

- Dependencies installed (`npm install` — already done automatically in this worktree by the SessionStart hook).
- This feature is backend/MCP-only; no client build step is required to run the automated tests.

## 1. Automated checks (primary evidence)

All nine tools (eight write + `list-tags`) get exercised through a real `@modelcontextprotocol/sdk` client over the same OAuth-approval flow every other MCP integration test uses — see `tests/integration/mcp-read-tools.test.ts` and `tests/integration/mcp-move-tools.test.ts` for the established pattern (in-memory SQLite via `createDb(':memory:')`, `buildApp({...})`, `connectThroughApproval(...)` against a `startStubIdentityProvider()`).

```bash
# Run just this feature's new integration test file once /speckit-tasks creates it
npx vitest run tests/integration/mcp-note-tag-task-tools.test.ts

# Run the full suite (lint/typecheck/test/build all run in the Stop-hook verification gate)
npm run lint
npm run typecheck
npm test
npm run build
```

Each acceptance scenario in `spec.md` should map to one or more `it(...)` blocks in the new test file, calling `client.callTool({ name, arguments })` and asserting on both the tool's `structuredContent`/error, and a follow-up read (`get-task`, `get-person`, or the new `list-tags`) to confirm the effect persisted — mirroring how `mcp-move-tools.test.ts` re-reads state after a mutation.

**Minimum coverage expected** (one scenario per FR, not exhaustive — `/speckit-tasks` will break this down further):
- `delete-note`: deletes the right note, leaves others; unknown note id → `note-not-found`.
- `update-task`: renames title, reflected in `get-task`; empty/whitespace title and unknown task id all rejected.
- `create-tag`: creates with given or auto-assigned color; duplicate name (any case) and empty name rejected.
- `rename-tag` / `recolor-tag`: work by id and by name; empty name rejected on rename; invalid color rejected on recolor.
- `delete-tag`: reports correct `peopleDetached`/`tasksDetached` counts; detaches everywhere; second delete of the same name → not-found.
- `attach-tag` / `detach-tag`: work by id and by name, on both a task and a person; unknown tag name never auto-creates; unknown record id rejected; re-attaching is a no-op; detach never deletes the tag or affects other records' attachments.
- `list-tags`: reflects every create/rename/recolor/delete immediately.

## 2. Manual / browser evidence (UI-visible surfaces)

Several effects are triggered via MCP but must be confirmed in the running app, since FR-020 requires identical visibility on the kanban board, task/person detail views, and the Tags page.

```bash
npm run dev   # starts the Fastify API + Vite dev server on this branch's derived ports
```

1. Seed a task with two notes and a tag via the UI (or via `app.inject`-style API calls, as the automated tests do).
2. Call the new MCP tools directly against the running dev server — either via an MCP-capable client (Claude Code itself, once connected to this instance's `/mcp` endpoint through the OAuth approval flow) or by adapting the integration-test harness into a one-off script.
3. After each call, reload the relevant page and confirm:
   - `delete-note` → the note is gone from the task's detail view.
   - `update-task` → the new title shows on the board card and the detail view.
   - `create-tag`/`rename-tag`/`recolor-tag`/`delete-tag` → the Tags page and every task/person detail view carrying that tag reflect the change (or its removal).
   - `attach-tag`/`detach-tag` → the chip appears/disappears on the specific task or person detail view, and nowhere else it shouldn't.

This manual pass is what the `browser-tester` agent automates and captures as screenshot evidence under `docs/evidence/026-note-tag-task-tools/` per the project's Definition of Done.

## Expected outcome

- All acceptance scenarios in `spec.md` (User Stories 1–4) pass as automated integration-test assertions.
- The `browser-tester` agent's evidence shows every UI-visible surface named in FR-020 reflecting each tool's effect, both immediately and after a reload.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass clean — the same gate the Stop hook runs.
