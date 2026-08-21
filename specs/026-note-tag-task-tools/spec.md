# Feature Specification: MCP Note, Tag & Task Tools

**Feature Branch**: `026-note-tag-task-tools`

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-note-tag-task-tools.md — the work-helper MCP lets an authorized agent delete a task note, manage the full tag vocabulary (create, rename, recolor, delete, attach, detach on people and tasks), and rename a task's title."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent deletes an outdated task note (Priority: P1)

Tyler asks an agent to clean up a task that has a stale or superseded note. The agent, acting as an authorized MCP client, deletes that one note by id. The task's other notes are untouched, and the deletion is visible immediately in both the task's detail view and the MCP's task-reading tool, surviving a page reload.

**Why this priority**: Notes accumulate as a task progresses; letting an agent remove an outdated one without Tyler opening the browser is the simplest, most self-contained capability in this feature and delivers value on its own.

**Independent Test**: Can be fully tested by seeding a task with two notes, calling delete-note with one note's id, and confirming only that note disappears from both the detail view and the task-reading tool, before and after a reload.

**Acceptance Scenarios**:

1. **Given** task "Draft Q3 goals" has two notes, "First note" (older) and "Second note" (newer), **When** an authorized agent calls delete-note with "Second note"'s id, **Then** the task's detail view shows only "First note", get-task's notes list no longer includes "Second note", and this is still true after a page reload.
2. **Given** task "Draft Q3 goals" has one note, "First note", **When** an authorized agent calls delete-note with a note id that doesn't exist, **Then** the call fails with a "note not found" error and "First note" is unchanged.

---

### User Story 2 - Agent builds and maintains the tag vocabulary (Priority: P1)

Tyler asks an agent to introduce a new tag, or to fix one that's outdated — a typo in its name or a color that no longer fits. The agent creates, renames, recolors, or deletes a tag, and the change is visible everywhere that tag appears: the Tags page, the tag-listing tool, and every person or task record it's attached to.

**Why this priority**: The tag vocabulary is the shared resource every attach/detach call depends on — an agent can't tag anything until tags exist, and can't fix a bad tag without rename, recolor, and delete. This is the core of the feature's tag support.

**Independent Test**: Can be fully tested by calling create-tag, rename-tag, recolor-tag, and delete-tag in sequence against a fresh tag, and confirming the resulting name, color, or absence shows correctly on the Tags page and the tag-listing tool at each step, surviving a reload.

**Acceptance Scenarios**:

1. **Given** no tag named "Renewal" exists, **When** an authorized agent calls create-tag with name "Renewal" and color "#F59E0B", then calls create-tag again with name "renewal" (different case), **Then** the first call creates the tag — it appears on the Tags page and in list-tags with color #F59E0B — and the second call fails with a validation error saying that tag name is already in use, matched case-insensitively, and no second tag is created.
2. **Given** no tags exist, **When** an authorized agent calls create-tag with name "Overdue" and no color, then calls create-tag again with an empty name, **Then** the first call creates "Overdue" with some assigned color, visible on the Tags page and in list-tags, and the second call fails with a validation error that a name is required, creating no tag.
3. **Given** the tag "Renewal" is attached to task "Book venue" and person "Jordan Smith", **When** an authorized agent calls rename-tag (by id) with new name "Contract renewal", then tries to rename it again to an empty string, **Then** the chip reads "Contract renewal" everywhere it appears — the Tags page, "Book venue", and Jordan Smith's record, still true after a reload — and the empty-name rename fails with a validation error, leaving the name "Contract renewal" unchanged.
4. **Given** the tag "Contract renewal" with its current color, **When** an authorized agent calls recolor-tag (by name) with color "#10B981", **Then** the chip renders in #10B981 on the Tags page, "Book venue"'s detail view, and Jordan Smith's record — all still true after a page reload.
5. **Given** the tag "Contract renewal" is attached to task "Book venue" and person "Jordan Smith", **When** an authorized agent calls delete-tag (by name) with no confirmation step, **Then** the call succeeds immediately, its response reports the tag was detached from 1 person and 1 task, and the tag is gone from the Tags page, list-tags, "Book venue"'s detail view, and Jordan Smith's record — all confirmed after a page reload; a second delete-tag call for the same (now-deleted) name fails with a not-found error.

