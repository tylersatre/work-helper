# Feature: mcp-note-tag-task-tools

## User story

As Tyler, I want the work-helper MCP to let an authorized agent delete a task note, manage the full tag vocabulary (create, rename, recolor, delete, attach, and detach tags on people and tasks), and rename a task's title, so that an agent can clean up outdated notes, keep tags current, and fix a card's title when a deadline slips or a typo sticks — all without me opening the browser.

## Acceptance criteria

"An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. No MCP tool has a confirmation step — the call itself is the deliberate act, matching the precedent set by mcp-move-tasks and mcp-people-tools. Tag tools mirror the validation already established by the `tags` feature: a tag name is required and unique case-insensitively; deleting a tag detaches it everywhere but never deletes the tag record's neighbors. Any tag tool that targets an existing tag (attach, detach, rename, recolor, delete) accepts either the tag's id or its name, matched case-insensitively. All note text, task titles, tag names, colors, person names, and ids below are illustrative concrete test data.

- **Given** task "Draft Q3 goals" has two notes, "First note" (older) and "Second note" (newer)
  **When** an authorized agent calls delete-note with "Second note"'s id
  **Then** the task's detail view shows only "First note", get-task's notes list no longer includes "Second note", and this is still true after a page reload

- **Given** task "Draft Q3 goals" has one note, "First note"
  **When** an authorized agent calls delete-note with a note id that doesn't exist
  **Then** the call fails with a "note not found" error and "First note" is unchanged

- **Given** a card "Book venue (due Aug 20)" in the "To Do" lane
  **When** an authorized agent calls update-task with that task's id and title "Book venue (due Sept 5)"
  **Then** the kanban board shows the card as "Book venue (due Sept 5)" in the "To Do" lane, its detail view shows the new title, and get-task and the board-listing tool both return the new title — all still true after a page reload

- **Given** a card "Book venue"
  **When** an authorized agent calls update-task with an empty title, then with a whitespace-only title, then with a task id that matches no task
  **Then** each call fails — the first two with a validation error that a title is required, the third with a not-found error — and "Book venue" is unchanged

- **Given** no tag named "Renewal" exists
  **When** an authorized agent calls create-tag with name "Renewal" and color "#F59E0B", then calls create-tag again with name "renewal" (different case)
  **Then** the first call creates the tag — it appears on the Tags page and in list-tags with color #F59E0B — and the second call fails with a validation error saying that tag name is already in use, matched case-insensitively, and no second tag is created

- **Given** no tags exist
  **When** an authorized agent calls create-tag with name "Overdue" and no color, then calls create-tag again with an empty name
  **Then** the first call creates "Overdue" with some assigned color, visible on the Tags page and in list-tags, and the second call fails with a validation error that a name is required, creating no tag

- **Given** the tag "Renewal" exists and task "Book venue" and person "Jordan Smith" both exist untagged
  **When** an authorized agent calls attach-tag for task "Book venue" using the tag's name "Renewal", and attach-tag for person "Jordan Smith" using the tag's id
  **Then** "Book venue"'s detail view and Jordan Smith's record both show a "Renewal" chip in the same color, the Tags page still lists exactly one "Renewal" tag, and both attachments survive a page reload

- **Given** no tag named "Ghost" exists
  **When** an authorized agent calls attach-tag on task "Book venue" with tag name "Ghost", and separately calls attach-tag with a task id that matches no task using the existing tag "Renewal"
  **Then** both calls fail — the first with an error saying no such tag exists (create-tag must be called first; there is no auto-create-on-attach), the second with a task-not-found error — and "Book venue"'s tags are unchanged

- **Given** task "Book venue" and person "Jordan Smith" are both tagged "Renewal"
  **When** an authorized agent calls detach-tag for task "Book venue" and tag "Renewal"
  **Then** "Book venue" shows no "Renewal" chip (still true after a reload), while Jordan Smith's record still shows "Renewal" and the Tags page still lists "Renewal" — detaching never deletes the tag

- **Given** the tag "Renewal" is attached to task "Book venue" and person "Jordan Smith"
  **When** an authorized agent calls rename-tag (by id) with new name "Contract renewal", then tries to rename it again to an empty string
  **Then** the chip reads "Contract renewal" everywhere it appears — the Tags page, "Book venue", and Jordan Smith's record, still true after a reload — and the empty-name rename fails with a validation error, leaving the name "Contract renewal" unchanged

- **Given** the tag "Contract renewal" with its current color
  **When** an authorized agent calls recolor-tag (by name) with color "#10B981"
  **Then** the chip renders in #10B981 on the Tags page, "Book venue"'s detail view, and Jordan Smith's record — all still true after a page reload

- **Given** the tag "Contract renewal" is attached to task "Book venue" and person "Jordan Smith"
  **When** an authorized agent calls delete-tag (by name) with no confirmation step
  **Then** the call succeeds immediately, its response reports the tag was detached from 1 person and 1 task, and the tag is gone from the Tags page, list-tags, "Book venue"'s detail view, and Jordan Smith's record — all confirmed after a page reload; a second delete-tag call for the same (now-deleted) name fails with a not-found error

## Out of scope

- Auto-creating a tag on attach — declined by Tyler: attach-tag requires the tag to already exist (by name or id); an agent must call create-tag first.
- A confirmation flag or dry-run step on delete-tag — declined: the MCP call is itself the deliberate act, matching delete-note's precedent; the response reports what was detached after the fact instead.
- Constraining create-tag/recolor-tag's color to the UI's fixed auto-assign palette — declined: both tools accept any color value (e.g. a hex code); the UI's palette is unaffected.
- Batch delete-note (multiple note ids in one call) — one note id per call, matching the UI's one-at-a-time delete.
- A UI control for renaming a task's title — deliberate, per the `mcp-update-task` stub: this is a sanctioned exception to the MCP-mirrors-the-UI rule (precedent: create-task's MCP-only lane parameter). update-task is MCP-only for this slice; a UI title edit can follow later as its own idea. The tag tools are not exceptions — create, rename, recolor, delete, attach, and detach all already exist as UI actions on the Tags page and detail views; these tools give agents the same power the UI already has.
- An automatic audit note (e.g. "renamed via MCP", "tagged via MCP") on any of these actions — declined, matching precedent from mcp-move-tasks and mcp-people-tools.
- Editing a note's text — notes remain delete-only, a permanent decision from `task-notes`.
- Notes on people — no person-note model exists yet; delete-note only targets task notes. See the `person-notes` future stub.
- Merging tags, bulk tag operations, or tag metadata beyond name and color — unchanged from the `tags` feature.
- Free-text tag search or filter, and tags in the search-people or list-board responses — still deferred, per the `mcp-tool-expansion` stub.
- Deleting a person or a card via MCP — both remain declined destructive powers, unrelated to this feature.

## Open questions

- **Assumption to confirm:** attaching a tag that's already attached to that entity succeeds as a harmless no-op (no duplicate attachment, no error) rather than failing. Flag if you'd rather it error.
- Tool names and exact response field shapes (e.g. how delete-tag reports detach counts) are `/speckit-plan` decisions; the criteria above hold either way.
