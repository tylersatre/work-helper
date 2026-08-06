# Feature Specification: Task Notes

**Feature Branch**: `003-task-notes`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "@docs/product/features/task-notes.md — As Tyler, I want to add timestamped notes to a task — both when creating it and while viewing it — so that each task carries a running history of context and updates I can revisit later, without digging through email or memory."

## Clarifications

### Session 2026-08-06

- Q: Should notes created by an assistant via MCP be deletable in the app exactly like notes you added yourself? → A: Yes — any note can be deleted with the same confirmation prompt, regardless of source.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add and revisit notes on an existing task (Priority: P1)

Tyler opens a task's detail view, types a note into the add-note input, and submits. The note joins the task's running history — labeled with who added it and when — and is still there whenever he comes back, so the task itself holds the context he'd otherwise have to reconstruct from email or memory.

**Why this priority**: This is the core of the feature — a persistent, timestamped history attached to the task. Without it, nothing else (creation-time notes, markdown, deletion) has anything to build on.

**Independent Test**: Can be fully tested by opening any existing task's detail view, adding a note, reloading the page, and confirming the note is still listed with its label and timestamp. Delivers the running-history value on its own.

**Acceptance Scenarios**:

1. **Given** a task "Prep board deck" exists with no notes, **When** I open its detail view, type "Waiting on budget numbers" into the add-note input, and submit, **Then** the note appears in the notes list labeled "You" with a relative timestamp, and it is still there after a page reload (proving the note was persisted, not just held in browser state).
2. **Given** the detail view of a task that already has a note "First note" added a minute earlier, **When** I add a note "Second note", **Then** "Second note" appears above "First note" (notes are ordered newest first).
3. **Given** a task has a note whose stored UTC timestamp is exactly two days in the past (seeded via test setup), **When** I open the task's detail view, **Then** the note's timestamp reads "2 days ago", and hovering over it reveals the absolute date and time of that stored instant converted to the browser's local timezone (e.g. a note stored at 2026-08-04T18:00:00Z shows "Aug 4, 2026, 12:00 PM" in a browser running in America/Denver).
4. **Given** a task's detail view is open, **When** I submit the add-note input with empty or whitespace-only content, **Then** no note is added and I see a validation message telling me note text is required.

---

### User Story 2 - Capture the first note while creating a task (Priority: P2)

While creating a task on the kanban board, Tyler can optionally type an initial note into the create form. The task starts life already carrying its first piece of context — no second trip into the detail view needed.

**Why this priority**: Creation is the moment context is freshest ("kickoff call went well"). It builds directly on User Story 1's note history but is a distinct entry point, and the feature is still valuable without it.

**Independent Test**: Can be fully tested by creating one task with the note field filled and one with it blank, then opening each detail view to confirm the first shows exactly one note and the second shows an empty notes section with an add-note input.

**Acceptance Scenarios**:

1. **Given** the kanban board is open, **When** I create a task titled "Prep board deck" and type "Kickoff call went well" into the optional note field before submitting, **Then** the card appears in the "To Do" lane, and opening its task detail view shows one note reading "Kickoff call went well", labeled "You", with a relative timestamp reading "just now".
2. **Given** the kanban board is open, **When** I create a task titled "Book flights" leaving the note field blank, **Then** the task is created normally and its detail view shows a notes section with no note entries and an input for adding one.

---

### User Story 3 - Delete a note, with a safety net (Priority: P3)

Tyler can remove a note that no longer belongs (a mistake, a duplicate), but only after confirming — a confirmation prompt stands between a stray click and permanent loss.

**Why this priority**: Notes are deliberately not editable, so deletion is the only correction mechanism. It matters for keeping the history trustworthy, but the feature is usable without it.

**Independent Test**: Can be fully tested on a task with two notes by deleting one (confirming) and starting-then-cancelling a delete on the other, then reloading to verify the first stayed gone and the second stayed present.

**Acceptance Scenarios**:

