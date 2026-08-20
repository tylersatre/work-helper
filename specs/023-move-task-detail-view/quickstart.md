# Quickstart Validation: Move Task from Detail View

Runnable checks proving the feature end-to-end. Contract: [contracts/http-api.md](contracts/http-api.md); shapes: [data-model.md](data-model.md).

## Prerequisites

- Node >= 22, dependencies installed (`npm install` — the worktree SessionStart hook normally handles this).
- No mailbox connection needed — this feature touches only tasks/lanes.

## Full gate (what the Stop hook runs)

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

Expected: all pass; `npm test` includes the new/modified suites below.

## Targeted automated checks

HTTP surface — `GET /api/tasks/:id` returns `lanes` in configured order; a placement move made the way the pill row makes it (`{ lane, index: Number.MAX_SAFE_INTEGER }`) lands at the bottom of the destination lane and is visible through the existing MCP `list-board` tool with no discrepancy (User Story 2; FR-004, FR-006, FR-008, FR-009):

```bash
npx vitest run tests/integration/task-detail-lane-move.test.ts
```

Existing placement behavior, unchanged — re-run to confirm the reused endpoint's bottom-of-lane clamp still holds (FR-004):

```bash
npx vitest run tests/integration/tasks.test.ts
```

UI — pill row renders all configured lanes in order under the title with no section header, current lane is marked and non-interactive, clicking another pill moves the card immediately with no confirmation, the pill row updates from the response, concurrent clicks are serialized and settle on the last-clicked lane, and a failed move leaves the last-saved lane displayed with an inline error (User Story 1; FR-001–FR-003, FR-005, FR-007; edge cases 1–3):

```bash
npx vitest run tests/component/task-detail.test.ts
```

## Manual / browser validation (browser-tester evidence)

Start the dev server (feature 023 → API 3023, UI 5123):

```bash
npm run dev
```

Scenario walk (mirrors the spec's acceptance scenarios; evidence lands in `docs/evidence/023-move-task-detail-view/`):

1. Create a card "Follow up with Sam" (board UI or `create-task`) — it lands in the first configured lane (To Do).
2. Open `http://localhost:5123/tasks/<id>` — directly under the title, see four pills (To Do, In Progress, Waiting, Done) in that order, "To Do" visually marked current, no section header above them (Scenario 1).
3. Click "In Progress" — the card moves immediately, no confirmation dialog; the pill row updates so "In Progress" is marked current and "To Do" is not; reload the page and confirm the same state persists (Scenario 2, FR-006).
4. On the board, confirm "Follow up with Sam" is at the bottom of In Progress under any existing cards, matching drag-and-drop's default landing spot (Scenario 3, FR-004).
5. Click the current pill ("In Progress") — confirm nothing changes: no request fires, the card stays in place, the pill row is unchanged (Scenario 4, FR-002).
6. From Waiting, click "Done" directly — confirm the card lands in Done, skipping In Progress in one click (Scenario 5, FR-007).
7. Click a pill for a currently-empty lane — confirm the card moves there and appears alone (edge case 1).
8. As an authorized MCP client, call `list-board` after a detail-view move and confirm the card appears under its new lane with no discrepancy from the UI (User Story 2 scenario 1).

Expected outcome: every acceptance scenario in [spec.md](spec.md) passes; the User Story 1 criteria carry browser-tester screenshots, User Story 2's criteria carry recorded HTTP/MCP test output, both independently confirmed by the verifier agent.