---

### User Story 3 - Agent applies and removes tags on tasks and people (Priority: P1)

An agent tags a task or a person with an existing tag, or removes one that no longer applies, using either the tag's name or its id. Attaching never creates a tag on the fly — the tag must already exist — and detaching never deletes the tag itself, only the link to that one record.

**Why this priority**: Attach and detach are what make the tag vocabulary useful day to day — this is the action an agent takes most often once tags exist, and it must be safe (no accidental tag creation, no accidental tag deletion).

**Independent Test**: Can be fully tested by creating a tag, attaching it to a task by name and to a person by id, confirming both show the chip, then detaching it from the task and confirming the person keeps it and the tag itself still exists — all before and after a reload.

**Acceptance Scenarios**:

1. **Given** the tag "Renewal" exists and task "Book venue" and person "Jordan Smith" both exist untagged, **When** an authorized agent calls attach-tag for task "Book venue" using the tag's name "Renewal", and attach-tag for person "Jordan Smith" using the tag's id, **Then** "Book venue"'s detail view and Jordan Smith's record both show a "Renewal" chip in the same color, the Tags page still lists exactly one "Renewal" tag, and both attachments survive a page reload.
2. **Given** no tag named "Ghost" exists, **When** an authorized agent calls attach-tag on task "Book venue" with tag name "Ghost", and separately calls attach-tag with a task id that matches no task using the existing tag "Renewal", **Then** both calls fail — the first with an error saying no such tag exists (create-tag must be called first; there is no auto-create-on-attach), the second with a task-not-found error — and "Book venue"'s tags are unchanged.
3. **Given** task "Book venue" and person "Jordan Smith" are both tagged "Renewal", **When** an authorized agent calls detach-tag for task "Book venue" and tag "Renewal", **Then** "Book venue" shows no "Renewal" chip (still true after a reload), while Jordan Smith's record still shows "Renewal" and the Tags page still lists "Renewal" — detaching never deletes the tag.
4. **Given** a task or person already has a given tag attached, **When** an authorized agent calls attach-tag again for that same tag and record, **Then** the call succeeds as a no-op — the record still shows exactly one chip for that tag, with no duplicate attachment and no error.

---

### User Story 4 - Agent fixes a task's title (Priority: P2)

A deadline slips or a typo sticks in a card's title. Tyler asks an agent to correct it, and the agent renames the task directly — the fix shows up on the board, in the task's detail view, and through every MCP tool that reads task titles.

**Why this priority**: Valuable and self-contained, but narrower than the tag and note capabilities — a single field on a single entity, with no UI equivalent by design (this update is MCP-only for this slice).

**Independent Test**: Can be fully tested by calling update-task with a new title and confirming the board card, the detail view, get-task, and the board-listing tool all show the new title, before and after a reload.

**Acceptance Scenarios**:

1. **Given** a card "Book venue (due Aug 20)" in the "To Do" lane, **When** an authorized agent calls update-task with that task's id and title "Book venue (due Sept 5)", **Then** the kanban board shows the card as "Book venue (due Sept 5)" in the "To Do" lane, its detail view shows the new title, and get-task and the board-listing tool both return the new title — all still true after a page reload.
2. **Given** a card "Book venue", **When** an authorized agent calls update-task with an empty title, then with a whitespace-only title, then with a task id that matches no task, **Then** each call fails — the first two with a validation error that a title is required, the third with a not-found error — and "Book venue" is unchanged.

---

### Edge Cases

