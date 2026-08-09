# Data Model: UI Refresh (009)

## Persistent data: no changes

This feature is presentation-layer only. **No database schema changes, no new entities, no changed fields, no migrations.** Tasks, lanes, placement, notes, people, contact entries, and email records are read and written exactly as today through the existing `/api` endpoints; the MCP server and its data access are untouched.

## Client view-state (ephemeral, per session — not persisted)

The refresh introduces a small amount of new in-memory UI state:

- **Add-task control state** (`CreateTaskForm.vue`): `expanded: boolean` (collapsed "+ Add task" button vs. open form), plus the existing `title`, `note`, `validationMessage` fields. Collapsing or cancelling resets all three; nothing is persisted.
- **Pending note deletion** (`TaskNotes.vue`): `noteIdPendingDeletion: number | null` — non-null while the confirm dialog is open; confirm triggers the existing delete request, cancel/dismiss resets to null with no request.
- **Active nav section** (`App.vue`): derived from the current route (`/` and `/tasks/*` → Board; `/people` and `/people/*` → People) — computed, not stored.
- **Theme**: constant. `darkTheme` plus the `GlobalThemeOverrides` object in `src/client/theme.ts`; no state, no toggle, no persistence.

Existing view-state (board data, `draggedTaskId`, drop index, save chain and error banner, form fields on People pages) is preserved unchanged.

## Validation rules

Unchanged in substance and location: `titleSchema` (shared Zod schema) still gates task creation client- and server-side; person field rules (names required, email/phone uniqueness, non-blank entries) are untouched. The only change is presentational — messages render inline adjacent to their input (FR-006).
