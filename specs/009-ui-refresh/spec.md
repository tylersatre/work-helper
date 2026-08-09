# Feature Specification: UI Refresh

**Feature Branch**: `009-ui-refresh`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "@docs/product/features/ui-refresh.md" (Tyler-authored PRD, feature interview resolved 2026-08-08)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One cohesive dark shell around every page (Priority: P1)

As Tyler, every page of work-helper — the board, a task's detail view, the People list, and a person's record — sits inside the same dark app shell: a slim top navigation bar with the app name and Board/People links, the current section visually marked, and a dark, cohesive look with light text throughout. Nothing looks like unstyled browser-default HTML anymore.

**Why this priority**: Cohesion at a glance is the acceptance bar for the whole feature, and the shell plus theme is what turns four bare pages into one product. Every other story renders inside this shell.

**Independent Test**: Can be fully tested by opening each of the four pages and verifying the navigation bar, active-section marking, working links, and dark rendering — delivering visible value (the app looks like one modern product) before any page-specific redesign.

**Acceptance Scenarios**:

1. **Given** any of the four pages — board, a task's detail view, People list, or a person's record, **When** I open it, **Then** a top navigation bar shows the app name and links "Board" and "People" with the current section visually marked as active, and the page renders in the dark theme — a dark page background with light text and no browser-default white surfaces anywhere.
2. **Given** the board is open, **When** I click "People" in the navigation bar and then "Board", **Then** each click navigates to that section and the active marking follows the current section.

---

### User Story 2 - A dense board that fits the screen (Priority: P2)

As Tyler, the kanban board becomes a dense, Trello-style working surface: it fills the viewport, each lane is a full-height column that scrolls internally when its cards overflow (lane headers always visible), empty lanes show a placeholder instead of blank space, and task creation moves into the To Do lane as an inline "+ Add task" control with the optional first-note field. Dragging cards keeps working exactly as before.

**Why this priority**: The board is the daily driver, and the dense full-height layout is the heart of the "data-forward" direction. It delivers the biggest visible win after the shell.

**Independent Test**: Can be fully tested by seeding a board (one overfull lane, some empty lanes), opening it, verifying the fixed-height layout and placeholders, creating a task through the inline control, and dragging a card — all without touching any other page.

**Acceptance Scenarios**:

1. **Given** the board where To Do contains 30 tasks (seeded via test setup) and the other lanes hold a few each, **When** I open the board at desktop size, **Then** the board fills the viewport without the page itself scrolling vertically, the To Do lane scrolls internally to reach its 30th card, and all four lane headers stay visible while it scrolls.
2. **Given** the board is open, **When** I use the "+ Add task" control at the bottom of the To Do lane, enter title "Follow up with Sam" and optional note "Kickoff call went well", and submit, **Then** a card "Follow up with Sam" appears at the bottom of To Do — still there after a page reload — and its detail view shows the note "Kickoff call went well" labeled "You".
3. **Given** the inline add-task form is open in the To Do lane, **When** I submit it with a whitespace-only title, **Then** no card is created and a validation message appears inline adjacent to the title input — rendered in the page, not as a browser alert.
4. **Given** the board where Waiting and Done contain no tasks, **When** I open the board, **Then** each empty lane shows a styled placeholder message (e.g. "No tasks") instead of blank space.
5. **Given** the restyled board with "Follow up with Sam" in To Do, **When** I drag it and drop it in In Progress, **Then** it appears in In Progress and no longer in To Do, and it is still in In Progress after a page reload — the restyle does not break drag-and-drop.

---

### User Story 3 - In-app confirmation for note deletion (Priority: P3)

As Tyler, deleting a note no longer triggers the browser's native confirm popup: an in-app styled dialog asks me to confirm, cancel leaves everything untouched, and confirm deletes the note. The app's last browser-native popup is gone.

**Why this priority**: It is the one interaction that still escapes the app's own look and feel. Small, contained, and independently shippable — but only worth doing once the shell exists to match.

**Independent Test**: Can be fully tested on one task with two notes by walking the cancel path and then the confirm path.