1. **Given** a task has notes "First note" and "Second note", **When** I delete "First note" and confirm in the confirmation prompt, **Then** "First note" is gone from the list, "Second note" is unchanged, and "First note" is still gone after a page reload.
2. **Given** a task has a note "Keep me", **When** I start deleting it but cancel the confirmation prompt, **Then** "Keep me" is still in the notes list, unchanged.

---

### User Story 4 - Notes render basic markdown (Priority: P4)

Tyler writes notes in plain markdown and sees them rendered — bold, italics, links, lists, code — so a note can carry structure (an urgent flag, a checklist recap, a link to a doc) instead of being a wall of text.

**Why this priority**: A readability multiplier on top of the note history. Plain-text notes would still deliver the core value; formatting makes them nicer to revisit.

**Independent Test**: Can be fully tested by adding one note containing the basic markdown constructs and confirming each renders as formatting, not raw characters.

**Acceptance Scenarios**:

1. **Given** a task's detail view is open, **When** I add a note whose raw text is:

   ```
   **Urgent:** call *Sam* about [pricing](https://example.com/pricing) — see `deck.pdf`
   - confirm budget
   - send recap
   ```

   **Then** the rendered note shows "Urgent:" in bold, "Sam" in italics, "pricing" as a hyperlink to https://example.com/pricing, "deck.pdf" in code formatting, and a two-item bulleted list — not the raw markdown characters.

---

### User Story 5 - Every note shows where it came from (Priority: P5)

Each note is labeled with its origin: "You" for notes Tyler added through the app, "via MCP" for notes created by an assistant through the future work-helper MCP. When MCP tools arrive later, their notes will slot into the same history without any rework — this slice reserves and displays the source.

**Why this priority**: Forward-looking plumbing. Today only seeded data exercises the "via MCP" path, so it's last — but displaying it now means the note history is trustworthy about provenance from day one.

**Independent Test**: Can be fully tested by seeding a note with source "mcp" alongside a UI-added note and confirming the two distinct labels appear, each with its timestamp.

**Acceptance Scenarios**:

1. **Given** a task has a note stored with source "mcp" and text "Synced from assistant" (seeded via test setup, since no MCP tools exist yet) and a note I added myself through the UI, **When** I open the task's detail view, **Then** the seeded note is labeled "via MCP" and my note is labeled "You", each alongside its timestamp.

---

### Edge Cases

- Submitting the add-note input with only whitespace (spaces, tabs, newlines) is rejected the same as empty input — no note is created and the validation message appears.
- A note containing raw HTML or script-like text displays that content as inert text; it is never executed or allowed to alter the page.
- Deleting the only note on a task returns the detail view to the empty state: a notes section with no entries and the add-note input still available.
- A note whose age is exactly at a period boundary displays sensible relative time (e.g. "just now" immediately after adding, rolling over to minutes/hours/days as time passes), and the hover reveal always shows the exact stored instant in local time regardless of the relative bucket shown.
- A viewer in a different timezone than where the note was recorded sees the same instant converted to their own local timezone on hover — the stored moment never shifts.
- Markdown that is malformed or unclosed (e.g. a stray `**`) renders as ordinary text rather than breaking the note display or the rest of the list.
- Long notes and notes with code blocks display in full — all of a task's notes are always shown, with no truncation, search, or pagination.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The task creation form MUST include a single optional multiline note field; submitting the form with it filled creates the task with that text as its first note, attributed to the local user.
- **FR-002**: Submitting the task creation form with the note field blank MUST create the task normally with zero notes.
- **FR-003**: Every task detail view MUST show a notes section listing all of the task's notes and an input for adding a new note — including an empty list plus input when the task has no notes.
- **FR-004**: Users MUST be able to add a note from the task detail view, and every added note MUST be persisted so it survives a page reload.
- **FR-005**: Notes MUST be listed newest first.
- **FR-006**: Each note MUST record the moment it was created as a timezone-independent (UTC) instant, display that moment as a relative time (e.g. "just now", "2 days ago"), and reveal the absolute date and time converted to the viewer's local timezone on hover.
- **FR-007**: Each note MUST carry a source, displayed as a label on the note: "You" for notes added through the app's UI, "via MCP" for notes stored with source "mcp". This slice MUST reserve and display the source field even though nothing but test seeding can create "mcp" notes yet.
- **FR-008**: Note text MUST be rendered as markdown supporting exactly the basic set — bold, italic, links, bulleted and numbered lists, inline code, code blocks, and headings — with the raw markdown characters never shown in the rendered note.
- **FR-009**: Rendered note content MUST be safe: raw HTML or script content inside a note's text is displayed as text and never executed.
- **FR-010**: Submitting a note with empty or whitespace-only text MUST be rejected with a visible validation message stating that note text is required, and no note is created.
- **FR-011**: Users MUST be able to delete any note regardless of its source, guarded by a confirmation prompt; confirming permanently removes the note (persisted across reloads), cancelling leaves it untouched, and other notes are unaffected either way.
- **FR-012**: Notes MUST NOT be editable after creation — no edit affordance exists anywhere; corrections are made by adding a follow-up note or deleting.
- **FR-013**: The kanban card face MUST remain unchanged by this feature — no note count, badge, or icon appears on cards; notes are visible only in the task detail view.

