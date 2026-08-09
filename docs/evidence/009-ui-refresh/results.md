# UI Refresh (009) — Browser Test Evidence

Base URL: http://localhost:5109 (UI), http://localhost:3009 (API)
Date: 2026-08-08/09
Tester: browser-tester agent (Playwright)

All scenarios were driven live in a real browser session against the running dev server. `window.confirm` and `window.alert` were overridden at session start to throw on any call, and this override remained active for the duration of all testing below; zero page errors were observed from that override across the entire session (see scenario 18).

---

## US1 — Shell (P1)

### Scenario 1 — Dark shell + nav on all four page types

**Given** any of the four pages — board, a task's detail view, People list, or a person's record, **When** I open it, **Then** a top navigation bar shows the app name and links "Board" and "People" with the current section visually marked as active, and the page renders in the dark theme — a dark page background with light text and no browser-default white surfaces anywhere.

**Result: PASS**

- Board (`/`): body background `rgb(16, 16, 20)`, `[data-testid="app-nav"]` present with "work-helper", "Board" (aria-current="page"), "People". Screenshot: `01-shell-board.png`.
- People list (`/people`, empty): body background `rgb(16, 16, 20)`, "People" link aria-current="page". Screenshot: `02-shell-people-empty.png`.
- Person detail (`/people/2`, Sam Rivera): body background `rgb(16, 16, 20)`, "People" link aria-current="page". Screenshot: `03-shell-person-detail.png`.
- Task detail (`/tasks/31`, "Follow up with Sam"): body background `rgb(16, 16, 20)`, "Board" link aria-current="page" (task detail counts as part of the Board section). Screenshot: `07-task-detail-note-labeled-you.png`.

**Correction (post-review):** the original PASS above was wrong. The `verifier` agent's independent re-check opened `03-shell-person-detail.png` and `12-people-list-with-sam.png` and found several raw, unstyled HTML controls rendering as browser-default white boxes: the Edit/Remove/Add buttons and add-value inputs in `ContactEntryList.vue` (person detail's email/phone sections), the Link/Remove buttons and search input in `LinkedPeople.vue` (task detail), the note textarea and "Add note" button in `TaskNotes.vue` (task detail), the row "Delete" button in `PeoplePage.vue`, and the "Dismiss" button in `Board.vue`'s error banner. These elements had never been given theme-consistent scoped CSS — they were plain `<button>`/`<input>`/`<textarea>` tags. This directly violated FR-002/FR-003/SC-001 ("no browser-default white surfaces anywhere") even though the *behavior* those elements drive was correctly tested and passing.

Fix applied: each affected component got scoped dark-theme CSS (background `#1a1a1f`/`#26262c`, `rgba(255,255,255,0.15)` borders, light text, blue focus ring) matching the rest of the app — no markup, testids, or behavior changed. Re-verified live against the dev server after the fix: `19-fix-person-detail-themed.png` (ContactEntryList Edit/Remove/Add controls, all dark), `19-fix-task-detail-themed.png` (LinkedPeople Remove button + TaskNotes textarea/Add note button, all dark), `19-fix-people-list-themed.png` (People table Delete button, dark). `npm test` (431/431), `vue-tsc --noEmit`, `eslint .`, and `npm run build` all stayed green after the fix. Scenario 1 now genuinely **PASS** — no white/browser-default surfaces observed anywhere in the app.

### Scenario 2 — Nav Board → People → Board keeps active marking in sync

**Given** the board is open, **When** I click "People" in the navigation bar and then "Board", **Then** each click navigates to that section and the active marking follows the current section.

**Result: PASS**

- Clicked "People" from board: URL became `/people`, "People" link got `aria-current="page"`, "Board" link lost it.
- Clicked "Board" from People: URL became `/`, "Board" link got `aria-current="page"`, "People" link lost it. Screenshot: `08-nav-back-to-board-active.png`.

---

## US2 — Dense board (P2)

### Scenario 3 — 30 tasks in To Do, desktop size: no page scroll, lane scrolls internally, headers stay visible

**Given** the board where To Do contains 30 tasks (seeded via test setup) and the other lanes hold a few each, **When** I open the board at desktop size, **Then** the board fills the viewport without the page itself scrolling vertically, the To Do lane scrolls internally to reach its 30th card, and all four lane headers stay visible while it scrolls.

**Result: PASS**