**Acceptance Scenarios**:

1. **Given** a task whose detail view shows notes "First note" and "Second note", **When** I start deleting "First note" and cancel, **Then** the confirmation is an in-app styled dialog rendered within the page (not a browser confirm popup) and cancelling leaves both notes unchanged.
2. **Given** the same task, **When** I start deleting "First note" again and confirm in the dialog, **Then** "First note" is removed while "Second note" remains — and "First note" is still gone after a page reload.

---

### User Story 4 - Restyled People pages with an empty state (Priority: P4)

As Tyler, the People list and person records use the same dense components as the rest of the app, and an empty People list greets me with a styled empty state instead of a blank page. Creating, viewing, and editing people works exactly as it does today, just in the new clothes.

**Why this priority**: It completes whole-app cohesion. The People pages already work; this story is restyling plus one UX upgrade (the empty state).

**Independent Test**: Can be fully tested by opening the People page with no people, creating one, and editing them — independent of the board stories.

**Acceptance Scenarios**:

1. **Given** no people exist, **When** I open the People page, **Then** a styled empty-state message (e.g. "No people yet") appears in place of the list.
2. **Given** the empty state is showing, **When** I create a person "Sam Rivera", **Then** the populated people list replaces the empty state and shows Sam Rivera's row.
3. **Given** "Sam Rivera" exists with phone "555-0100", **When** I open his record, change the phone to "555-0199" in the restyled edit form, and save, **Then** his record shows "555-0199" and this survives a page reload — existing People behavior is intact under the new UI.

---

### User Story 5 - Usable at phone width (Priority: P5)

As Tyler, on a phone-sized screen the app stays readable and functional: the board's lanes are reachable by horizontal scrolling, the navigation stays reachable (directly or via a collapsed menu), and the People page works end to end. Drag-and-drop remains desktop-only.

**Why this priority**: Desktop is the primary surface; phone usability is a deliberate but secondary commitment — view and capture, not full board manipulation.

**Independent Test**: Can be fully tested by setting a 375px-wide viewport and walking the board and People flows.

**Acceptance Scenarios**:

1. **Given** a 375px-wide viewport, **When** I open the board, **Then** all four lanes are reachable by scrolling the board horizontally and the Board and People links remain reachable (directly or via a collapsed menu).
2. **Given** a 375px-wide viewport, **When** I open the People page and create a person "Ana Alvarez", **Then** "Ana Alvarez" appears in the people list and no page overflows horizontally except the board's intentional lane scroll.

---

### Edge Cases