### Key Entities

- **Note**: A single timestamped entry in a task's history. Attributes: the raw text as typed (markdown source), the creation instant (stored timezone-independent), and the source of creation ("ui" for the local user, "mcp" reserved for future assistant-created notes). Notes belong to exactly one task, are never edited, and can be deleted.
- **Task** *(existing)*: Gains an ordered history of zero or more notes. A task's other behavior — creation, lanes, card display — is unchanged except for the new optional note field at creation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open kanban board, Tyler can attach context to a task — either during creation via the optional field or from the detail view — in under 15 seconds, with no step required beyond typing the note and submitting.
- **SC-002**: 100% of added notes survive a page reload; no note is ever lost from browser state alone, and 100% of confirmed deletions likewise persist.
- **SC-003**: Every note in a detail view answers "who and when" at a glance — source label and relative time are visible without any interaction, and the exact local date/time is available with a single hover.
- **SC-004**: Zero notes are removed without explicit confirmation — a started-then-cancelled deletion leaves the history byte-for-byte unchanged.
- **SC-005**: A note using any construct in the supported markdown set renders as formatted content with zero raw markdown characters visible in the rendered output.
- **SC-006**: The kanban board renders identically before and after this feature — zero visual changes to card faces.

## Assumptions

- Deletion applies uniformly to every note regardless of source — MCP-seeded notes can be deleted exactly like the user's own, behind the same confirmation prompt (confirmed in clarification, 2026-08-06).
- "You" means the sole local user of this self-hosted app; there is no authentication or multi-user access control, so no per-user attribution beyond the source label is needed.
- The exact label copy ("You", "via MCP") is pinned for testability; Tyler may adjust wording at acceptance without this counting as a spec change.
- Relative timestamps follow common conventions between the two pinned points ("just now", "2 days ago") — seconds/minutes/hours/days buckets as appropriate; the pinned examples are the testable anchors.
- Notes with source "mcp" enter the system only via test seeding in this slice; the MCP tools that would create them are a separate future feature (see the `mcp-server` future stub).
- Note volume per task stays in personal-CRM range (tens, not thousands), so always showing all notes without pagination or search is acceptable.
- No explicit maximum note length is imposed; multiline notes of practical size are accepted.
- Out of scope, per the feature interview (2026-08-06): editing notes (permanent decision, not a deferral), any kanban card face change (see `kanban-card-indicators` stub), notes on people or other entities (see `person-notes` stub), live markdown preview while typing, extended markdown (tables, strikethrough, checkboxes, images), search/filter/pagination of notes, attachments, undo after confirmed delete, and authentication/multi-user.
