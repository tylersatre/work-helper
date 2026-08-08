# Move Task Between Lanes — User Story 1, 2 & 3 Evidence

Feature: move-task-between-lanes
UI: http://localhost:5108
API: http://localhost:3008
Date: 2026-08-08

# User Story 1 ("Move a card to another lane")

## Scenario 1 (US1-S1, lane move + persistence)

Given: a fresh empty board. When: a task "Follow up with Sam" is created via the create-task form. Then: it lands in "To Do". When it is then dragged from "To Do" into the empty "In Progress" lane, Then: it appears in "In Progress" and nowhere else, and this survives a full page reload.

Result: PASS

Observed: Created "Follow up with Sam" via the Title field + "Add task" button; it appeared in "To Do" only. Dragged the card from "To Do" to "In Progress" using Playwright MCP's `browser_drag` tool (implemented via `locator.dragTo()`, a native HTML5 drag-and-drop sequence). It worked on the first attempt — no retries or intermediate hover steps were needed. Accessibility-tree snapshot after the drag confirmed the card was present in the "In Progress" list and absent from To Do, Waiting, and Done. The page was then reloaded via a full navigation (`page.goto`); a fresh snapshot confirmed the card was still in "In Progress" only, confirming persistence.

Screenshots: us1-scenario1-after-drag.png, us1-scenario1-after-reload.png

## Scenario 2 (US1-S2, onward move)

Given: the card is in "In Progress". When: it is dragged to "Done". Then: it appears in "Done" and nowhere else, and this survives a reload.

Result: PASS

Observed: Dragged "Follow up with Sam" from "In Progress" to "Done" using the same `browser_drag` (dragTo) mechanism; it worked on the first attempt. Snapshot after the drag confirmed the card was in "Done" only (To Do, In Progress, and Waiting all empty). Reloaded the page (full navigation); snapshot confirmed the card remained in "Done" only, confirming persistence.

Screenshots: us1-scenario2-after-drag.png, us1-scenario2-after-reload.png

## Scenario 3 (US1-S3, cancelled drag)

Given: "Book venue" and "Order catering" are added, in that order, to "To Do" via the create-task form. When: a drag of "Book venue" is started but released over the page header (not over any lane / `[data-testid="lane"]` element). Then: the board is completely unchanged — To Do is still ["Book venue", "Order catering"] in that order, and no other lane changed.

Result: PASS

Observed: Created "Book venue" then "Order catering" via the form; snapshot confirmed To Do = ["Book venue", "Order catering"] in that order, Done still held "Follow up with Sam", and In Progress/Waiting were empty. A baseline screenshot was taken before the cancelled-drag test. A drag of "Book venue" was then performed with the drop target set to the "work-helper" `<h1>` heading at the top of the page (outside all lanes), using `browser_drag` (dragTo). The post-drag snapshot and screenshot confirmed the board was completely unchanged: To Do = ["Book venue", "Order catering"] in the exact original order, Done = ["Follow up with Sam"], In Progress and Waiting still empty. The drop over the header did not move or reorder anything.

Screenshots: us1-scenario3-baseline.png, us1-scenario3-after-cancelled-drag.png

## Scenario 4 (US1-S4, save-failure revert)

