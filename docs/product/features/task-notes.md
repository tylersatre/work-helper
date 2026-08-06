# Feature: task-notes

## User story

As Tyler, I want to add timestamped notes to a task — both when creating it and while viewing it — so that each task carries a running history of context and updates I can revisit later, without digging through email or memory.

## Acceptance criteria

- **Given** the kanban board is open
  **When** I create a task titled "Prep board deck" and type "Kickoff call went well" into the optional note field before submitting
  **Then** the card appears in the "To Do" lane, and opening its task detail view shows one note reading "Kickoff call went well", labeled "You", with a relative timestamp reading "just now"

- **Given** the kanban board is open
  **When** I create a task titled "Book flights" leaving the note field blank
  **Then** the task is created normally and its detail view shows a notes section with no note entries and an input for adding one

- **Given** a task "Prep board deck" exists with no notes
  **When** I open its detail view, type "Waiting on budget numbers" into the add-note input, and submit
  **Then** the note appears in the notes list labeled "You" with a relative timestamp, and it is still there after a page reload (proving the note was persisted, not just held in browser state)

- **Given** the detail view of a task that already has a note "First note" added a minute earlier
  **When** I add a note "Second note"
  **Then** "Second note" appears above "First note" (notes are ordered newest first)

- **Given** a task has a note whose stored UTC timestamp is exactly two days in the past (seeded via test setup)
  **When** I open the task's detail view
  **Then** the note's timestamp reads "2 days ago", and hovering over it reveals the absolute date and time of that stored instant converted to the browser's local timezone (e.g. a note stored at 2026-08-04T18:00:00Z shows "Aug 4, 2026, 12:00 PM" in a browser running in America/Denver)

- **Given** a task's detail view is open
  **When** I add a note whose raw text is:

  ```
  **Urgent:** call *Sam* about [pricing](https://example.com/pricing) — see `deck.pdf`
  - confirm budget
  - send recap
  ```

  **Then** the rendered note shows "Urgent:" in bold, "Sam" in italics, "pricing" as a hyperlink to https://example.com/pricing, "deck.pdf" in code formatting, and a two-item bulleted list — not the raw markdown characters

- **Given** a task has a note stored with source "mcp" and text "Synced from assistant" (seeded via test setup, since no MCP tools exist yet) and a note I added myself through the UI
  **When** I open the task's detail view
  **Then** the seeded note is labeled "via MCP" and my note is labeled "You", each alongside its timestamp

- **Given** a task's detail view is open
  **When** I submit the add-note input with empty or whitespace-only content
  **Then** no note is added and I see a validation message telling me note text is required

- **Given** a task has notes "First note" and "Second note"
  **When** I delete "First note" and confirm in the confirmation prompt
  **Then** "First note" is gone from the list, "Second note" is unchanged, and "First note" is still gone after a page reload

- **Given** a task has a note "Keep me"
  **When** I start deleting it but cancel the confirmation prompt
  **Then** "Keep me" is still in the notes list, unchanged

## Out of scope

- Editing a note after it's added — notes are delete-only by deliberate decision; to correct something, add a follow-up note. (A permanent call for history integrity, not a deferral.)
- Any change to the kanban card face (note count badge, icons) — the board rendering is unchanged; see the `kanban-card-indicators` future stub.
- The work-helper MCP tools that would create notes with source "mcp" — no MCP server exists yet; this slice only reserves and displays the source field. See the `mcp-server` future stub.
- Notes on people or any other entity — task notes only in this slice. See the `person-notes` future stub.
- Live markdown preview while typing — you type raw markdown into a plain input; it renders after the note is added.
- Markdown beyond the basic set (tables, strikethrough, checkbox task lists, embedded images) — bold, italic, links, lists, inline code, code blocks, and headings only.
- Search, filter, or pagination of notes — all of a task's notes are always shown.
- Attachments or image uploads.
- Undo after a confirmed delete.
- Authentication / multi-user access control — "You" means the sole local user.

## Open questions

All resolved with Tyler during the feature interview (2026-08-06):

- Are notes an editable field or a history of entries?
  - A history of timestamped entries. Notes can be deleted (with a confirmation prompt) but never edited.
- How does adding a note at creation work?
  - The create-task form gains a single optional multiline note field; filling it in creates the task's first note.
- Does the board change?
  - No — cards look exactly as they do now; notes live only in the task detail view.
- How is the source shown?
  - Every note is labeled with its source: "You" for UI-added notes, "via MCP" for notes with source "mcp". Exact label copy was pinned for testability; Tyler can adjust wording at acceptance.
- Timestamp display?
  - Stored UTC everywhere; displayed as relative time ("just now", "2 days ago") with the absolute local date/time shown on hover.
- Note order?
  - Newest first.
- Markdown extent?
  - The basic set: bold, italic, links, bulleted/numbered lists, inline code, code blocks, headings.
- **Assumption to confirm:** deletion applies to any note regardless of source — MCP-added notes can be deleted the same way as your own. Flag if MCP notes should be protected.