- A very long task title or person name wraps or truncates within its card or row without breaking the lane or list layout.
- A lane configuration with a different lane set (e.g. five lanes including "Blocked", per home-server-deploy) renders in the same dense layout, with lanes beyond the viewport reachable by scrolling the board horizontally at desktop size too.
- A board where every lane is empty shows a placeholder in every lane.
- The inline add-task control can be dismissed without creating a task (e.g. cancel or click away); the form closes and no card appears.
- Dismissing the note-deletion dialog without choosing (e.g. pressing Escape or clicking outside it) behaves as cancel — the note is kept.
- Dragging a card within a lane that is internally scrolled still drops the card at the intended position.
- Viewport widths between phone and desktop produce no unintended horizontal page overflow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every app page (board, task detail, People list, person record) MUST render inside a shared app shell with a top navigation bar showing the app name and links "Board" and "People"; the current section MUST be visually marked as active and each link MUST navigate to its section.
- **FR-002**: Every app page MUST render in a single dark theme — dark page background, light text, no browser-default white surfaces. There is no light theme and no theme toggle.
- **FR-003**: All app pages MUST be built from one shared set of prebuilt components with consistent typography, spacing, and control styling, in a dense, data-forward visual direction; whether the result reads as cohesive and modern is judged in Tyler's manual acceptance pass.
- **FR-004**: At desktop size the board MUST fill the viewport without the page scrolling vertically; each lane MUST be a full-height column that scrolls internally when its cards overflow, with every lane header remaining visible.
- **FR-005**: Task creation MUST move to an inline "+ Add task" control at the bottom of the To Do lane, offering a title input and the optional note field; it fully replaces the create form above the board. Submitting MUST create the task at the bottom of To Do, with a filled note becoming the task's first note (labeled "You" in the detail view).
- **FR-006**: All validation messages in the app MUST render inline, adjacent to the offending input, within the page — never as browser-native alerts. Existing validation rules (task title required; person name, email, and phone rules) are unchanged in substance.
- **FR-007**: The note-deletion confirmation MUST be an in-app modal dialog with cancel and confirm actions; cancel (including dismissing the dialog) MUST leave the note untouched, confirm MUST delete it. No flow in the app uses a browser-native confirm popup.
- **FR-008**: An empty lane MUST show a styled placeholder message, and an empty People list MUST show a styled empty-state message that is replaced by the list once a person exists. Exact copy is illustrative and adjustable at Tyler's acceptance.
- **FR-009**: At a 375px-wide viewport, the board's lanes MUST be reachable by horizontal scrolling, the navigation MUST remain reachable (directly or via a collapsed menu), the People page MUST support creating a person, and no page may overflow horizontally except the board's intentional lane scroll.
- **FR-010**: Drag-and-drop moving and reordering of cards MUST keep working exactly as specced in move-task-between-lanes, desktop-only, under the restyled board.
- **FR-011**: All behavior specced by previously shipped features (create-task, track-people, task-notes, mcp-server, multiple-emails-and-phones, home-server-deploy, email-sync, move-task-between-lanes) MUST remain intact — the full automated test suite passes — except the three named upgrades: the create form's new inline placement, the styled deletion dialog, and the empty states.
- **FR-012**: The server-rendered MCP connector password page MUST remain unchanged.
- **FR-013**: Kanban card faces MUST remain title-only (restyled, no new content), and lanes MUST continue to come from the existing lane configuration file, unchanged in format and behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero browser-default-styled surfaces remain: all four app pages render in the dark theme with the shared shell — verified on every page.
- **SC-002**: 100% of previously shipped feature acceptance checks pass under the new UI, with only the three named interaction upgrades behaving differently.
- **SC-003**: With 30 cards in one lane at desktop size, all four lane headers remain visible at all times and the page itself never scrolls vertically.
- **SC-004**: Zero browser-native popups (alert/confirm) appear in any specced flow — every validation message and confirmation renders inside the page.
- **SC-005**: At a 375px viewport, 100% of the specced phone flows complete: reaching all lanes by scroll, navigating between sections, and creating a person.
- **SC-006**: Creating a task from the board takes no more steps than before: open the inline control, type a title, submit — three interactions.
- **SC-007**: Tyler's manual acceptance pass judges every page cohesive — same components, spacing, and colors throughout, nothing left looking like unstyled HTML.

## Assumptions

- The UI is rebuilt on an established library of prebuilt, tweakable components; which library is a planning decision. Hand-rolling all styling from scratch would contradict the PRD's explicit direction.
- The visual direction is dense and data-forward (Trello/Jira-style compact spacing); "does it look right" is judged by Tyler at acceptance, while automated checks pin the structural and behavioral outcomes in this spec.
- Dark-only is a product decision, not a deferral — no light theme work is anticipated later.
- Placeholder, button, and empty-state copy in scenarios is illustrative; Tyler can adjust exact wording at acceptance without spec changes.
- The configured lanes are To Do, In Progress, Waiting, Done from the existing lane configuration; the layout must tolerate a different configured set (per the home-server-deploy lane-edit scenario) without special-casing any lane.
- Toast notifications, loading indicators/skeletons, and a dedicated accessibility pass are out of scope, deferred to the `ui-polish` stub; touch drag-and-drop remains out of scope per move-task-between-lanes.
- work-helper is a single-user app (Tyler); no multi-user or authentication concerns are introduced by this feature.
- The MCP server, its tools, and the password page are behaviorally untouched; this feature changes the web app's presentation layer only, plus the three named interaction upgrades.
