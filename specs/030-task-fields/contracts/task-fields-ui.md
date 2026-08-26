# Contract: UI elements for task-fields

## `CreateTaskForm.vue`

Extends the existing expanded form (currently title + note) with four more optional inputs, all inside the same `<form data-testid="add-task-form">`:

- Due date: `NDatePicker` (`type="date"`, `clearable`), `data-testid="create-task-due-date"`. Defaults to unset (`null`).
- Priority: `NSelect` (`clearable`), options from `taskPriorityValues` (`Low`/`Medium`/`High`/`Urgent`), `data-testid="create-task-priority"`. Defaults to unset.
- Effort: `NSelect` (`clearable`), options from `taskEffortValues` (`S`/`M`/`L`/`XL`), `data-testid="create-task-effort"`. Defaults to unset.
- Description: `NInput` (`type="textarea"`, matching the existing note field's `autosize` treatment), `data-testid="create-task-description"`. Defaults to empty (unset).

On submit, each field is included in the `POST /api/tasks` body only if it has a non-blank value (mirroring the existing `note` field's "only include if trimmed non-empty" behavior) — leaving all four blank creates the task with all four unset (FR-003, US1 acceptance scenario 2). On success, `reset()` clears all six inputs (title, note, and the four new ones) alongside the existing collapse-on-cancel behavior.

## `TaskFields.vue` (new component, mounted from `TaskDetail.vue`)

```ts
defineProps<{ taskId: number; dueDate: string | null; priority: TaskPriority | null; effort: TaskEffort | null; description: string | null }>();
defineEmits<{ 'update:fields': [fields: { dueDate: string | null; priority: TaskPriority | null; effort: TaskEffort | null; description: string | null }] }>();
```

Rendered as a new `<div class="task-detail-section">` in `TaskDetail.vue`, alongside the existing People/Companies/Emails/Notes/Tags sections (FR-004: each field shows its current value or a clear unset label with a control to set it).

### Due date

- Unset: label `data-testid="due-date-unset"` reading "No due date", plus the `NDatePicker` control (`clearable`) right beside it, `data-testid="due-date-picker"`.
- Set: the same picker pre-filled with the current value; the rendered value ("Sep 5, 2026") is what the picker itself displays — no separate read-only label needed once set.
- On `update:value` (including clearing via the picker's own clear affordance), immediately `PATCH /api/tasks/:id` with `{ dueDate: <'YYYY-MM-DD' | null> }`, no confirmation step (`research.md` R3).

### Priority / Effort

- Unset: label reading "No priority" / "No effort" (`data-testid="priority-unset"` / `"effort-unset"`), plus an `NSelect` (`clearable`) populated from `taskPriorityValues`/`taskEffortValues`, `data-testid="priority-select"` / `"effort-select"`.
- Set: the same select pre-filled with the current value.
- On `update:value` (including clearing), immediately `PATCH /api/tasks/:id` with `{ priority: <value | null> }` or `{ effort: <value | null> }`.

### Description

- Unset (`description === null`): label `data-testid="description-unset"` reading "No description", plus a button `data-testid="description-add-button"` reading "Add description" that enters edit mode.
- Set: the rendered markdown (`v-html`, via the existing `renderNoteMarkdown` from `src/client/utils/markdown.ts` — same treatment as `NoteItem.vue`'s note text, per FR-006/Assumptions) inside `data-testid="description-rendered"`, plus a button `data-testid="description-edit-button"` reading "Edit" that enters edit mode.
- Edit mode: an `NInput` textarea (`data-testid="description-textarea"`) pre-filled with the raw markdown text (empty if previously unset), plus `data-testid="description-save-button"` ("Save") and `data-testid="description-cancel-button"` ("Cancel") — mirroring `CompanyDetailPage.vue`'s rename control exactly (`research.md` R3).
  - **Save**: if the trimmed textarea value is empty, `PATCH` sends `{ description: null }` (clears — consistent with the create-form's blank-is-unset rule); otherwise sends `{ description: <raw textarea value> }` (untrimmed, matching how note text is stored raw). On success, exits edit mode back to rendered/unset view.
  - **Cancel**: discards textarea changes, exits edit mode back to the prior rendered/unset view with no request sent.

### Error handling

A single inline `role="alert"` region per field (or one shared region, implementer's choice in `tasks.md`) surfaces a failed `PATCH` — following the existing `laneError`/`archiveError` precedent in `TaskDetail.vue`. On failure, the control's value reverts to the last-known-good server value (no stuck-optimistic state), matching `http-api.md`'s UI consumption contract.

## `TaskCard.vue`

- When `task.dueDate !== null`: renders a plain badge, `data-testid="due-date-badge"`, containing the formatted date (via the new `formatDueDate()` client util) — no icon, no color coding, no "overdue"/relative-time wording (FR-008, Out of Scope).
- When `task.dueDate === null`: no badge at all — not an empty placeholder, nothing rendered.
- No priority/effort/description indicator is ever added to the card face in this feature (FR-008) — those props exist on `task` but are intentionally unused by `TaskCard.vue`.

## Visibility summary (ties FR-004, FR-008 together)

| Surface | Due date | Priority | Effort | Description |
| --- | --- | --- | --- | --- |
| Card face (`TaskCard.vue`) | plain badge when set, nothing when unset | never shown | never shown | never shown |
| Detail view (`TaskFields.vue`) | shown + editable, unset label + control | shown + editable, unset label + control | shown + editable, unset label + control | rendered markdown or unset label, Edit/Save/Cancel |
| Create form (`CreateTaskForm.vue`) | optional input | optional input | optional input | optional input |
