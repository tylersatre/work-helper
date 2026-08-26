# Feature Specification: task-fields

**Feature Branch**: `030-task-fields`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "As Tyler, I want native due date, priority, effort, and description fields on a task — settable in the UI and via MCP — so that deadlines and priority live as real structured data instead of being encoded into the title text and the card's position in the Up Next lane."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set fields when creating a task in the UI (Priority: P1)

As Tyler, when I create a task on the kanban board, I want to optionally set a due date, priority, effort, and description right in the create-task form, so the task starts with real structured data instead of me encoding a deadline into the title.

**Why this priority**: This is the primary entry point for structured task data and delivers the core value on its own — a task can carry a due date, priority, effort, and formatted description from the moment it's created, with no dependency on any other story.

**Independent Test**: Create a task titled "Book venue" from the board, setting all four fields in the create form, then open its detail view and confirm all four values are shown as set (with the description rendered from markdown, not as raw text).

**Acceptance Scenarios**:

1. **Given** the kanban board is open and no task "Book venue" exists, **When** I create a task titled "Book venue", setting due date "Aug 20, 2026", priority "High", effort "L", and description "**Urgent** — confirm with venue by Friday" in the create-task form, **Then** the card appears in the first lane, and its detail view shows due date "Aug 20, 2026", priority "High", effort "L", and the description rendered with "Urgent" in bold (not raw markdown).
2. **Given** the kanban board is open, **When** I create a task titled "Draft budget" leaving due date, priority, effort, and description blank, **Then** the task is created normally and its detail view shows all four fields in an unset state (e.g. "No due date", "No priority", "No effort", "No description"), each with a control to set it.

---

### User Story 2 - Edit fields from the task detail view (Priority: P2)

As Tyler, when I open a task's detail view, I want to set, change, or clear its due date, priority, effort, and description, so I can keep structured data current as plans change, without having to re-encode anything in the title.

**Why this priority**: Builds directly on Story 1 — most tasks are edited after creation as dates and priorities shift, so editing is the second most common path to the same data, but the feature is still valuable with only creation-time entry if this were dropped.

**Independent Test**: With an existing task that has no fields set, open its detail view, set a due date, and confirm it appears there and as a badge on the card face and survives a reload; then clear it and confirm it disappears from both places and survives a reload. Repeat the change (not just set/clear) flow for priority, effort, and change the description content, confirming persistence across reload for each.

**Acceptance Scenarios**:

1. **Given** task "Draft budget" exists with no fields set, **When** I open its detail view and set the due date to "Sep 5, 2026", **Then** the detail view shows "Sep 5, 2026", the card's face on the board now shows a due-date badge reading "Sep 5, 2026", and both are still true after a page reload.
2. **Given** task "Draft budget" has due date "Sep 5, 2026" set, **When** I clear the due date field, **Then** the detail view shows the due date as unset again, the due-date badge disappears from the card face, and both are still true after a page reload.
3. **Given** task "Book venue" has priority "High" and effort "L" set, **When** I open its detail view and change priority to "Urgent" and effort to "XL", **Then** the detail view shows priority "Urgent" and effort "XL" after reload, and the card face shows no priority or effort indicator (only a due-date badge is ever shown on the card face in this feature).
4. **Given** task "Book venue"'s detail view is open, **When** I set its description to a markdown string containing bold text, italic text, a hyperlink, and a two-item bulleted list, **Then** the rendered description shows the bold text as bold, the italic text as italic, the link as a hyperlink to its target URL, and a two-item bulleted list — not the raw markdown characters — and this survives a page reload.

---

### User Story 3 - Manage fields via MCP (Priority: P3)

As an authorized agent acting on Tyler's behalf, I want to set and read a task's due date, priority, effort, and description through the work-helper MCP tools, so automated workflows can populate and query structured task data without going through the UI.

**Why this priority**: Extends the same capability to the MCP surface. Valuable for automation and parity with the UI, but the feature already delivers its core value through Stories 1 and 2 without it — this is additive parity, not the primary path.

**Independent Test**: Call the MCP create-task tool with all four fields set for a new task, then call get-task and the board-listing tool and confirm both return the same four values; separately call update-task to change all four fields in one call and again to clear the due date, confirming each change is reflected; separately call update-task with an invalid priority value and confirm it is rejected without changing the task.

**Acceptance Scenarios**:

1. **Given** task "Book venue" exists, **When** an authorized agent calls the MCP tool to set its priority to "Critical" (not one of Low / Medium / High / Urgent), **Then** the call fails with a validation error and "Book venue"'s priority is unchanged.
2. **Given** no task "Ship report" exists, **When** an authorized agent calls the MCP create-task tool with title "Ship report", due date "2026-09-10", priority "Medium", effort "M", and description "Quarterly export", **Then** the task appears on the board, the MCP get-task and board-listing tools both return all four field values, and opening the task's detail view in the UI shows the same due date, priority, effort, and rendered description.
3. **Given** task "Ship report" has due date "2026-09-10", priority "Medium", effort "M", and a description set, **When** an authorized agent calls the MCP update-task tool changing all four fields in one call, and separately calls it again to clear the due date, **Then** the UI detail view reflects the changed priority, effort, and description, then shows the due date as unset after the second call — all still true after a page reload.

