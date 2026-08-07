# Task Notes - Evidence

Feature: 003-task-notes
Date tested: 2026-08-06
Base URL: http://localhost:5173
Browser timezone: America/Denver (set via CDP Emulation.setTimezoneOverride before navigation)

This file documents browser-driven verification of the acceptance criteria in docs/product/features/task-notes.md and specs/003-task-notes/spec.md. Screenshots referenced below live alongside this file in docs/evidence/task-notes/.

## Update history

1. First pass had no Bash/shell tool available, so three scenarios requiring raw SQL seeds against data/work-helper.db could not be exercised and were marked BLOCKED.
2. The coordinator seeded three rows directly against the running dev DB. Re-verification found two PASS cleanly; the third (note id 11, "Timezone check note") failed against its pinned literal because the seeded created_at (1754331600000) actually corresponded to 2025-08-04T18:20:00Z, not the intended 2026-08-04T18:00:00Z — a one-year-and-20-minute seed data error, confirmed via new Date(1754331600000).toISOString() in-browser. Reported as FAIL with full root-cause detail, not fabricated as PASS.
3. The coordinator corrected note id 11's created_at to 1785866400000 (the verified-correct epoch for 2026-08-04T18:00:00Z). Re-verified below: now PASS. All 20 checks PASS.

## Scenario 1 - US1: add & revisit

### Create "Follow up with Sam" with no note, then add a note from the detail view

Given the kanban board is open, when Tyler creates a task titled "Follow up with Sam" via the create-task form with no note and opens its detail view, then types "Waiting on budget numbers" into the note field and submits, then the note appears labeled "You" with a relative timestamp ("just now").

Result: PASS

The task was created on the board (card appeared in "To Do" with just the title). Opening its detail view (/tasks/1) showed an empty notes list with an add-note input. Typing "Waiting on budget numbers" and clicking "Add note" produced a note reading "Waiting on budget numbers", labeled "You", with time text "just now", and a "Delete" button (no edit control).

Timing evidence toward SC-001: the note add interaction itself (fill input, click Add note, wait for the note text to become visible in the DOM) measured 77ms via Playwright's precise Date.now() timing around the fill/click/wait — orders of magnitude under the 15-second budget.

Evidence: us1-scenario1-note-added-you-just-now.png

### Reload persists the note

Given "Waiting on budget numbers" was just added, when Tyler reloads the page, then the note is still shown.

Result: PASS

A full navigation reload of /tasks/1 still showed the note "Waiting on budget numbers", labeled "You", "just now" (a real reload, proving server-side persistence, not just in-memory state).

Evidence: us1-scenario1-note-persists-after-reload.png

### Second note appears above the first (newest first)

Given the task already has "Waiting on budget numbers", when Tyler adds "Second note", then "Second note" appears above "Waiting on budget numbers".

Result: PASS

After submitting "Second note", the notes list order (top to bottom) was: "Second note", then "Waiting on budget numbers" — newest first confirmed.

Evidence: us1-scenario1-second-note-newest-first.png

### 2-days-old seeded note shows "2 days ago" and correct hover title

Given a task has a note whose stored UTC timestamp is exactly two days in the past (seeded via raw SQL against data/work-helper.db), when Tyler opens the task's detail view, then the note's timestamp reads "2 days ago" and hovering over it reveals the absolute local date/time.

Result: PASS

The coordinator seeded note id 10, text "Old note", on task 1, with created_at set to exactly 2 days before seed time. Reloading /tasks/1 showed this note labeled "You" with relative time text "2 days ago" exactly as required. DOM inspection of the note's <time> element confirmed datetime="2026-08-04T21:11:14.000Z" and title="Aug 4, 2026, 3:11 PM" — a correctly formatted absolute local (America/Denver) date/time, present as the native title attribute that drives the hover tooltip.

Evidence: us1-scenario1-two-days-ago-note.png, us1-scenario1-two-days-ago-hover.png

### Timezone-check note hover title reads "Aug 4, 2026, 12:00 PM"

Given a task has a note stored at exactly 2026-08-04T18:00:00Z, when Tyler hovers its timestamp, then the title reads "Aug 4, 2026, 12:00 PM" (America/Denver).

Result: PASS