Given: the board is showing To Do = ["Book venue", "Order catering"], Done = ["Follow up with Sam"], In Progress/Waiting empty, and the dev API server (http://localhost:3008) has been stopped (deliberately, to simulate a save failure). When: "Order catering" is dragged from "To Do" into "Waiting" (no reload beforehand). Then: because the API is unreachable, the save request should fail, a visible error banner should appear, and the board should end up back at its last-saved arrangement. Then, once the API is restarted and the page is reloaded, the board should show the last-saved arrangement (i.e. the failed/unsaved move did not stick).

Result: PASS

Observed (API down, before restart):
- Dragged "Order catering" from "To Do" to "Waiting" using `browser_drag` (dragTo); worked on the first attempt as before.
- A visible error banner appeared with the exact text: "Couldn't save that move — the board has been restored." with a "Dismiss" button.
- Browser console recorded two errors confirming the underlying failure: `502 Bad Gateway` on `http://localhost:5108/api/tasks/3/placement` and on `http://localhost:5108/api/board` — i.e. not only did the placement save fail, but the app's own attempt to refetch/re-sync the board state (to actually perform the visual "restore" the banner promised) also failed against the down API.
- Because of that second failure, the board did NOT visually revert at the time of the screenshot: "Order catering" remained shown in the "Waiting" lane and "To Do" showed only "Book venue", even though the banner text asserted the board had been restored. This matches the documented behavior that "if the refetch itself fails, the banner still shows and the board re-syncs on the next successful load" — the optimistic move stayed on screen, unreconciled, until a later successful load could correct it. No reload, retry, or tab close was performed at this point per instructions.

Observed (after API restart + full page reload):
- Once the coordinator confirmed the API was reachable again (same dev database, containing whatever was last actually saved), the page was reloaded via a full navigation (`page.goto`).
- Snapshot after reload confirmed the board re-synced to the last saved arrangement: To Do = ["Book venue", "Order catering"], In Progress = [], Waiting = [], Done = ["Follow up with Sam"]. The failed/unsaved "Waiting" move from the outage did not persist — "Order catering" is back in "To Do", not in "Waiting". This confirms the server-side placement was never actually persisted during the outage, and the client correctly re-synced to server truth on the next successful load.

Screenshots: us1-scenario4-failure-banner.png, us1-scenario4-after-restart-reload.png

## User Story 1 Summary

All four US1 scenarios PASS.

- Scenario 1: lane move + persistence — PASS
- Scenario 2: onward move + persistence — PASS
- Scenario 3: cancelled/off-lane drag leaves board unchanged — PASS
- Scenario 4: save-failure shows an error banner and, after the API recovers and the page reloads, the board re-syncs to the last successfully saved arrangement (the failed move does not stick) — PASS, with one behavioral note: while the API was still fully down, the banner's claim that "the board has been restored" was not immediately reflected visually, because the app's own restore/refetch call also failed (502) against the down API. The eventual re-sync only happened once the API was back up and the page was reloaded, which is consistent with the documented fallback behavior for this edge case.

The HTML5 drag-and-drop driving mechanism that worked consistently for every drag across all four US1 scenarios (successful lane-to-lane moves, the cancelled/off-lane drop, and the failed-save drop) was Playwright MCP's `mcp__playwright__browser_drag` tool, which under the hood invokes Playwright's `locator.dragTo(target)`. No fallback to manually dispatched DragEvents or slow/intermediate-hover drags was ever necessary — every drag succeeded on the first attempt.

# User Story 2 ("Place a card exactly where it is dropped")

Client-side drag code was updated before this testing round to add exact drop-index computation plus a visual drop indicator during dragover. Board state at the start of US2 testing (confirmed by reload): To Do = ["Book venue", "Order catering"], In Progress = [], Waiting = [], Done = ["Follow up with Sam"] — the same state US1 evidence collection ended on.

## Scenario 5 (US2-S1, cross-lane exact placement)

Given: To Do = ["Book venue", "Order catering"]. When: "Write proposal" is created (lands at the bottom of To Do) and dragged into the empty "In Progress" lane; then "Review budget" is created (lands at the bottom of To Do) and dragged into "In Progress" below "Write proposal"; then "Draft Q3 goals" is created (lands at the bottom of To Do) and dragged into "In Progress", dropped between "Write proposal" and "Review budget". Then: In Progress order is exactly ["Write proposal", "Draft Q3 goals", "Review budget"], and this survives a full page reload.

Result: PASS

Observed:
- "Write proposal" created, appeared at bottom of To Do; dragged into empty "In Progress" lane using `browser_drag` (dragTo) — worked on first attempt, landed correctly as the sole card in In Progress.
- "Review budget" created, appeared at bottom of To Do. A first attempt to drag it into In Progress using `browser_drag`/`dragTo` targeting the "Write proposal" card landed it *above* "Write proposal" (dragTo drops at the target element's center/top-half by default), giving In Progress = ["Review budget", "Write proposal"] — not the desired order. This was corrected by switching to a precise pixel-position drag: `page.mouse.move` to the source card center, `mouse.down`, an intermediate `mouse.move` to the target card's center, then a further `mouse.move` to roughly the bottom 90% of the target card's bounding box, then `mouse.up`. This landed the card below "Write proposal" as intended, giving In Progress = ["Write proposal", "Review budget"].
- "Draft Q3 goals" created, appeared at bottom of To Do. It was dragged into In Progress using the same precise mouse-driven technique, this time moving to the exact vertical midpoint between the bottom of "Write proposal" and the top of "Review budget" before releasing. While hovering at that midpoint (captured with a screenshot taken mid-drag, before mouseup), a visible blue horizontal drop-indicator line appeared in the gap between "Write proposal" and "Review budget", confirming the new dragover visual-indicator behavior is working (see us2-scenario5-mid-drag-indicator.png). Releasing at that point produced In Progress = ["Write proposal", "Draft Q3 goals", "Review budget"] exactly as expected.
- Snapshot and screenshot after the drop confirmed the exact order. The page was reloaded via full navigation (`page.goto`); a fresh snapshot confirmed the same order persisted: In Progress = ["Write proposal", "Draft Q3 goals", "Review budget"].

Drag driving mechanism: plain `browser_drag`/`dragTo` worked for dropping into an *empty* lane (landing "Write proposal"), but for *precise between-card / relative-to-a-specific-card* placement, `dragTo` (which targets the destination element's default drop point, generally its center/top area) was not precise enough and had to be replaced with a manually driven mouse sequence (`page.mouse.move` → `down` → intermediate `move` → `move` to the exact target Y-coordinate → `up`), computed from each card's `boundingBox()`. This gave reliable, exact control over which half of a card (or gap between two cards) the drop landed in.

Screenshots: us2-scenario5-mid-drag-indicator.png, us2-scenario5-after-drop.png, us2-scenario5-after-reload.png

## Scenario 6 (US2-S2, within-lane reorder upward)

Given: To Do = ["Book venue", "Order catering"]. When: "Send invites" is created (lands at bottom of To Do, giving To Do = ["Book venue", "Order catering", "Send invites"]), then dragged and dropped above "Book venue" (top of To Do). Then: To Do order becomes exactly ["Send invites", "Book venue", "Order catering"], and this survives a full page reload.

Result: PASS

Observed: "Send invites" created, appeared at the bottom of To Do as expected. Using the precise mouse-driven drag technique (move to source center, mouse down, intermediate move to target center, then move to the top ~10% of "Book venue"'s bounding box, then mouse up), the card was dropped above "Book venue". Snapshot and screenshot confirmed To Do = ["Send invites", "Book venue", "Order catering"] exactly. The page was reloaded via full navigation; a fresh snapshot confirmed the same order persisted.

Screenshots: us2-scenario6-after-drop.png, us2-scenario6-after-reload.png

## Scenario 7 (within-lane reorder downward, continuing from Scenario 6's state)

Given: To Do = ["Send invites", "Book venue", "Order catering"]. When: "Send invites" (currently at the top of To Do) is dragged down and dropped between "Book venue" and "Order catering". Then: To Do order becomes exactly ["Book venue", "Send invites", "Order catering"], and this survives a full page reload.

Result: PASS

Observed: Using the same precise mouse-driven drag technique — move to "Send invites" center, mouse down, intermediate move to "Book venue" center, then move to the exact vertical midpoint between the bottom of "Book venue" and the top of "Order catering", then mouse up — the card was dropped exactly between the two. Snapshot and screenshot confirmed To Do = ["Book venue", "Send invites", "Order catering"] exactly. The page was reloaded via full navigation; a fresh snapshot confirmed the same order persisted.

Screenshots: us2-scenario7-after-drop.png, us2-scenario7-after-reload.png

## User Story 2 Summary

All three US2 scenarios PASS.

- Scenario 5: cross-lane drop with exact index placement (including a between-two-cards drop) — PASS. The new drop-indicator line was visually confirmed during a between-cards dragover.
- Scenario 6: within-lane reorder to the very top of a lane — PASS.
- Scenario 7: within-lane reorder to a between-cards position — PASS.

All US2 orderings persisted correctly across full page reloads, confirming the exact-index placement is saved server-side, not just reflected optimistically in the client.

Drag driving mechanism note for US2: plain `browser_drag`/`dragTo` (Playwright's `locator.dragTo()`) remained sufficient for a drop into an *empty* lane, but every precise between-cards or top-of-lane / bottom-of-card placement required a manually driven mouse sequence built from each card's `boundingBox()` — `page.mouse.move` to the source, `mouse.down`, an intermediate `mouse.move` over the destination card, a further `mouse.move` to the exact target Y position (top ~10%, bottom ~90%, or the midpoint between two adjacent cards), then `mouse.up`. This was necessary because `dragTo()`'s default drop point (the destination element's center) is not fine-grained enough to reliably choose "above" vs. "below" a given card or land precisely between two cards — this is expected given the new exact-drop-index feature under test, not a defect.

# User Story 3 ("The rest of the app respects board placement")

Board state at the start of US3 testing (confirmed by snapshot): To Do = ["Book venue", "Send invites", "Order catering"], In Progress = ["Write proposal", "Draft Q3 goals", "Review budget"], Waiting = [], Done = ["Follow up with Sam"] — the same state US2 evidence collection ended on.

## Scenario 8 (US3-S1, creation appends)

Given: To Do = ["Book venue", "Send invites", "Order catering"]. When: a new task "Prep handout" is created via the create-task form. Then: it appears at the very bottom of "To Do" (To Do becomes ["Book venue", "Send invites", "Order catering", "Prep handout"]) and nothing else on the board changes.

Result: PASS

Observed: Filled the Title field with "Prep handout" and clicked "Add task". Snapshot immediately after confirmed To Do = ["Book venue", "Send invites", "Order catering", "Prep handout"] in exactly that order, with In Progress, Waiting, and Done all unchanged (In Progress = ["Write proposal", "Draft Q3 goals", "Review budget"], Waiting = [], Done = ["Follow up with Sam"]).

Screenshots: us3-scenario8-creation-appends.png

## Scenario 9 (US3-S2, read-only lane on detail page, FR-009)

Given: "Follow up with Sam" is in "Done". When: it is dragged into "Waiting" (landing alone there), then clicked to open its task detail page. Then: the detail page displays the lane as "Waiting" in plain read-only text, and there is no control anywhere on the page (no `<select>`, no dropdown, no button labeled anything like "lane"/"move"/"change lane") that could change the lane.

Result: PASS

Observed: Dragged "Follow up with Sam" from "Done" to "Waiting" using `browser_drag` (dragTo); it landed alone in "Waiting" (Done became empty). Clicked the card, which navigated to `/tasks/1`. The detail page's accessibility snapshot showed a heading "Follow up with Sam" followed by a plain paragraph reading exactly: **"Lane: Waiting"** — this is the exact read-only lane text observed, rendered as static text (a `<p>`), not as an editable control. A direct DOM query (`document.querySelectorAll('select')`) confirmed zero `<select>` elements exist anywhere on the page. The only `<button>` element present on the entire page was "Add note" (part of a note-adding form, unrelated to lane). The only other interactive control on the page was a "Search people" textbox (for linking a person to the task, unrelated to lane). No control labeled or resembling "lane", "move", or "change lane" was present anywhere. Navigated back to the board afterward via full navigation to http://localhost:5108/; the board still showed Waiting = ["Follow up with Sam"] and all other lanes unchanged.

Full list of controls present on the detail page (for independent verification): a "Search people" textbox, an empty list (linked-people list, currently no entries), a "Note" textbox, and an "Add note" button. None of these are lane-related.

Screenshots: us3-scenario9-readonly-lane-detail.png

## Scenario 10 (US3-S3, MCP mirror)

Given: the board arranged as in Scenarios 5–9. When: the orchestrating session independently queries `GET /api/board` directly (`curl http://localhost:3008/api/board`) and compares the response against the browser-tester's final board screenshot. Then: lane membership and per-lane top-to-bottom order match exactly; the authenticated MCP `list-board` equivalence is additionally covered by the automated integration test (`tests/integration/mcp-read-tools.test.ts`, "list-board mirrors GET /api/board lane membership and (position, id) order after arranging the board via the placement endpoint", which passed as part of the full suite run — 343/343 tests green).

Result: PASS

Observed: `curl http://localhost:3008/api/board` returned:
- To Do: ["Book venue" (pos 0), "Send invites" (pos 1), "Order catering" (pos 2), "Prep handout" (pos 3)]
- In Progress: ["Write proposal" (pos 0), "Draft Q3 goals" (pos 1), "Review budget" (pos 2)]
- Waiting: ["Follow up with Sam" (pos 0)]
- Done: []

This is an exact match, lane-for-lane and card-for-card in order, with the browser-tester's `us3-scenario10-final-board-for-mirror-check.png` screenshot of the rendered board. Every task payload includes a `position` field consistent with its rendered order. Since MCP's `list-board` tool is implemented via the same `listTasksByLane` service function that backs `GET /api/board` (no MCP-specific ordering logic exists to drift), and the automated integration test independently exercises the authenticated MCP client path against this exact scenario (arrange via placement endpoint, then assert `list-board` order matches `GET /api/board` order), this UI/API screenshot comparison plus the passing automated test together confirm FR-010/SC-005.

Screenshots: us3-scenario10-final-board-for-mirror-check.png

## User Story 3 Summary

- Scenario 8: task creation always appends to the bottom of "To Do" — PASS.
- Scenario 9: the task detail page shows the lane as plain read-only text ("Lane: Waiting") with no control anywhere on the page capable of changing the lane — PASS.
- Scenario 10: the board UI, a direct `GET /api/board` query, and the automated authenticated MCP `list-board` integration test all agree on lane membership and order — PASS.

# Overall Final Board State

Tab left open at http://localhost:5108/, last confirmed after Scenario 9's return-to-board navigation:
- To Do: ["Book venue", "Send invites", "Order catering", "Prep handout"]
- In Progress: ["Write proposal", "Draft Q3 goals", "Review budget"]
- Waiting: ["Follow up with Sam"]
- Done: []