---

### Edge Cases

- A due date in the past is accepted with no special validation or warning — no value constraints apply to any of the four fields.
- A card with no due date set shows no badge on the card face; a card with a due date set shows a plain due-date badge with no urgency styling (no overdue/red styling, no relative-time wording), regardless of how close or overdue the date is.
- Priority and effort changes never appear on the card face in this feature — only the due-date badge does.
- An MCP call attempting to set priority or effort to a value outside the fixed lists is rejected with a validation error, and the task's existing values are left unchanged.
- Clearing a field (via UI or MCP) returns it to the unset state shown as "No due date" / "No priority" / "No effort" / "No description" in the detail view, and this persists across a page reload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support four optional fields on every task: due date (a plain calendar date, no time component), priority (one of Low / Medium / High / Urgent, in that increasing order), effort (one of S / M / L / XL, in that increasing order), and description (markdown-formatted text).
- **FR-002**: None of the four fields MUST have any value constraint beyond the fixed priority/effort option lists — any date (including past dates) is accepted for due date, and description accepts any markdown text.
- **FR-003**: The create-task form MUST let Tyler optionally set any or all of the four fields at task-creation time; leaving them blank MUST create the task successfully with all four fields unset.
- **FR-004**: The task detail view MUST display the current value of all four fields, and MUST show each field's unset state with a clear label (e.g. "No due date") and a control to set that field.
- **FR-005**: The task detail view MUST let Tyler set, change, or clear each of the four fields independently after task creation.
- **FR-006**: The description field MUST be rendered from markdown to formatted output (bold, italic, links, and bulleted lists at minimum) everywhere it is displayed, using the same rendering treatment as existing task notes.
- **FR-007**: Every change to any of the four fields MUST persist and MUST still be reflected correctly after a page reload.
- **FR-008**: The board's card face MUST show a due-date badge (a plain date string, no urgency styling or relative-time wording) when a task has a due date set, and MUST show no badge when it is unset. The card face MUST NOT show any indicator for priority, effort, or description in this feature.
- **FR-009**: The MCP create-task tool MUST accept all four fields as optional inputs.
- **FR-010**: The MCP update-task tool MUST accept all four fields as optional inputs in a single call, including the ability to explicitly clear a previously-set field.
- **FR-011**: The MCP get-task tool and the MCP board-listing tool MUST both return the current value of all four fields for each task.
- **FR-012**: MCP calls (create-task or update-task) that supply a priority or effort value outside the fixed option lists MUST fail with a validation error and MUST NOT change the task's existing field values.
- **FR-013**: The system MUST NOT migrate, infer, or bulk-populate these fields from existing task titles or board position for tasks created before this feature — the four fields simply start unset on pre-existing tasks.
- **FR-014**: The system MUST NOT alter, parse, or rewrite task titles as part of this feature — the title-encoded-deadline convention continues to coexist with the new native due-date field.

### Key Entities

- **Task**: The existing kanban card entity, extended with four new optional attributes — due date (date, no time), priority (ordered enum: Low, Medium, High, Urgent), effort (ordered enum: S, M, L, XL), and description (markdown text). All four are independent of the task's title and board position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can record a task's deadline, priority, and effort as structured data — settable and visible without reading or editing the task title — for 100% of newly created tasks.
- **SC-002**: A due date set on any task is visible on the board without opening the task, letting Tyler identify which of his tasks have a deadline at a glance.
- **SC-003**: Every field value set through the UI or through MCP is visible and correct from both surfaces — a value set via MCP shows correctly in the UI, and a value set via the UI is returned correctly by MCP query tools — with no discrepancy in 100% of checked cases.
- **SC-004**: An attempt to set an out-of-range priority or effort value via MCP is rejected before any data changes, with zero instances of an invalid value being silently stored.
- **SC-005**: A description written in markdown renders as formatted text (bold, italics, links, lists) rather than raw markdown syntax in 100% of cases, matching how task notes already render.

## Assumptions

- The description field reuses the same markdown rendering treatment already used for task notes elsewhere in the app, rather than introducing a new rendering path.
- "Authorized agent" for the MCP acceptance criteria means any client already permitted to call the work-helper MCP server today — this feature introduces no new authentication or authorization mechanism.
- The due-date badge on the card face uses a fixed, unstyled date string; no overdue/urgency styling, relative-time wording, sorting, or filtering by any of the four fields is in scope for this feature (tracked separately for future features: `kanban-card-indicators`, `kanban-lane-sorting`, `board-search-filter`, `up-next-dashboard`).
- No migration, backfill, or bulk-edit tooling is provided for existing tasks' title-encoded deadlines or position-implied priority; cleanup, if any, is manual and left to Tyler.
- This feature does not add any UI control for renaming a task's title (already covered by `mcp-note-tag-task-tools`) and does not add a due-before/due-date filter or query to any MCP tool (recorded as a future MCP feature idea).
- No authentication or multi-user access control changes are introduced by this feature.