This check went through three rounds. Round 1: no shell tool available, could not seed the row, marked BLOCKED. Round 2: the coordinator seeded note id 11 with created_at = 1754331600000, described as "2026-08-04T18:00:00Z"; reloading showed the hover title as "Aug 4, 2025, 12:20 PM" and datetime="2025-08-04T18:20:00.000Z" — verified via new Date(1754331600000).toISOString() that the epoch actually corresponds to 2025-08-04T18:20:00Z, not 2026-08-04T18:00:00Z, so this was correctly reported as FAIL against the pinned literal (a seed-data error, not an app defect, since the app's conversion of whatever instant was actually stored was itself correct). Round 3: the coordinator corrected note id 11's created_at to 1785866400000. Reloading /tasks/1 now shows this note with relative text "2 days ago" and, on inspection of its <time> element, datetime="2026-08-04T18:00:00.000Z" and title="Aug 4, 2026, 12:00 PM" — an exact match to the pinned literal. The title string was character-code-checked (every character is a normal ASCII space, code point 32; no U+202F narrow no-break space is present, so no normalization was even necessary here, though the mechanism was checked for it).

Evidence: us1-scenario1-exact-utc-hover-title.png (this round's screenshot overwrites the earlier FAIL-round screenshot of the same name, per the coordinator's instruction)

### Whitespace-only note is rejected

Given the detail view is open, when Tyler submits the add-note input with whitespace-only content, then a validation message "Note text is required" appears and no note is added.

Result: PASS

Submitting three spaces produced the validation message "Note text is required" and the notes list remained unchanged - no new note was added.

Evidence: us1-scenario1-whitespace-validation.png

## Scenario 2 - US2: creation-time note

### Create "Prep board deck" with note "Kickoff call went well"

Given the kanban board is open, when Tyler creates a task "Prep board deck" with note "Kickoff call went well" filled in on the create form, then the card appears in "To Do", and opening its detail view shows exactly one note, "You", "just now".

Result: PASS

The card "Prep board deck" appeared in "To Do" showing only its title. Opening its detail view (/tasks/2) showed exactly one note reading "Kickoff call went well", labeled "You", with relative time "just now".

Evidence: us2-scenario1-prep-board-deck-card.png, us2-scenario1-prep-board-deck-detail-one-note.png

### Create "Book flights" with the note field left blank

Given the kanban board is open, when Tyler creates a task "Book flights" leaving the note field blank, then its detail view shows an empty notes section with the add-note input still present.

Result: PASS

The task "Book flights" was created normally. Its detail view (/tasks/3) showed an empty notes list and the "Note" add-note input with "Add note" button still present.

Evidence: us2-scenario2-book-flights-empty-notes-section.png

### Kanban board and card faces are unchanged - no note count, badge, or icon

Given tasks with and without notes exist on the board, when Tyler views the board, then no card shows a note count, badge, or icon.

Result: PASS

The board with 4 cards ("Follow up with Sam" with several notes, "Prep board deck" with 1 note, "Book flights" with 0 notes, plus "Delete-note test task") rendered each card as plain text with only its title - no count/badge/icon of any kind on any card regardless of note count.

Evidence: us2-scenario2-board-unchanged-card-faces.png

## Scenario 3 - US3: delete with safety net

### Delete "Second note" (confirm) - sibling untouched, persists after reload

Given "Follow up with Sam" has notes "Second note" and "Waiting on budget numbers", when Tyler deletes "Second note" and accepts the confirm dialog, then "Second note" is gone, "Waiting on budget numbers" is untouched, and this persists after a reload.

Result: PASS

Clicking "Delete" on "Second note" triggered a native confirm() dialog with message "Delete this note?", accepted via Playwright's dialog API. "Second note" was removed; "Waiting on budget numbers" remained unchanged. A full reload confirmed the deletion persisted and the sibling note was still present.

Evidence: us3-scenario1-second-note-deleted-confirmed.png, us3-scenario1-deleted-note-gone-after-reload.png

### Start deleting, then dismiss the confirm dialog - note unchanged

Given "Waiting on budget numbers" exists, when Tyler clicks Delete but dismisses the confirm dialog, then the note is still present, unchanged.

Result: PASS

Clicking "Delete" triggered the same confirm dialog; it was dismissed. The note remained in the list afterward, unchanged.

Evidence: us3-scenario2-delete-cancelled-note-unchanged.png

### Deleting the only note returns to the empty state

Given a new task is created with exactly one note, when Tyler deletes that note and confirms, then the notes section returns to the empty state with the add-note input still present.

Result: PASS

Created "Delete-note test task" with note "Keep me" (exactly one note). Deleting it (confirmed) returned the notes list to empty with the add-note input still present and usable.

Evidence: us3-scenario3-notes-empty-state-after-delete.png

## Scenario 4 - US4: markdown

### Bold, italic, link, inline code, bulleted list

Given a task's detail view is open, when Tyler adds a note with bold, italic, a link, inline code, and a two-item bulleted list, then each renders as formatted content with zero raw markdown characters visible.

Result: PASS

The rendered note showed "Urgent:" in bold (<strong>), "Sam" in italics (<em>), "pricing" as a hyperlink with href="https://example.com/pricing", "deck.pdf" in a <code> element, and a two-item <ul> list. DOM inspection confirmed zero raw markdown characters visible.

Evidence: us4-scenario1-markdown-bold-italic-link-code-list.png

### Heading, numbered list, fenced code block

Given a task's detail view is open, when Tyler adds a note with a "## Recap" heading, a two-item numbered list, and a fenced code block, then each renders as its formatted element.

Result: PASS

Rendered as an <h2> heading "Recap", a real <ol> element with items "First"/"Second", and a fenced code block rendered as <pre><code>console.log("hi")</code></pre>.

Evidence: us4-scenario2-heading-ordered-list-code-block.png

### Raw HTML / script content renders as inert text

Given a task's detail view is open, when Tyler adds a note containing <script>alert(1)</script> and <img onerror=alert(1) src=x>, then it renders as inert literal text with no popup and no actual script/img element in the DOM.

Result: PASS

No dialog/alert fired. DOM inspection confirmed 0 script elements and 0 img elements inside the note; the content rendered as literal escaped text inside a <p> element.

Evidence: us4-scenario3-xss-note-rendered-inert.png

### Stray unclosed ** renders as ordinary text

Given a task's detail view is open, when Tyler adds a note "Reminder: **finish the report" (unclosed bold marker), then it renders as ordinary text without breaking the notes list.

Result: PASS

Rendered as plain text; the rest of the notes list remained intact and correctly rendered.

Evidence: us4-scenario4-unclosed-bold-markdown-ordinary-text.png

### Long note with a substantial fenced code block displays in full

Given a task's detail view is open, when Tyler adds a long note with a 16-line fenced code block, then it displays in full, untruncated.

Result: PASS

DOM inspection of the rendered <pre><code> element confirmed all 16 lines were present verbatim, with no truncation.

Evidence: us4-scenario5-long-code-block-full.png

## Scenario 5 - US5: provenance labels

### Seeded "mcp" note shows "via MCP" label

Given a task has a note stored with source "mcp" and a note added via the UI, when Tyler opens the task's detail view, then the seeded note shows "via MCP" and the UI-added note shows "You".

Result: PASS

The coordinator seeded note id 12, text "Synced from assistant", source "mcp", on task 3 ("Book flights"). Reloading /tasks/3 showed this note labeled "via MCP" while all five other notes on the same task (added earlier through the UI) showed "You", each with its own timestamp.

Evidence: us5-scenario1-mcp-note-via-mcp-label.png

### Delete the "via MCP" note behind the same confirm dialog

Given the "via MCP" note exists, when Tyler clicks Delete and confirms, then it is deleted exactly like a "You" note, and siblings are untouched.

Result: PASS

Clicking "Delete" on the "via MCP" note triggered the identical native confirm() dialog ("Delete this note?"). Accepting it produced a DELETE /api/tasks/3/notes/12 request that returned 204 No Content; the note disappeared from the list immediately, and all five sibling "You" notes remained untouched. A reload of /tasks/3 confirmed the deletion persisted.

Evidence: us5-scenario1-mcp-note-deleted.png

## Cross-cutting check: no edit affordance anywhere

Result: PASS

Across every task detail view visited in this run (4 tasks, a dozen+ notes of varying content and source, including the seeded "2 days ago", timezone-check, and "via MCP" notes), every note showed exactly a source label, a timestamp, its rendered text, and a single "Delete" button - no "Edit" button, no editable textarea, and no click-to-edit affordance was present on any existing note at any point. Notes are strictly add/delete, matching FR-012.

## Summary

| # | Scenario | Result |
|---|---|---|
| US1 | Add note from detail view, labeled "You", "just now" | PASS |
| US1 | Note persists after reload | PASS |
| US1 | Second note appears above first (newest first) | PASS |
| US1 | 2-days-old seeded note shows "2 days ago" + hover title | PASS |
| US1 | Exact-UTC seeded note hover shows "Aug 4, 2026, 12:00 PM" | PASS |
| US1 | Whitespace-only note rejected with validation message | PASS |
| US2 | Create task with note - card + detail view show one note | PASS |
| US2 | Create task with blank note - empty notes section + input | PASS |
| US2 | Board/card faces unchanged - no count/badge/icon | PASS |
| US3 | Delete note (confirm) - sibling untouched, persists on reload | PASS |
| US3 | Delete note (dismiss) - note unchanged | PASS |
| US3 | Delete the only note - returns to empty state | PASS |
| US4 | Bold/italic/link/code/bulleted list render correctly | PASS |
| US4 | Heading/numbered list/fenced code block render correctly | PASS |
| US4 | Raw HTML/script renders inert, no execution | PASS |
| US4 | Unclosed ** renders as ordinary text, list intact | PASS |
| US4 | Long fenced code block displays in full | PASS |
| US5 | Seeded "mcp" note shows "via MCP" label | PASS |
| US5 | Delete a "via MCP" note like any other | PASS |
| Cross-cutting | No edit affordance anywhere on any note | PASS |

## Overall

20 of 20 acceptance checks PASS, all fully driven through the real UI with screenshot and/or DOM evidence, browser timezone pinned to America/Denver throughout.

The "exact UTC instant" hover-title check went through three rounds before reaching this result: BLOCKED (no shell tool to seed) -> FAIL (coordinator's first seed used the wrong epoch, 1754331600000, which is actually 2025-08-04T18:20:00Z not 2026-08-04T18:00:00Z - correctly reported as a seed-data error, not an app defect, since the app rendered the wrong-but-actually-stored instant correctly) -> PASS (coordinator corrected the seed to 1785866400000, the verified-correct epoch for 2026-08-04T18:00:00Z; reload now shows datetime="2026-08-04T18:00:00.000Z" and hover title "Aug 4, 2026, 12:00 PM", an exact match to the pinned literal, with no U+202F normalization even needed since the title contains only plain ASCII spaces).

No application code was modified during this verification.
