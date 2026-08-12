# Quickstart Validation: MCP Move Tasks

Runnable checks that prove the feature works end-to-end. Contracts: [contracts/mcp-tools.md](contracts/mcp-tools.md); entity/positioning rules: [data-model.md](data-model.md).

## Prerequisites

- Dependencies installed (`npm install` — the worktree SessionStart hook normally does this).
- No schema change in this feature, so no migration steps.

## 1. Automated suite (primary evidence for MCP-only criteria)

```bash
npm test
```

Expected: all suites green, including the new `tests/integration/mcp-move-tools.test.ts` (move scenarios US1/US2/US4 over a real MCP client) and the extended create-task lane coverage. The full gate is:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## 2. Targeted integration runs

```bash
npx vitest run tests/integration/mcp-move-tools.test.ts
```

Expected outcomes pinned by the tests (each asserts through **both** the `list-board` MCP tool and `GET /api/board`, the web app's data source — FR-012):

- Move with no position → card at bottom of destination lane, gone from source (US1-AS1).
- Move to position 2 cross-lane, position 1 within-lane → exact expected orders (US2-AS1/AS2).
- Move to position 10 in a 3-card lane → success, card at bottom, response's `landedPosition` = 3 (US2-AS3).
- Unknown lane "Doing" on move and create → `isError` with message naming `To Do, In Progress, Waiting, Done`; board byte-identical (US4-AS1/AS3).
- Unknown `taskId` on move → `Task <id> not found`; board unchanged (US4-AS2).
- `create-task` with `lane: "Waiting"` → bottom of Waiting; without `lane` → bottom of first lane, unchanged from today (US3-AS1/AS2).
- Within-lane move to current position → success, order unchanged, reported position unchanged (edge case).
- Position 0 / negative / non-integer → rejected at the tool boundary, board unchanged (edge case).

## 3. Manual smoke via dev server + MCP client (optional)

```bash
npm run dev
```

Branch prefix 021 → API on port 3021, UI on 5121. Connect any MCP client through the Authentik auth flow, then:

1. Call `list-board` — note a card id and the lane orders.
2. Call `move-task` with that `taskId`, `lane: "In Progress"`, no position → response reports the landing position; `list-board` shows the card at the bottom of In Progress.
3. Reload the web board at `http://localhost:5121` — same order visible (SC-004).
4. Call `create-task` with `lane: "Waiting"` → card appears at the bottom of Waiting in both surfaces.
5. Call `move-task` with `lane: "Doing"` → error names the four valid lanes; board unchanged.

## 4. Browser evidence (Definition of Done)

The web-app-visibility clauses (the "after a page reload" parts of US1–US3, SC-004) additionally require `browser-tester` agent evidence stored in `docs/evidence/021-mcp-move-tasks/`, independently confirmed by the `verifier` agent, before the feature is reported done.
