# Browser Evidence: Move Task from Detail View

Walked against the running dev server (UI http://localhost:5123, API http://localhost:3023, feature branch `023-move-task-detail-view`) per quickstart.md's manual scenario. All 8 steps passed.

Setup: created "Follow up with Sam" (task id 1) via the board, landing in "To Do". Created "Dummy Card A" (id 2) and "Dummy Card B" (id 3) and moved both into "In Progress" via the detail-view pills, to set up a non-empty destination lane for the bottom-of-lane check.

1. **Create card lands in "To Do"** — PASS. Board snapshot right after creation showed the card under "To Do".
2. **Pill row, no header, "To Do" current (Scenario 1)** — PASS. [02-pill-row-initial-todo-current.png](02-pill-row-initial-todo-current.png). Four pills (To Do, In Progress, Waiting, Done) directly under the title, no section header, "To Do" blue-tinted and disabled.
3. **Click "In Progress" moves immediately, no dialog (Scenario 2)** — PASS. [03-after-click-in-progress.png](03-after-click-in-progress.png). No confirmation dialog; the pill row updates immediately so "In Progress" is disabled/current and "To Do" is enabled.
4. **Reload persists the move (Scenario 2, FR-006)** — PASS. [04-after-reload-persisted.png](04-after-reload-persisted.png). A full navigation reload of `/tasks/1` still shows "In Progress" as current, confirming the move was saved server-side.
5. **Board reflects move, bottom-of-lane landing (Scenario 3, FR-004)** — PASS. [05-board-in-progress-bottom-of-lane.png](05-board-in-progress-bottom-of-lane.png). "In Progress" lane order: Dummy Card A, Dummy Card B, Follow up with Sam.
6. **Clicking the current pill is a no-op (Scenario 4, FR-002)** — PASS. [06-click-current-pill-noop.png](06-click-current-pill-noop.png). The "In Progress" pill is a genuinely disabled `<button>` — a click attempt on it does not register (the element is non-interactive), and no new network request fires. State stays unchanged.
7. **Click "Done" directly, skipping "Waiting" (Scenario 5, FR-007)** — PASS. [07-after-click-done.png](07-after-click-done.png). "Done" becomes current/disabled; "Waiting" (never visited) remains a normal clickable pill.
8. **Move into a lane confirmed empty beforehand (edge case 1)** — PASS. [08a-board-before-move-to-waiting-empty.png](08a-board-before-move-to-waiting-empty.png) confirms "Waiting" showed no tasks while the card was in "Done". After clicking "Waiting" from the detail view, [08b-board-after-move-to-waiting-alone.png](08b-board-after-move-to-waiting-alone.png) shows "Follow up with Sam" alone in "Waiting".

**Overall: 8/8 PASS.** No functional deviations observed.
