# Feature Specification: Create Task

**Feature Branch**: `001-create-task`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Create a task and see it appear on the kanban board — the thinnest vertical slice that touches UI and database end to end. Lanes are read from a config file as an ordered list of names (To Do, In Progress, Waiting, Done); new tasks always land in the first lane. Only a title is captured at creation. No editing, dragging, tags, links, or MCP tools in this feature." (source: `docs/product/features/create-task.md`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a task and see it on the board (Priority: P1)

Tyler opens the kanban board, types a title for something he needs to do,
and submits it. The task immediately appears as a card in the first lane
of the board, alongside any tasks already there.

**Why this priority**: This is the entire feature. Without it there is
nothing to test or ship — it's the minimum slice that proves the app's UI
and database work together.

**Independent Test**: Open the board, create a task by title, and confirm
a card with that title appears in the first lane. Delivers value on its
own: a working place to capture to-dos.

**Acceptance Scenarios**:

1. **Given** the kanban board is configured with lanes "To Do", "In
   Progress", "Waiting", "Done" (in that order) and no tasks exist yet,
   **When** Tyler opens the kanban board, **Then** he sees all four lanes
   displayed left to right in that order, each empty.
2. **Given** the kanban board is open and no tasks exist yet, **When**
   Tyler enters "Follow up with Sam" as a task title and submits, **Then**
   a new card titled "Follow up with Sam" appears in the "To Do" lane —
   the first configured lane.
3. **Given** the "To Do" lane already contains a card titled "Follow up
   with Sam", **When** Tyler creates a new task titled "Draft Q3 goals",
   **Then** the "To Do" lane shows both cards, and "Follow up with Sam" is
   unchanged.

---

### User Story 2 - Tasks persist across reloads (Priority: P2)

Tyler creates a task, then reloads the page (or comes back later). The
task is still there — it was saved, not just held in the browser tab.

**Why this priority**: Proves the database half of the vertical slice.
Without persistence, this is a UI mockup, not a working feature — but the
board is still usable within a single session even if this were somehow
delayed, so it ranks below the core creation flow.

**Independent Test**: Create a task, reload the page, and confirm the
task's card is still shown in the same lane.

**Acceptance Scenarios**:

1. **Given** Tyler has just created a task titled "Follow up with Sam",
   **When** he reloads the page, **Then** the "To Do" lane still shows a
   card titled "Follow up with Sam".

---

### User Story 3 - Blocked from creating a titleless task (Priority: P3)

Tyler tries to submit the create-task form without typing anything (or
only spaces). Nothing is created, and he's told a title is required.

**Why this priority**: A guardrail, not core value — the feature is
usable without it in the sense that a careful user would never hit this,
but it prevents silent junk data on the board.

**Independent Test**: Try to submit the create-task form with an empty or
whitespace-only title and confirm no card is created and a validation
message is shown.

**Acceptance Scenarios**:

1. **Given** the kanban board is open, **When** Tyler tries to submit the
   create-task form with an empty or whitespace-only title, **Then** no
   new card is created and he sees a validation message telling him a
   title is required.

---

### Edge Cases

- What happens when two tasks are created with the identical title? Both
  are created as separate cards; titles are not required to be unique.
- What happens if the lane configuration file is missing or lists zero
  lanes at startup? Out of scope for this feature's behavior — a valid,
  non-empty lane configuration is assumed to be in place (see
  Assumptions).
- What happens when a task title is very long? No product-level maximum is
  specified for this feature; the card must still render without breaking
  the board layout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the kanban board with lanes read from
  configuration, rendered left to right in the configured order.
- **FR-002**: System MUST let the user create a new task by entering a
  title and submitting.
- **FR-003**: A newly created task MUST appear as a card in the first lane
  defined by the configuration.
- **FR-004**: System MUST persist created tasks so they remain visible
  after a page reload or a new browser session.
- **FR-005**: System MUST reject task creation when the title is empty or
  contains only whitespace, and MUST tell the user a title is required.
- **FR-006**: System MUST support multiple tasks within the same lane,
  each displayed independently, without altering or removing existing
  tasks when a new one is created.
- **FR-007**: System MUST NOT provide any UI to create, rename, reorder,
  or delete lanes — lane names and order come only from configuration.
- **FR-008**: System MUST NOT provide task editing, task deletion,
  dragging a task between lanes, tags, or links to other entities (people,
  emails) — these are out of scope for this feature.

### Key Entities

- **Task**: A to-do item created by Tyler. Has a required title and
  belongs to exactly one lane. Persisted so it survives reloads.
- **Lane**: A named column on the kanban board (e.g. "To Do"). Defined by
  an ordered list in configuration, not created or managed through the
  app in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a task and see it appear on the board in
  under 5 seconds of submitting.
- **SC-002**: 100% of tasks created remain visible after a page reload or
  a new browser session.
- **SC-003**: 0% of attempts to submit an empty or whitespace-only title
  result in a new card being created.
- **SC-004**: On first load with a valid configuration, the board displays
  every configured lane, in order, with no manual setup steps beyond
  editing the configuration file.

## Assumptions

- Lanes are defined in a configuration file, read as an ordered list of
  names. For this spec, the real/illustrative lane set is "To Do", "In
  Progress", "Waiting", "Done", in that order.
- New tasks always land in the first configured lane ("To Do"); this
  feature has no lane picker at creation time.
- Single user, no authentication — consistent with work-helper being a
  self-hosted personal tool for Tyler.
- Exactly one board exists; multi-board support is out of scope.
- Task title is the only field captured at creation — no description, due
  date, tags, or links in this feature.
- A valid, non-empty lane configuration is in place at deploy time;
  handling a missing/empty configuration is not addressed by this feature.
