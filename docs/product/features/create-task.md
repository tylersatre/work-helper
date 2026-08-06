# Feature: create-task

## User story

As Tyler, I want to create a task and see it show up on the kanban board so that I have a persistent, visual place to capture things I need to do, proving the app's UI and database work together end to end.

## Acceptance criteria

- **Given** the kanban board is configured with lanes "To Do", "In
  Progress", "Done" (in that order) and no tasks exist yet
  **When** I open the kanban board
  **Then** I see three lanes displayed left to right in that order, each
  empty

- **Given** the kanban board is open and no tasks exist yet
  **When** I enter "Follow up with Sam" as a task title and submit
  **Then** a new card titled "Follow up with Sam" appears in the "To Do"
  lane — the first configured lane

- **Given** I have just created a task titled "Follow up with Sam"
  **When** I reload the page
  **Then** the "To Do" lane still shows a card titled "Follow up with Sam"
  (proving the task was persisted, not just held in browser state)

- **Given** the "To Do" lane already contains a card titled "Follow up with
  Sam"
  **When** I create a new task titled "Draft Q3 goals"
  **Then** the "To Do" lane shows both cards, and "Follow up with Sam" is
  unchanged

- **Given** the kanban board is open
  **When** I try to submit the create-task form with an empty or
  whitespace-only title
  **Then** no new card is created and I see a validation message telling me
  a title is required

## Out of scope

- Editing a task after creation (title, description, or anything else).
- Dragging or otherwise moving a card between lanes.
- Deleting a task.
- Tags and custom fields.
- Linking a task to a person or an email.
- The work-helper MCP tools for tasks.
- Managing lanes through the UI — for this feature, lanes are defined in configuration (an ordered list of names), not created, renamed, reordered, or deleted from the app itself.
- Multiple boards — there is exactly one board.
- Sorting or filtering cards within a lane.
- A description field, due dates, priority, assignees, or any other task metadata beyond title.
- Authentication / multi-user access control.

## Open questions

- **Assumption to confirm:** every new task lands in the first configured lane ("To Do" in the example above) — there is no lane picker in this feature. Flag this if you want new tasks to land somewhere else, or want a picker even at this stage.
  - Starting at the first lane is fine
- The exact mechanism for lane configuration (config file, env var, seed script, etc.) is a `/speckit-plan` implementation decision, not a product one — left unspecified here on purpose.
  - Let's do a config file, the lanes are read from it
- Exact lane names for the real deployment (the "To Do" / "In Progress" / "Done" set above is illustrative for writing concrete, automatable criteria) — confirm or change before `/speckit-specify`, since the acceptance criteria reference them by name.
  - To Do, In Progress, Waiting, Done - these are thelanes