- Deleting a note by an id that doesn't exist: fails with a "note not found" error; no note on the task is affected (User Story 1, scenario 2).
- Renaming a task to an empty or whitespace-only title: rejected as a validation error; the task's title is unchanged (User Story 4, scenario 2).
- Creating a tag whose name matches an existing tag case-insensitively (e.g. "Renewal" vs. "renewal"): rejected as a validation error; no second tag is created (User Story 2, scenario 1).
- Creating a tag with an empty name: rejected as a validation error; no tag is created (User Story 2, scenario 2).
- Renaming a tag to an empty string: rejected as a validation error; the tag keeps its current name (User Story 2, scenario 3).
- Attaching a tag name that doesn't exist: rejected with an error saying no such tag exists; no tag is auto-created (User Story 3, scenario 2).
- Attaching or detaching a tag against a task id that matches no task: rejected with a task-not-found error; no tag state changes (User Story 3, scenario 2).
- Attaching a tag that's already attached to that task or person: succeeds as a harmless no-op — no duplicate chip, no error (User Story 3, scenario 4).
- Deleting a tag that's attached to records: the tag is detached from every person and task it was on, and the response reports how many of each (User Story 2, scenario 5).
- Deleting a tag by a name that no longer exists (e.g. calling delete-tag twice for the same tag): the second call fails with a not-found error (User Story 2, scenario 5).
- Every tag tool that targets an existing tag (attach, detach, rename, recolor, delete) accepts either the tag's id or its name, matched case-insensitively.
- Unauthenticated or unauthorized MCP calls: rejected by the existing mcp-authentik-auth flow before reaching any of these tools; no data changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The work-helper MCP MUST offer a delete-note tool that an authorized agent can call to permanently remove one task note by its id.
- **FR-002**: delete-note MUST reject a note id that matches no note with a "note not found" error, leaving every existing note unchanged.
- **FR-003**: The work-helper MCP MUST offer an update-task tool that an authorized agent can call to change one task's title, given the task's id and a new title.
- **FR-004**: update-task MUST reject an empty or whitespace-only title with a validation error that a title is required, leaving the task's current title unchanged.
- **FR-005**: update-task MUST reject a task id that matches no task with a not-found error.
- **FR-006**: The work-helper MCP MUST offer a create-tag tool accepting a required name and an optional color; when no color is given, the system MUST assign one automatically.
- **FR-007**: create-tag MUST reject a name that matches an existing tag's name case-insensitively with a validation error, creating no new tag.
- **FR-008**: create-tag MUST reject an empty name with a validation error that a name is required, creating no tag.
- **FR-009**: The work-helper MCP MUST offer a rename-tag tool that changes an existing tag's name, identified by either its id or its current name (matched case-insensitively).
- **FR-010**: rename-tag MUST reject an empty new name with a validation error, leaving the tag's current name unchanged.
- **FR-011**: The work-helper MCP MUST offer a recolor-tag tool that changes an existing tag's color, identified by either its id or its name (matched case-insensitively), accepting any color value.
- **FR-012**: The work-helper MCP MUST offer a delete-tag tool that permanently removes an existing tag, identified by either its id or its name (matched case-insensitively), with no confirmation step — the call itself is the deliberate act.
- **FR-013**: delete-tag MUST detach the tag from every person and task it was attached to as part of the same call, and its response MUST report how many people and how many tasks it was detached from.
- **FR-014**: delete-tag MUST reject a tag id or name that matches no existing tag with a not-found error.
- **FR-015**: The work-helper MCP MUST offer an attach-tag tool that links an existing tag, identified by either its id or its name (matched case-insensitively), to a task or a person.
- **FR-016**: attach-tag MUST reject a tag identifier that matches no existing tag with an error stating no such tag exists; it MUST NOT create a tag as a side effect.
- **FR-017**: attach-tag MUST reject a task or person identifier that matches no record with a not-found error.
- **FR-018**: attach-tag called for a tag and record that are already linked MUST succeed as a no-op — no duplicate link is created and no error is raised.
- **FR-019**: The work-helper MCP MUST offer a detach-tag tool that removes the link between an existing tag, identified by either its id or its name (matched case-insensitively), and a task or a person, without deleting the tag record itself or affecting the tag's link to any other record.
- **FR-020**: Every effect of delete-note, update-task, create-tag, rename-tag, recolor-tag, delete-tag, attach-tag, and detach-tag MUST be reflected identically everywhere that data is shown — the kanban board, task and person detail views, the Tags page, and every relevant MCP reading tool (get-task, list-tags, board-listing) — and MUST persist across a page reload.
- **FR-021**: All eight tools in this feature MUST be available only to authorized agents — MCP clients authenticated per the existing mcp-authentik-auth flow.
- **FR-022**: A failed call to any of these tools (validation or not-found) MUST have no partial effect — no note, task title, tag, or tag attachment changes as a result of a failed call.
- **FR-023**: The work-helper MCP MUST offer a list-tags reading tool that returns every tag with its name and color, mirroring the Tags page, so tag changes made by the tools above can be confirmed through MCP reads without the browser. list-tags is new supporting read infrastructure introduced by this feature (no such tool exists today), is not one of the eight write tools, and is available only to authorized agents per FR-021's authorization rule.

