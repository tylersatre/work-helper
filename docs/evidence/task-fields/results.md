# Task Fields Feature — Manual Browser Test Results

Feature: task-fields (specs/030-task-fields/spec.md)
Environment: UI http://localhost:5130, API http://localhost:3030
Date: 2026-08-26

## US1 — Create-time fields (P1)

### Step 1 — Create form shows four new inputs (US1)

**Given** I am on the board at http://localhost:5130
**When** I click "+ Add task" in the To Do lane
**Then** the expanded create-task form shows four new inputs beyond title/note: a due-date picker, a priority select (Low/Medium/High/Urgent), an effort select (S/M/L/XL), and a description textarea

**Result: PASS**

Screenshot: `01-create-form-expanded.png`

The expanded "+ Add task" form shows, in order: Title, Note, Due date (a "Select Date" date picker), Priority (a "Please Select" dropdown), Effort (a "Please Select" dropdown), Description (a multi-line textarea), then Add/Cancel buttons. Opening the Priority dropdown separately confirmed the options Low/Medium/High/Urgent; opening the Effort dropdown confirmed S/M/L/XL.

### Step 2 — Fill in "Plan retro" with all four fields set (US1)

**Given** the create-task form is expanded
**When** I fill in title "Plan retro", a due date (2026-09-10), priority High, effort M, and a markdown description (bold/italic/link/bulleted list) and submit
**Then** the task is created with all values

**Result: PASS**

Screenshots: `02-create-form-filled.png` (form filled in before submit)

After clicking "Add", the form reset and a new "Plan retro" card appeared in the To Do lane with a "Sep 10, 2026" due-date badge, confirming the submission succeeded.

### Step 3 — New task's detail view shows all four values, description rendered as HTML (US1)

**Given** "Plan retro" was just created with due date, priority, effort, and a markdown description set
**When** I open its detail view
**Then** all four values are shown, with the description rendered as formatted HTML (bold/italic/link/list actually rendered, not literal markdown characters)

**Result: PASS**

Screenshot: `03-plan-retro-detail-view.png`

The detail view "Fields" section shows: due date 2026-09-10, priority "High", effort "M", and the description rendered as HTML — a paragraph with real `<strong>`, `<em>`, and `<a href="https://example.com/notes">` elements (no literal `**`/`_`/`[]()` characters visible), followed by a real `<ul>` with two `<li>` items ("Gather feedback", "Prioritize action items").

### Step 4 — Blank optional fields show explicit "unset" state (US1)

**Given** a task is created with only a title (all four new fields left blank) — using the already-seeded "Draft budget" task
**When** I open its detail view
**Then** all four fields show an explicit "unset" state (a label like "No due date"/"No priority"/"No effort"/"No description" next to a control to set it)

**Result: PASS**

Screenshot: `04-draft-budget-unset-fields.png`

"Draft budget"'s detail view "Fields" section shows exactly: "No due date" next to a "Select Date" picker, "No priority" next to a "Please Select" dropdown, "No effort" next to a "Please Select" dropdown, and "No description" next to an "Add description" button.

## US2 — Detail-view editing + card badge (P2)

### Step 5 — Setting due date in detail view updates immediately and shows a plain board badge (US2)

**Given** "Draft budget"'s detail view has all fields unset
**When** I set a due date (2026-09-01) via the date picker
**Then** it appears immediately in the detail view, and navigating back to the board shows a plain due-date badge (no icon, no color coding, no "overdue" wording) on that card's face

**Result: PASS**

Screenshots: `05a-draft-budget-due-date-set-detail.png`, `05b-board-draft-budget-badge.png`

The date field updated to "2026-09-01" immediately after selection (no save button, no page reload). On the board, "Draft budget" now shows a plain text badge "Sep 1, 2026" — same visual treatment (no icon, no color, no "overdue" text) as the other seeded cards' due-date badges.

### Step 6 — Due date and badge survive a full reload (US2)

**Given** "Draft budget" now has a due date of 2026-09-01
**When** I fully reload the browser (fresh navigation, not client-side routing)
**Then** the due date is still shown in the detail view and the board badge is still shown

**Result: PASS**

Screenshot: `06-after-reload-detail-and-board.png`

A full `page.goto` to `/` showed the "Sep 1, 2026" badge still on the board; a fresh `page.goto` to `/tasks/2` showed the due-date field still populated with "2026-09-01" in the detail view.

