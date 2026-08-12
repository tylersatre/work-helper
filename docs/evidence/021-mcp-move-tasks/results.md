# 021-mcp-move-tasks Evidence

Evidence directory: `docs/evidence/021-mcp-move-tasks/`. This slice's automated-check evidence (unit/integration tests against `moveTask`/`createTask` in `src/server/services/tasks.ts` and the `move-task`/`create-task` MCP tools, covering US1-US4 and FR-001-FR-014 including validation and no-partial-effect guarantees) is recorded separately per the project's Definition of Done. This document covers the browser-visibility half of the Definition of Done -- SC-004 ("every board change made through the MCP survives a web app page reload -- no divergence between what agents see through tools and what Tyler sees on the board") -- by driving the live web board against a dev database that was pre-seeded with the exact writes the MCP tools would have produced.

## Methodology note

The MCP transport requires an Authentik OAuth flow not configured in this local dev environment. The two writes under test were performed by directly invoking `moveTask` and `createTask` in `src/server/services/tasks.ts` -- the identical service functions the `move-task` and `create-task` MCP tools call -- against the same SQLite file (`./data/work-helper.db`) the running dev server reads. This is functionally equivalent to the MCP tool having made the call: the web app has no way to distinguish how a row was written, it only reads via `GET /api/board`. This document verifies what the web board displays and persists as a result.

Dev server: API `http://localhost:3021`, UI `http://localhost:5121`. Driven live via Playwright MCP against the running dev server.

Board seeded state prior to this session (confirmed via `GET /api/board` before starting, per the task brief): To Do = [Write proposal, Review budget, Chase invoice]; In Progress = [Follow up with Sam]; Waiting = [Confirm venue hold]; Done = [] -- the result of two prior MCP-tool-equivalent actions on an initial 4-card board:

1. A `move-task` call moving "Follow up with Sam" from To Do to In Progress with no position (US1-AS1: lands at the bottom of the destination lane).
2. A `create-task` call with an explicit `lane: "Waiting"` creating "Confirm venue hold" directly in Waiting (US3-AS1: lane-aware creation, bottom of the chosen lane, no drag and no UI lane picker involved).

## Results

| # | Scenario | Result | Screenshot(s) |
| --- | --- | --- | --- |
| 1 | Navigate to board, capture initial state | PASS | 01-initial-state.png |
| 2 | "Follow up with Sam" appears in In Progress (not To Do), only card in that lane | PASS | 01-initial-state.png |
| 3 | "Confirm venue hold" appears in Waiting | PASS | 01-initial-state.png |
| 4 | Write proposal / Review budget / Chase invoice undisturbed, still in To Do in original relative order | PASS | 01-initial-state.png |
| 5 | Page reload -- all of the above still holds (proves server/DB-backed state, not client-only) | PASS | 02-after-reload.png |
| 6 | Final screenshot after reload showing all four lanes | PASS | 02-after-reload.png |

## Narrative

Navigated to `http://localhost:5121`. The board rendered four lanes:

- **To Do**: Write proposal, Review budget, Chase invoice (top to bottom) -- the exact original order, no disturbance from either MCP-equivalent write.
- **In Progress**: Follow up with Sam -- the sole card in the lane, confirming the move landed it in In Progress and nowhere else (it does not appear in To Do). Since In Progress has only one card after the move, "bottom-most" is trivially satisfied -- there was nothing else in the lane for it to land below.
- **Waiting**: Confirm venue hold -- present and the only card in the lane, confirming the lane-aware create landed the card in Waiting, not the default lane (To Do), and that nothing else was added to Waiting alongside it.
- **Done**: empty ("No tasks" empty-state shown) -- unchanged from the seed.

Accessibility snapshot at this point (`01-initial-state.png`) matched exactly.

Reloaded the page with a full navigation to `http://localhost:5121` (a fresh navigation, not an SPA route change, so any client-only or cached state would not survive). Took a fresh accessibility snapshot and it was identical to the pre-reload snapshot: To Do still [Write proposal, Review budget, Chase invoice], In Progress still [Follow up with Sam], Waiting still [Confirm venue hold], Done still empty. This confirms the board state is being read fresh from the server/DB via `GET /api/board` on every load, not held in client-side-only state -- satisfying SC-004 and FR-012 ("Every lane or position change made through the MCP MUST be reflected identically in the board-listing tool and in the web app board (after a page reload), and MUST persist across reloads").

Screenshot `02-after-reload.png` shows the final state of all four lanes post-reload.

## Summary

All six checks in the task brief pass. The web board correctly displays both MCP-tool-equivalent writes -- the no-position move of "Follow up with Sam" into In Progress (US1-AS1) and the lane-aware creation of "Confirm venue hold" directly into Waiting (US3-AS1) -- with no disturbance to the other three To Do cards' order, and both changes persist identically across a full page reload, which is the SC-004 evidence this feature's Definition of Done requires for its UI-facing surface.