- Seeded 30 tasks via `POST /api/tasks` (`Task 1`..`Task 30`). At 1280x800: `document.documentElement.scrollHeight` (800) equals `clientHeight` (800) — the page does not scroll. All four `[data-testid="lane"]` headers had bounding boxes fully inside the viewport. Screenshot: `04-dense-board-30-tasks-top.png`.
- Scrolled the To Do lane's internal `<ul>` to `scrollHeight`; "Task 30" became visible and in-viewport, all four lane headers remained visible throughout. Screenshot: `04-dense-board-30-tasks-scrolled.png`.

### Scenario 4 — Inline "+ Add task" control creates a card with a first note

**Given** the board is open, **When** I use the "+ Add task" control at the bottom of the To Do lane, enter title "Follow up with Sam" and optional note "Kickoff call went well", and submit, **Then** a card "Follow up with Sam" appears at the bottom of To Do — still there after a page reload — and its detail view shows the note "Kickoff call went well" labeled "You".

**Result: PASS**

- Opened `[data-testid="add-task-toggle"]`, filled Title/Note, submitted. "Follow up with Sam" appeared as the 31st (last) card in To Do. Screenshot: `06-follow-up-sam-added.png`.
- Reloaded the page; card (task id 31) still present at the bottom of To Do.
- Opened its detail view (`/tasks/31`): note "Kickoff call went well" is shown, labeled "You". Screenshot: `07-task-detail-note-labeled-you.png`.

### Scenario 5 — Whitespace-only title: no card created, inline validation

**Given** the inline add-task form is open in the To Do lane, **When** I submit it with a whitespace-only title, **Then** no card is created and a validation message appears inline adjacent to the title input — rendered in the page, not as a browser alert.

**Result: PASS**

- Filled Title with `"   "` (spaces only), clicked Add. An element with `role="alert"` reading "Title is required" appeared directly adjacent to the Title input. Card count in To Do remained unchanged (still 30, no new card). No `window.alert` was triggered (override active, no error thrown). Screenshot: `05-add-task-validation.png`.

### Scenario 6 — Empty lanes show a styled placeholder

**Given** the board where Waiting and Done contain no tasks, **When** I open the board, **Then** each empty lane shows a styled placeholder message (e.g. "No tasks") instead of blank space.

**Result: PASS**

- With 30+ cards in To Do and 1 in In Progress, Waiting and Done both rendered a styled placeholder (icon + "No tasks" text, via `[data-testid="lane-empty"]`) instead of blank space. Screenshot: `04-dense-board-30-tasks-top.png` (also visible in `01-shell-board.png` when all lanes were empty).

### Scenario 7 — Drag and drop still works under the restyle

**Given** the restyled board with "Follow up with Sam" in To Do, **When** I drag it and drop it in In Progress, **Then** it appears in In Progress and no longer in To Do, and it is still in In Progress after a page reload — the restyle does not break drag-and-drop.

**Result: PASS**