### Step 7 — Clearing due date removes it immediately from detail view and board, survives reload (US2)

**Given** "Draft budget" has a due date of 2026-09-01
**When** I clear the due date from the detail view (via the date picker's "Clear" button)
**Then** it disappears immediately from the detail view ("No due date" reappears); the board card's badge disappears; and after a full reload the badge stays gone

**Result: PASS**

Screenshots: `07a-draft-budget-cleared-detail.png`, `07b-board-badge-gone.png`, `07c-board-after-reload-badge-stays-gone.png`

Clicking "Clear" in the date picker immediately reverted the field to "No due date" in the detail view. Navigating to the board showed "Draft budget" with no badge (plain title only). A full reload of the board confirmed the badge stayed gone.

### Step 8 — Priority/effort auto-save immediately, never shown on card face (US2)

**Given** "Book venue"'s detail view shows priority High, effort L (seeded values)
**When** I change priority to Urgent and effort to XL via their dropdowns
**Then** the change takes immediately with no save button, and the board card face shows no priority or effort indicator anywhere (only due date ever shows on the card face)

**Result: PASS**

Screenshots: `08a-book-venue-priority-effort-changed.png`, `08b-board-card-no-priority-effort.png`

Selecting "Urgent" in the Priority dropdown updated the field to show "Urgent" immediately (no save/confirm step); selecting "XL" in the Effort dropdown updated the field to show "XL" immediately. On the board, "Book venue"'s card face shows only its title and the unchanged "Sep 5, 2026" due-date badge — no priority or effort text, color, or icon appears anywhere on the card.

### Step 9 — Add/edit description: markdown textarea, rendered save, discard on Cancel (US2)

**Given** "Draft budget" has no description
**When** I click "Add description", type raw markdown into the textarea, and click Save; then click "Edit", confirm the raw markdown is shown, edit it, and click Cancel
**Then** Save switches to a rendered HTML view with an "Edit" button; Cancel after editing discards the change (no request sent, displayed content unchanged)

**Result: PASS**

Screenshots: `09a-draft-budget-description-raw-textarea.png`, `09b-draft-budget-description-rendered.png`, `09c-draft-budget-cancel-discarded.png`

Typing `Budget draft for **Q3**. Needs _sign-off_ before [submission](https://example.com/budget).` into the "Add description" textarea and clicking Save produced a rendered paragraph with real `<strong>`Q3`</strong>`, `<em>`sign-off`</em>`, and a real `<a href="https://example.com/budget">`submission`</a>` link, plus an "Edit" button. Clicking "Edit" showed the exact raw markdown text back in the textarea. After typing "THIS EDIT SHOULD BE DISCARDED" over it and clicking "Cancel", the network request log (captured via `browser_network_requests`) showed no new request was issued (last request remained request #111, the original save's PATCH `/api/tasks/2`) — no PATCH fired for the cancelled edit — and the displayed content reverted to the original rendered "Budget draft for **Q3**..." text, confirming the edit was discarded.

### Step 10 — Board shows a mix of cards with and without due-date badges (US2)

**Given** the board has cards with and without due dates after the above edits
**When** I view the To Do lane
**Then** at least two cards are visible side by side, one with a due-date badge and one without

**Result: PASS**

Screenshot: `10-board-mixed-badges.png`

The To Do lane shows four cards: "Book venue" (badge "Sep 5, 2026"), "Draft budget" (no badge, due date was cleared in step 7), "Ship report" (badge "Sep 15, 2026"), "Plan retro" (badge "Sep 10, 2026") — a clear side-by-side mix of badged and unbadged cards.

## Summary

All 10 steps PASSED. The create-task form exposes all four new optional fields (due date, priority, effort, description) alongside title/note; values set at creation round-trip correctly to the detail view with the description rendered as real HTML rather than literal markdown. Detail-view editing of due date, priority, and effort is auto-saving with no explicit save button and takes effect immediately, surviving full page reloads. Only the due date ever appears on the board card face, as a plain, unstyled badge with no icon/color/overdue wording — priority and effort changes never leak onto the card face. The description field's add/edit flow correctly round-trips raw markdown into the textarea on Edit and discards unsaved edits on Cancel with no network request sent. One incidental console error was observed throughout testing (404 for `/favicon.ico`) — unrelated to the task-fields feature and not flagged as a defect.