### Key Entities

- **Task note**: A free-text note attached to exactly one task; identified by its own id; delete-only through this feature (no edit-in-place).
- **Task title**: The display name of a task card; shown on the board and in the task's detail view; editable only through the update-task tool for this feature (no UI control).
- **Tag**: A named, colored label with a name (required, unique case-insensitively across all tags) and a color; independent of any task or person until attached; deleting a tag removes it and every attachment to it, but never the tasks or people it was attached to.
- **Tag attachment**: A link between one tag and one task or one person; many tags can attach to one record and one tag can attach to many records; detaching removes only that one link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can delete any single task note in one call, and the note disappears from every surface (detail view, get-task) immediately and after a reload, with the task's other notes always unaffected.
- **SC-002**: An agent can rename any task's title in one call, and the new title appears identically on the board, the detail view, get-task, and the board-listing tool, both immediately and after a reload.
- **SC-003**: An agent can create, rename, recolor, and delete a tag using either its id or its name, with every change appearing identically on the Tags page, in list-tags, and on every task or person the tag is attached to, both immediately and after a reload.
- **SC-004**: An agent can attach and detach a tag on a task or a person in one call each, with attach never creating a tag and detach never deleting one, and the resulting chip state matching across all surfaces before and after a reload.
- **SC-005**: 100% of invalid calls across all eight tools (duplicate or empty tag names, empty/whitespace titles, nonexistent note/task/tag identifiers) fail with the specified error content and leave every note, title, tag, and attachment completely unchanged.
- **SC-006**: Deleting a tag that is attached to N people and M tasks reports exactly N and M in its response and leaves zero dangling chips anywhere in the app.
- **SC-007**: Tyler can clean up a stale note, fix a tag, or correct a card's title from a conversation with an agent, with no manual correction needed in the browser afterward.

## Assumptions

- "An authorized agent" means an MCP client authenticated per the existing mcp-authentik-auth flow; no new authorization model is introduced.
- No MCP tool in this feature has a confirmation step or dry-run mode — the call itself is the deliberate act, matching the precedent set by mcp-move-tasks and mcp-people-tools.
- Attaching a tag that's already attached to that task or person succeeds as a harmless no-op rather than failing (confirmed default; flagged in the source feature doc as an assumption to confirm).
- Tag names, colors, note text, task titles, and person names used in acceptance scenarios (e.g. "Renewal", "Book venue", "Jordan Smith") are illustrative concrete test data, not fixed product content.
- No automatic audit note (e.g. "renamed via MCP") is written as a side effect of any of these tools, matching precedent from mcp-move-tasks and mcp-people-tools.
- Editing a note's text is out of scope — notes remain delete-only, per the existing task-notes feature.
- Notes on people are out of scope — no person-note model exists yet; delete-note only targets task notes.
- Merging tags, bulk tag operations, and tag metadata beyond name and color are out of scope, unchanged from the existing tags feature.
- Free-text tag search or filter, and tags appearing in the search-people or list-board tool responses, are deferred and out of scope for this feature.
- Deleting a person or a card via MCP remains out of scope — both are declined destructive powers, unrelated to this feature.
- A UI control for renaming a task's title is deliberately out of scope for this feature — update-task is MCP-only for this slice, a sanctioned exception to the MCP-mirrors-the-UI rule (precedent: create-task's MCP-only lane parameter); a UI title edit may follow later as its own feature.
- Constraining create-tag or recolor-tag's color to the UI's fixed auto-assign palette is out of scope — both tools accept any color value; the UI's palette is unaffected.
- Batch delete-note (multiple note ids in one call) is out of scope — one note id per call, matching the UI's one-at-a-time delete.