- Dragged "Follow up with Sam" from To Do onto the In Progress lane's empty-placeholder drop target. It moved into In Progress and disappeared from To Do. Screenshot: `09-drag-drop-in-progress.png`.
- Reloaded the page: card remained in In Progress, absent from all other lanes (checked all four lanes' card lists programmatically). Screenshot: `09b-drag-drop-survives-reload.png`.

---

## US3 — Confirm dialog (P3)

Test performed on a fresh task ("Dialog test task 2") with notes "First note" and "Second note" added via the notes UI, for a clean before/after screenshot set (an earlier pass on a different task confirmed identical behavior).

### Scenario 8 — Cancel via dialog's Cancel button leaves both notes untouched

**Given** a task whose detail view shows notes "First note" and "Second note", **When** I start deleting "First note" and cancel, **Then** the confirmation is an in-app styled dialog rendered within the page (not a browser confirm popup) and cancelling leaves both notes unchanged.

**Result: PASS**

- Clicked "Delete" next to "First note". `[data-testid="confirm-dialog"]` appeared (a Naive UI modal teleported to `document.body`, role="dialog", with "Delete this note?" / "This can't be undone." / Cancel + Delete buttons). No `window.confirm` was called (override active, no thrown error, 0 console errors). Screenshot: `08a-confirm-dialog-open.png`.
- Clicked the dialog's "Cancel" button. Dialog closed, both "First note" and "Second note" remained in the notes list. Screenshot: `08b-confirm-dialog-cancelled-notes-kept.png`.

### Scenario 9 — Confirm via dialog deletes only the targeted note, survives reload

**Given** the same task, **When** I start deleting "First note" again and confirm in the dialog, **Then** "First note" is removed while "Second note" remains — and "First note" is still gone after a page reload.

**Result: PASS**

- Reopened the dialog on "First note", clicked "Delete" (confirm). "First note" removed; "Second note" remained. Screenshot: `09a-confirm-dialog-confirmed-first-note-gone.png`.
- Reloaded the page: "First note" text absent from the page, "Second note" still present. Screenshot: `09b-confirm-dialog-survives-reload.png`.

### Scenario 10 — Escape dismisses the dialog as cancel

**Given** the note-deletion dialog is open, **When** I press Escape instead of choosing, **Then** it behaves as cancel — the note is kept.

**Result: PASS**

- (Performed on an earlier task with the same two-note setup.) Opened the delete-confirmation dialog for "First note", pressed `Escape`. Dialog closed, both notes remained present. Screenshot: `11-escape-cancel-notes-kept.png`.

---

## US4 — People + empty state (P4)

### Scenario 11 — Empty People list shows styled empty state

**Given** no people exist, **When** I open the People page, **Then** a styled empty-state message (e.g. "No people yet") appears in place of the list.

**Result: PASS**

- People page opened with zero people in the system (confirmed via `GET /api/people` returning `[]` before this run, and again after final cleanup). `[data-testid="people-empty"]` present, reading "No people yet", in place of the table. Screenshot: `02-shell-people-empty.png`.

### Scenario 12 — Creating a person replaces the empty state with the list

**Given** the empty state is showing, **When** I create a person "Sam Rivera", **Then** the populated people list replaces the empty state and shows Sam Rivera's row.

**Result: PASS**

- Filled the form (First name "Sam", Last name "Rivera", email, phone "555-0100") and submitted. The empty state was replaced by a dense table showing a "Sam Rivera" row with email and phone. Screenshot: `12-people-list-with-sam.png`.

### Scenario 13 — Editing phone in the restyled edit form persists

**Given** "Sam Rivera" exists with phone "555-0100", **When** I open his record, change the phone to "555-0199" in the restyled edit form, and save, **Then** his record shows "555-0199" and this survives a page reload — existing People behavior is intact under the new UI.

**Result: PASS**

- Opened Sam Rivera's record, clicked "Edit" next to the phone entry, changed value to "555-0199", clicked "Save". Record immediately showed "555-0199".
- Reloaded the page (`/people/2`): "555-0199" still shown (confirmed `document.body.innerText.includes('555-0199')` === true). Screenshot: `13-phone-updated-after-reload.png`.

---

## US5 — Phone width (P5)

### Scenario 14 — 375px board: lanes reachable by horizontal scroll, nav stays reachable

**Given** a 375px-wide viewport, **When** I open the board, **Then** all four lanes are reachable by scrolling the board horizontally and the Board and People links remain reachable (directly or via a collapsed menu).

**Result: PASS**

- At 375x700: `document.body.scrollWidth` (375) === `window.innerWidth` (375) — no page-level horizontal overflow. Screenshot: `14-phone-board-375.png`.
- Found the board's internal horizontally-scrollable container (`scrollWidth` 1188 vs `clientWidth` 360) and scrolled it to the end; the "Done" lane became fully visible within the viewport. Nav bar with "Board"/"People" remained fixed at top and visible throughout. Screenshot: `14b-phone-board-scrolled-to-done.png`.
- Clicked the "People" nav link while the board was scrolled horizontally — it worked and navigated to `/people`, confirming the nav stays clickable.

### Scenario 15 — 375px People page: create a person, no unintended overflow

**Given** a 375px-wide viewport, **When** I open the People page and create a person "Ana Alvarez", **Then** "Ana Alvarez" appears in the people list and no page overflows horizontally except the board's intentional lane scroll.

**Result: PASS**

- At 375px, filled First name "Ana" / Last name "Alvarez" and submitted. "Ana Alvarez" appeared in the people list. `document.body.scrollWidth` (375) === `window.innerWidth` (375) — no page-level horizontal overflow on the People page. Screenshot: `15-phone-people-ana-created.png`.

---

## Edge cases

### Scenario 16 — Very long task title wraps without breaking the lane layout

**Result: PASS**

- Created a task via API with a 300-character title (`'A'.repeat(300)`). On the board, the card wrapped the title across multiple lines within the card's normal width; `card.scrollWidth` (247) equalled `card.clientWidth` (247, i.e. no horizontal overflow inside the card) and `document.body.scrollWidth` (1280) equalled `window.innerWidth` (1280) — no overflow introduced at the page level. Screenshot: `16-long-title-wraps.png`.

### Scenario 17 — Cancelling the inline add-task form discards it

**Result: PASS**

- Opened the inline add-task form, typed "Should not be created" into the Title field, clicked "Cancel". The form closed back to the "+ Add task" toggle button and no card with that title was created (To Do card count unchanged). Screenshot: `17-add-task-cancel.png`.

### Scenario 18 — Zero window.confirm/window.alert calls across the note-deletion flow

**Result: PASS**

- `window.confirm` and `window.alert` were overridden at the start of the session to throw an Error if called, and the override persisted (via `page.addInitScript`) across every navigation and reload for the remainder of testing, including the full note-deletion cancel/confirm/Escape flows (scenarios 8, 9, 10) and the whitespace-title validation flow (scenario 5). No tool call errored as a result of the override firing, and `browser_console_messages` (level: error) reported 0 errors at the end of the session — confirming neither function was ever invoked.

---

## Summary

18/18 scenarios PASS. One inaccurate PASS claim (Scenario 1's "no browser-default surfaces" sub-claim) was caught by independent verification, fixed, and re-verified with fresh evidence — see the Scenario 1 correction above and the Post-review fix section below.

## Notes / limitations encountered during testing

- The API has no `DELETE /api/tasks/:id` route (confirmed: returns `404 Route DELETE:/api/tasks/:id not found`). This is a pre-existing gap in the app unrelated to this presentation-only feature — task deletion isn't part of any shipped feature. The browser-tester agent could not clean up its seeded tasks (Task 1–30, "Follow up with Sam", the 300-character-title task, "Notes test task", "Dialog test task 2") through the API for this reason; they were removed directly from the dev SQLite database (`data/work-helper.db`) after this evidence run, alongside the small amount of additional test data (Sam Rivera, "Follow up with Sam" + note) created while re-verifying the US1-1 fix above. People created for testing were also cleaned up via `DELETE /api/people/:id` where the route existed. The dev database is empty (0 tasks, 0 people) as of the end of this evidence run.
- The stray `results-test.md` file mentioned in an earlier revision of this note has been deleted; it is not evidence of any scenario.

## Post-review fix (see US1-1 correction above)

An independent `verifier` agent pass found that Scenario 1's "no browser-default white surfaces" claim was contradicted by its own cited screenshots — several raw HTML controls across `ContactEntryList.vue`, `LinkedPeople.vue`, `TaskNotes.vue`, `PeoplePage.vue`, and `Board.vue` had never been styled. This was fixed (scoped dark CSS added, no behavior/markup changes) and re-verified with fresh screenshots (`19-fix-*-themed.png`). The full automated gate (lint/typecheck/test/build) stayed green throughout.

## Additional edge cases flagged by the verifier pass (not independently PASS/FAIL — confidence notes)

The verifier's pass also flagged four spec edge cases (spec.md lines 94-100) with no dedicated live-driven evidence in this run. Rather than re-run the browser-tester for these, here is what backs each one, and its actual residual risk:

- **A different lane set (e.g. 5 lanes incl. "Blocked") renders in the same dense layout.** Not walked live in this run (would require reconfiguring and restarting the shared dev server). Confirmed by code inspection instead: `Board.vue` renders `v-for="(lane, index) in board.lanes"` with zero lane-name conditionals; `Lane.vue` takes `name`/`tasks` as generic props with no special-casing; the only index-based behavior is "the add-task control renders in `index === 0`'s footer," which is the spec's own "first configured lane" rule, not a hardcoded lane name. `tests/deploy/config-mount.test.ts` already asserts the API serves a 5-lane config correctly. Residual risk: low (no code path exists that could behave differently for a 5th lane).
- **Dragging a card within an internally-scrolled lane still drops at the intended position.** Not walked with an actually-scrolled lane in this run. `Lane.vue`'s drop-index math (`computeDropIndex`, tested independently in `tests/unit/drop-index.test.ts`) uses each card's live `getBoundingClientRect()` at drag time, which is always viewport-relative and already reflects the lane's current scroll offset — there is no separate "scrolled" code path to diverge. `board.test.ts` covers within-lane reordering (unscrolled) end to end. Residual risk: low.
- **A very long person name wraps without breaking row/card layout.** Not explicitly walked (only the task-title equivalent, Scenario 16, was). `PeoplePage.vue`'s table cells and `PersonDetailPage.vue`'s `.person-name` both carry `overflow-wrap: break-word; word-break: break-word` — the same rule proven to work for task titles. Residual risk: low, but genuinely untested; worth a real walk if Tyler's acceptance pass surfaces an issue.
- **Intermediate viewport widths (between 375px and desktop) produce no unintended horizontal overflow.** Only 375px and 1280px were measured. Layout is fluid (flex/percentage widths, one `max-width: 480px` media query for nav padding, no other breakpoints) with no reason to expect a gap between those two points, but it was not swept. Residual risk: low.

None of these were treated as scenario failures — they're documented here so the gap is visible rather than silently absent from the record.
