# Feature: task-fields

## User story

As Tyler, I want native due date, priority, effort, and description fields on a task — settable in the UI and via MCP — so that deadlines and priority live as real structured data instead of being encoded into the title text and the card's position in the Up Next lane.

## Acceptance criteria

All four fields are optional on every task: due date (a plain date, no time), priority (Low / Medium / High / Urgent, ordered), effort (S / M / L / XL, ordered), and description (markdown text, rendered the same way task notes are). None of the four have value constraints — any date (including past dates) and any of the listed priority/effort values are accepted. Setting or clearing a field is illustrative UI mechanics for `/speckit-plan` to decide (inline auto-save vs. an explicit save action); the criteria below describe the observable result, not the control.

- **Given** the kanban board is open and no task "Book venue" exists
  **When** I create a task titled "Book venue", setting due date "Aug 20, 2026", priority "High", effort "L", and description "**Urgent** — confirm with venue by Friday" in the create-task form
  **Then** the card appears in the first lane, and its detail view shows due date "Aug 20, 2026", priority "High", effort "L", and the description rendered with "Urgent" in bold (not raw markdown)

- **Given** the kanban board is open
  **When** I create a task titled "Draft budget" leaving due date, priority, effort, and description blank
  **Then** the task is created normally and its detail view shows all four fields in an unset state (e.g. "No due date", "No priority", "No effort", "No description"), each with a control to set it

- **Given** task "Draft budget" exists with no fields set
  **When** I open its detail view and set the due date to "Sep 5, 2026"
  **Then** the detail view shows "Sep 5, 2026", the card's face on the board now shows a due-date badge reading "Sep 5, 2026", and both are still true after a page reload

- **Given** task "Draft budget" has due date "Sep 5, 2026" set
  **When** I clear the due date field
  **Then** the detail view shows the due date as unset again, the due-date badge disappears from the card face, and both are still true after a page reload

- **Given** task "Book venue" has priority "High" and effort "L" set
  **When** I open its detail view and change priority to "Urgent" and effort to "XL"
  **Then** the detail view shows priority "Urgent" and effort "XL" after reload, and the card face shows no priority or effort indicator (only a due-date badge is ever shown on the card face in this feature)

- **Given** task "Book venue"'s detail view is open
  **When** I set its description to:

  ```
  **Urgent:** confirm with *venue* about [pricing](https://example.com/pricing)
  - confirm budget
  - send recap
  ```

  **Then** the rendered description shows "Urgent:" in bold, "venue" in italics, "pricing" as a hyperlink to https://example.com/pricing, and a two-item bulleted list — not the raw markdown characters — and this survives a page reload

- **Given** task "Book venue" exists
  **When** an authorized agent calls the MCP tool to set its priority to "Critical" (not one of Low / Medium / High / Urgent)
  **Then** the call fails with a validation error and "Book venue"'s priority is unchanged

- **Given** no task "Ship report" exists
  **When** an authorized agent calls the MCP create-task tool with title "Ship report", due date "2026-09-10", priority "Medium", effort "M", and description "Quarterly export"
  **Then** the task appears on the board, the MCP get-task and board-listing tools both return all four field values, and opening the task's detail view in the UI shows the same due date, priority, effort, and rendered description

- **Given** task "Ship report" has due date "2026-09-10", priority "Medium", effort "M", and a description set
  **When** an authorized agent calls the MCP update-task tool changing all four fields in one call, and separately calls it again to clear the due date
  **Then** the UI detail view reflects the changed priority, effort, and description, then shows the due date as unset after the second call — all still true after a page reload

- **Given** two cards on the board, "Book venue" with due date "Aug 20, 2026" set and "Draft budget" with no due date
  **When** I look at both cards on the board
  **Then** "Book venue" shows a plain due-date badge reading "Aug 20, 2026" and "Draft budget" shows no badge, with no priority, effort, or description indicator on either card face

## Out of scope

- Any styling on the due-date badge beyond a plain date — no overdue/red styling, no "Due today" or relative-time wording (companion to `up-next-dashboard`'s future ranking work; the badge is a fixed date string regardless of how close or overdue it is).
- Priority, effort, or description appearing on the card face — due date is the only field shown on the board card in this feature; the rest belong to the `kanban-card-indicators` future stub.
- Sorting or filtering the board (or the Up Next dashboard) by any of these fields — see the `kanban-lane-sorting`, `board-search-filter`, and `up-next-dashboard` future/existing docs, which this feature's fields are the natural but separate follow-on for.
- A due-before / due-date filter or query on any MCP tool — recorded as a companion idea in the `task-fields` audit notes for a future MCP feature.
- Migrating or bulk-editing existing tasks — tasks created before this feature keep whatever deadline text is in their title and whatever position implies their priority; the new fields simply start unset on them, with manual cleanup left to Tyler.
- Retiring or changing the title-encoded-deadline convention itself — this feature adds the native field alongside the title; it does not touch, parse, or rewrite existing titles.
- Any UI control for renaming a task's title — unrelated, already covered by `mcp-note-tag-task-tools`.
- Authentication / multi-user access control.

## Open questions

None remaining — all field shapes, surfaces, and scope resolved with Tyler during the feature interview (2026-08-26):

- Fields: due date (date only), priority (Low/Medium/High/Urgent), effort (S/M/L/XL), description (markdown) — all optional, no value constraints.
- Surfaces: create-task form, task detail view (editable), and MCP (create-task and update-task extended to accept all four fields; get-task and the board-listing tool return them) — no MCP-first exception.
- Card face: due-date badge only, plain date, no urgency styling; priority/effort/description stay off the card face in this slice.
- No migration or bulk-set tooling for existing tasks' title-encoded deadlines or position-implied priority.
