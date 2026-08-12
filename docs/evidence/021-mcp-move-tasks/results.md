# 021-mcp-move-tasks Evidence

Evidence directory: `docs/evidence/021-mcp-move-tasks/`.

## Methodology note (redo)

This is a redo of a prior evidence capture that was rejected because the seeded board only ever had one card in each destination lane, so "lands at the bottom of the lane" was never actually demonstrated, and no precise-positioning (US2) scenario was captured. This attempt fixes both problems: every destination lane below has multiple cards before the demonstrated action, and it covers a precise cross-lane position, a within-lane reorder, a no-position bottom-placement into a non-empty lane, and a lane-aware create into a non-empty lane.

Because the MCP transport requires an Authentik OAuth flow not configured in this local dev environment, the writes under test were performed by directly invoking `moveTask`/`createTask` in `src/server/services/tasks.ts` — the identical service functions the `move-task`/`create-task` MCP tools call — against the same SQLite file the running dev server (UI http://localhost:5121, API http://localhost:3021) reads. The web app has no way to distinguish how a row was written; it only ever reads via `GET /api/board`. The full MCP protocol path (auth, transport, 1-based-to-0-based mapping, error formatting) is independently covered by `tests/integration/mcp-move-tools.test.ts`'s real MCP-client integration tests. This evidence's job is specifically to prove the web board renders and PERSISTS (survives reload) what those tools produce.

Four MCP-equivalent actions were applied, in order, before this capture began:

1. **`move-task` cross-lane to explicit position 2** (US2-AS1): "Draft Q3 goals" moved from To Do to In Progress at position 2 — landed between "Write proposal" and "Review budget", not at the end.
2. **`move-task` within-lane reorder to position 1** (US2-AS2): "Send invites" moved within To Do to position 1 — jumped to the top of To Do.
3. **`move-task` with no position given** (US1-AS1): "Order catering" moved from To Do to In Progress with no position — landed at the bottom of In Progress, which by that point already held 3 other cards (Write proposal, Draft Q3 goals, Review budget).
4. **`create-task` with an explicit lane** (US3-AS1): "Confirm venue hold" created directly in Waiting, which already held 2 cards (Await contract, Ping vendor) — landed at the bottom (3rd/last).

## Board state driven live via Playwright against http://localhost:5121

| Scenario | Result | Screenshot(s) |
| --- | --- | --- |
| US2-AS2: within-lane reorder — "Send invites" is first in To Do | PASS | 01-initial-state.png, 02-after-reload.png |
| US2-AS1: cross-lane precise position — "Draft Q3 goals" is 2nd in In Progress, between "Write proposal" and "Review budget" | PASS | 01-initial-state.png, 02-after-reload.png |
| US1-AS1: no-position move lands at bottom of a populated lane — "Order catering" is 4th/last in In Progress, below 3 other cards | PASS | 01-initial-state.png, 02-after-reload.png |
| US3-AS1: lane-aware create lands at bottom of a populated lane — "Confirm venue hold" is 3rd/last in Waiting, below 2 pre-existing cards, and not in To Do | PASS | 01-initial-state.png, 02-after-reload.png |
| Done lane remains empty | PASS | 01-initial-state.png, 02-after-reload.png |
| FR-012/SC-004: state persists across a full page reload (not just SPA client state) | PASS | 02-after-reload.png |

## Narrative

Navigated to `http://localhost:5121` (a fresh, full navigation). The board rendered with four lanes:

- **To Do**: Send invites, Book venue
- **In Progress**: Write proposal, Draft Q3 goals, Review budget, Order catering
- **Waiting**: Await contract, Ping vendor, Confirm venue hold
- **Done**: No tasks

This matches the expected board state exactly, in the exact order specified:

- "Send invites" is the first card in To Do, confirming the within-lane reorder-to-position-1 (US2-AS2) landed correctly — it jumped to the top ahead of "Book venue".
- In In Progress, "Draft Q3 goals" sits as the 2nd card, sandwiched between "Write proposal" (1st) and "Review budget" (3rd), confirming the cross-lane move to an explicit mid-lane position (US2-AS1) landed precisely rather than at either end. "Order catering" sits as the 4th and last card in this same lane, below the three other cards, confirming the no-position move (US1-AS1) landed at the bottom of a lane that was already populated — not the trivial single-card case the prior evidence attempt mistakenly relied on.
- In Waiting, "Confirm venue hold" is the 3rd and last card, below the two pre-existing cards "Await contract" and "Ping vendor", confirming the lane-aware create (US3-AS1) landed at the bottom of a populated destination lane rather than in the default To Do lane or at the top of Waiting.
- Done remained empty throughout, confirming none of the four actions touched a lane they weren't targeted at.

Screenshot `01-initial-state.png` captures this state.

The page was then reloaded via a full navigation (`page.goto`, not an SPA route change) back to `http://localhost:5121`. A fresh accessibility snapshot was taken and every lane's card order was re-verified to be byte-for-byte identical to the pre-reload state: To Do = [Send invites, Book venue], In Progress = [Write proposal, Draft Q3 goals, Review budget, Order catering], Waiting = [Await contract, Ping vendor, Confirm venue hold], Done = empty. This is the critical persistence check (FR-012, SC-004) proving the board state is server/DB-backed rather than held only in client-side state — a hard reload discards all client state, and the identical ordering came back from the server. Screenshot `02-after-reload.png` captures this post-reload state.

## Summary

All demonstrated scenarios pass. Every destination lane involved in the four MCP-equivalent actions had multiple pre-existing cards before the action under test, closing the gap the prior evidence attempt was rejected for. The precise cross-lane position (US2-AS1), the within-lane reorder (US2-AS2), the no-position bottom-placement into a populated lane (US1-AS1), and the lane-aware create into a populated lane (US3-AS1) are all independently visible in the rendered board, and every one of them survives a full page reload, confirming server-side persistence rather than client-only state.
