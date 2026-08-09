# Feature: ui-refresh

## User story

As Tyler, I want work-helper's UI rebuilt on a component library with a dense, dark, data-forward look so that every page feels like one cohesive, modern product instead of unstyled browser-default HTML — while everything that already works keeps working exactly as specced.

## Acceptance criteria

The configured lanes are To Do, In Progress, Waiting, Done. The refresh restyles the whole app — app shell, kanban board, task detail, People list, person detail — on a component library with prebuilt components (which library is a `/speckit-plan` decision). Placeholder and button copy in the criteria is illustrative; Tyler can adjust exact wording at acceptance. Visual judgment (does it look cohesive, dense, and modern) is Tyler's manual acceptance pass; the criteria below pin the structural and behavioral outcomes the browser-tester can verify.

- **Given** any of the four pages — board, a task's detail view, People list, or a person's record
  **When** I open it
  **Then** a top navigation bar shows the app name and links "Board" and "People" with the current section visually marked as active, clicking the other link navigates to it, and the page renders in the dark theme — a dark page background with light text, with no browser-default white surfaces anywhere

- **Given** the board where To Do contains 30 tasks (seeded via test setup) and the other lanes hold a few each
  **When** I open the board at desktop size
  **Then** the board fills the viewport without the page itself scrolling vertically, the To Do lane scrolls internally to reach its 30th card, and all four lane headers stay visible while it scrolls

- **Given** the board is open
  **When** I use the "+ Add task" control at the bottom of the To Do lane, enter title "Follow up with Sam" and optional note "Kickoff call went well", and submit
  **Then** a card "Follow up with Sam" appears at the bottom of To Do — still there after a page reload — and its detail view shows the note "Kickoff call went well" labeled "You"

- **Given** the inline add-task form is open in the To Do lane
  **When** I submit it with a whitespace-only title
  **Then** no card is created and a validation message appears inline adjacent to the title input — rendered in the page, not as a browser alert

- **Given** a task whose detail view shows notes "First note" and "Second note"
  **When** I start deleting "First note" and cancel, then start deleting it again and confirm
  **Then** the confirmation is an in-app styled dialog rendered within the page (not a browser confirm popup), the cancel leaves both notes unchanged, and the confirm removes "First note" while "Second note" remains — still gone after a page reload

- **Given** the board where Waiting and Done contain no tasks
  **When** I open the board
  **Then** each empty lane shows a styled placeholder message (e.g. "No tasks") instead of blank space

- **Given** no people exist
  **When** I open the People page
  **Then** a styled empty-state message (e.g. "No people yet") appears in place of the list, and creating a person "Sam Rivera" replaces it with the populated list

- **Given** the restyled board with "Follow up with Sam" in To Do
  **When** I drag it and drop it in In Progress
  **Then** it appears in In Progress and no longer in To Do, and it is still in In Progress after a page reload — the restyle does not break drag-and-drop

- **Given** a 375px-wide viewport (phone size)
  **When** I open the board, then navigate to the People page and create a person "Ana Alvarez"
  **Then** all four lanes are reachable by scrolling the board horizontally, the Board and People links remain reachable (directly or via a collapsed menu), "Ana Alvarez" appears in the people list, and no page overflows horizontally except the board's intentional lane scroll

- **Given** the restyled app
  **When** the full automated test suite from previously shipped features runs
  **Then** it passes — every already-specced behavior (task creation, notes, linked people, People page CRUD, drag ordering, MCP tools) still holds under the new UI

## Out of scope

- Which component library — a `/speckit-plan` decision; the product constraint is only that the UI is built on an established library of prebuilt components that can be tweaked, not hand-rolled CSS from scratch.
- The server-rendered MCP connector password page — stays exactly as it is (its plain look is acceptable; it is deliberately outside the app shell).
- A light theme or a theme toggle — dark only, by explicit decision in this interview. Not a deferral.
- Toast notifications and loading indicators/skeletons — offered and not chosen for this slice; deferred to the `ui-polish` stub.
- A dedicated accessibility pass (keyboard-focus audit, ARIA review) beyond what the component library provides by default — part of the "full polish" layer Tyler declined for this slice; rides with the `ui-polish` stub.
- Touch drag-and-drop on mobile — the phone-width board is for viewing and navigation; drag stays desktop-only per the move-task-between-lanes decision.
- Any change to what a kanban card face displays — cards stay title-only, just restyled (see the `kanban-card-indicators` stub).
- Sorting/filtering controls, new pages (Emails etc.), or any new feature surface — this slice restyles what exists (see the `kanban-sort-filter` and `email-ui` stubs).
- Changing any behavior of shipped features beyond the named upgrades (inline To Do add form, styled confirm dialog, empty states) — everything else is a pure restyle.
- Lane configuration changes — lanes still come from the config file, unchanged.

## Open questions

All interview questions were resolved with Tyler (2026-08-08):

- Look and feel: dense and data-forward — Trello/Jira-style compact spacing and information density, not minimal-airy.
- Scope: the whole app in one pass; password page excluded.
- Behavior: restyle plus small UX upgrades — styled confirm dialog replacing the browser confirm() on note deletion, and empty states for lanes and the People list. Toasts and loading indicators explicitly not in this slice.
- Theme: dark only — no light variant, no toggle.
- Mobile: usable at phone width (board scrolls horizontally, nav stays reachable); fully mobile-optimized was not the ask.
- Navigation: top bar with app name and Board/People links.
- Board height: full-height lanes that scroll internally; the page itself doesn't scroll.
- Task creation: inline "+ Add task" at the bottom of the To Do lane (replacing the form above the board), keeping the optional note field from task-notes.
- Done bar: cohesive at a glance — every page on the same components, spacing, and colors; deeper polish iterates later.
- Confirmed at doc review: the inline To Do add control fully replaces the create form above the board — no separate create form remains.
- None remaining — ready for `/speckit-specify`.
