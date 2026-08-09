# Quickstart: Move Task Between Lanes

**Feature**: `008-move-task-between-lanes` | Validation guide — proves the feature end-to-end. Contracts: [http-api.md](contracts/http-api.md), [mcp-tools.md](contracts/mcp-tools.md); model: [data-model.md](data-model.md).

## Prerequisites

- Node.js >= 22, dependencies installed (`npm ci` — the worktree SessionStart hook normally did this already).
- **Reset the dev database once after the schema change lands** (the Drizzle baseline is squashed per research.md R2, so an old dev DB will not migrate): `rm -f data/work-helper.db`. Test databases are `:memory:` and need nothing.

## Run

```bash
npm run dev
```

On this branch the port script derives: API at `http://localhost:3008`, UI at `http://localhost:5108` (Vite proxies `/api`). Open the UI in a desktop browser — drag requires a mouse.

## Automated checks

```bash
npm test
```

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all green. The suites covering this feature's criteria:

- `tests/integration/tasks.test.ts` — placement endpoint: lane move, within-lane reorder in both directions, exact-slot landing, index clamping, no-op same-slot drop, 404/400 cases, creation appends at bottom of first lane (FR-001–FR-004, FR-008).
- `tests/integration/board.test.ts` — `/api/board` returns `(position, id)` order per lane; arrangement survives because it *is* the persisted state (FR-005, FR-006).
- `tests/integration/mcp-read-tools.test.ts` — board arranged via the placement endpoint, then an authenticated in-process MCP client's `list-board` shows identical lane membership and order (FR-010, SC-005).
- `tests/component/board.test.ts` + unit tests — per-lane render order, drop-index computation (dragged card excluded — final-index semantics), optimistic move with serialized rapid-succession saves, failure revert + visible banner.
- `tests/component/task-detail.test.ts` — lane shown read-only, no control to change it (FR-009).

## Browser validation (browser-tester agent → `docs/evidence/move-task-between-lanes/`)

Run against the dev server above, on a fresh (reset) database, creating tasks through the UI form. Each scenario maps to a spec acceptance scenario or edge case; screenshot each end state and reload the page before asserting persistence.

1. **Lane move + persistence** (US1-S1): create "Follow up with Sam"; drag it from To Do into empty In Progress; assert it is in In Progress only; reload; assert again.
2. **Onward move** (US1-S2): drag the same card to Done; assert Done only; reload; assert again.
3. **Cancelled drag** (US1-S3): with To Do = ["Book venue", "Order catering"], drag "Book venue" and release over the page header/background; assert board unchanged.
4. **Save-failure revert** (edge case): with the board arranged, the orchestrating session stops the API process (e.g. `kill $(lsof -ti :3008)`) while the UI stays open — the browser-tester only drives the browser; drag any card to another lane; assert the failure banner appears; the orchestrator restarts the API, then reload and assert the card is back in its last saved lane/position (the unsaved move did not stick).
5. **Cross-lane exact placement** (US2-S1): drop "Draft Q3 goals" between "Write proposal" and "Review budget" in In Progress; assert order Write proposal / Draft Q3 goals / Review budget; reload; assert again.
6. **Within-lane reorder, upward** (US2-S2): drag "Send invites" above "Book venue" in To Do; assert order Send invites / Book venue / Order catering; reload; assert again.
7. **Within-lane reorder, downward** (FR-003/FR-004 edge): from scenario 6's To Do, drag "Send invites" down between "Book venue" and "Order catering"; assert order Book venue / Send invites / Order catering; reload; assert again.
8. **Creation appends** (US3-S1): with To Do arranged, create "Send invites"; assert it appears at the bottom of To Do.
9. **Read-only lane on detail** (US3-S2): move "Follow up with Sam" to Waiting; open its detail page; assert "Waiting" is displayed and no lane-changing control exists.
10. **MCP mirror** (US3-S3): with the board arranged as in scenarios 5–7, compare `curl http://localhost:3008/api/board` lane/order against the arranged UI, and rely on the `mcp-read-tools` integration test for the authenticated `list-board` equivalence (or connect an MCP client through the password gate as in `docs/evidence/mcp-server/` and call `list-board` directly).

Playwright note (research.md R4): drive drags with `browser_drag` / `locator.dragTo` (Chromium supports HTML5 DnD from mouse-driven drags); if a between-cards drop needs finer targeting, fall back to `page.dragAndDrop` with `targetPosition` or dispatched `DragEvent`s, and record which mechanism produced the evidence.

## Done when

Every acceptance scenario above has a passing automated check **and** browser evidence, independently confirmed by the `verifier` agent — then PR per the constitution.
