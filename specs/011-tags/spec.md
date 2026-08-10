# Feature Specification: Tags

**Feature Branch**: `011-tags`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: product feature doc `docs/product/features/tags.md` (tags as a first-class model — colored labels created on the fly, attached to both people and tasks, managed from one Tags page)

## Clarifications

### Session 2026-08-10

- Q: Which of the four assumptions flagged in the spec do you confirm as written? → A: Confirmed: no attach/detach confirmation, and no cap on tags per record. Changed: the Tags page must also offer tag creation, and the tag list is ordered by usage rather than alphabetically.
- Q: When you change a tag's color on the Tags page, what should the color choices be? → A: Preset palette swatches plus a custom option for entering any color.
- Q: When an agent fetches a person or task over MCP, what should each tag in the response include? → A: Names only — a simple list of tag names, no colors or ids.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tag people and tasks inline (Priority: P1)

As Tyler, while looking at a task or a person, I type a label like "VIP" into a tag input right on the detail view. If the tag doesn't exist yet I create it on the spot; if it does exist the input suggests it (matching regardless of letter case) and I pick it. The tag appears as a colored chip on that record — and because people and tasks share one tag vocabulary, the same tag can mark both. Removing a chip from a record only detaches it there; the tag itself and its other attachments are untouched.

**Why this priority**: This is the core value of the feature — marking cross-cutting context once and seeing it wherever the record appears. Without inline creation and attachment there is nothing to manage or expose elsewhere.

**Independent Test**: Can be fully tested by opening a task's detail view, creating a tag, attaching the same tag to a person via the suggestion, and removing it from the task — all without any Tags page existing.

**Acceptance Scenarios**:

1. **Given** a task "Follow up with Sam" exists and no tags exist, **When** I open the task's detail view, type "VIP" into its tag input, and choose the create option, **Then** a "VIP" chip appears on the task's detail view — still true after a page reload.
2. **Given** the tag "VIP" exists, attached to task "Follow up with Sam", and a person "Sam Rivera" exists with no tags, **When** I type "vip" (lowercase) into the tag input on Sam Rivera's record and select the suggested existing tag "VIP", **Then** Sam Rivera's record shows the "VIP" chip and the people-list row for Sam Rivera shows the "VIP" chip — the suggestion matched case-insensitively and no duplicate tag was created.
3. **Given** task "Follow up with Sam" has tag "VIP", which is also attached to person "Sam Rivera", **When** I create and attach a second tag "Q3" on the task's detail view, **Then** the task shows "VIP" and "Q3" chips in two visibly different auto-assigned colors, and the "VIP" chip renders in the same color on the task's detail view, Sam Rivera's record, and Sam Rivera's people-list row — all of this survives a page reload.
4. **Given** task "Follow up with Sam" has tags "VIP" and "Q3", and "VIP" is also attached to person "Sam Rivera", **When** I remove "VIP" from the task's detail view, **Then** the task shows only "Q3" (still true after a page reload), while "VIP" remains attached to Sam Rivera — detaching never deletes the tag.
5. **Given** tags exist, **When** I try to create a tag with an empty or whitespace-only name from a task's tag input, **Then** the attempt is rejected with the validation message "A name is required", and no tag is created.

---

### User Story 2 - Manage the tag vocabulary on a Tags page (Priority: P2)

As Tyler, I open a Tags page from the top navigation to see every tag in one place, listed most-used first. There I create new tags directly, rename tags, change their colors, and delete tags I no longer want. A rename or recolor shows up everywhere the tag is used. Deleting asks me to confirm — telling me how many people and tasks carry the tag — and on confirm the tag disappears from every record it was attached to.

**Why this priority**: Management keeps the vocabulary healthy (fixing typos, retiring labels, tuning colors), but it only matters once tags exist — it builds directly on User Story 1.

**Independent Test**: Can be fully tested by seeding a tag attached to one person and one task, then exercising create, rename, recolor, and delete from the Tags page and checking every surface where the tag appeared.

**Acceptance Scenarios**:

1. **Given** no tags exist, **When** I open the Tags page via a "Tags" link in the top navigation bar, **Then** the nav marks Tags as the active section and the page shows a styled empty-state message (e.g. "No tags yet") instead of a list.
2. **Given** no tags exist, **When** I create a tag "VIP" from a task's detail view, **Then** the Tags page lists "VIP" — still true after a page reload.
3. **Given** the Tags page is open, **When** I create a tag "Roadmap" using the page's create control, **Then** "Roadmap" appears in the tag list as a chip with an auto-assigned color, attached to nothing — still listed after a page reload.
4. **Given** tag "VIP" attached to two records, tag "Q3" attached to one record, and tags "Alpha" and "Beta" attached to nothing, **When** I open the Tags page, **Then** the tags are listed in the order "VIP", "Q3", "Alpha", "Beta" — most-attached first, with ties broken alphabetically by name.
5. **Given** the tag "VIP" attached to person "Sam Rivera" and task "Follow up with Sam", **When** I rename it to "Key client" on the Tags page, **Then** the chip reads "Key client" on the Tags page, the task's detail view, Sam Rivera's record, and Sam Rivera's people-list row, with no "VIP" chip left anywhere — and this survives a page reload.
6. **Given** tags "Key client" and "Q3" exist, **When** I try to rename "Key client" to "q3" on the Tags page, **Then** the attempt is rejected with the validation message "That tag name is already in use" (the match is case-insensitive), and no tag is renamed.
7. **Given** the tag "Q3" with its auto-assigned color, attached to task "Follow up with Sam", **When** I change "Q3" to a different preset palette color on the Tags page, and then change it again to a custom color not in the palette, **Then** after each change the "Q3" chip renders in the newly chosen color on both the Tags page and the task's detail view, and the final custom color survives a page reload.
8. **Given** the tag "Key client" attached to person "Sam Rivera" and task "Follow up with Sam", **When** I start deleting it on the Tags page and cancel, then start again and confirm, **Then** the confirmation is an in-app dialog stating the tag is attached to 1 person and 1 task; the cancel changes nothing anywhere, and the confirm removes "Key client" from the Tags page, Sam Rivera's record, Sam Rivera's people-list row, and the task's detail view — all still gone after a page reload.

---

### User Story 3 - Agents see tags on people and tasks (Priority: P3)

As Tyler, when an authorized agent (an MCP client authenticated per the mcp-authentik-auth flow) looks up a person or a task on my behalf, the response includes the record's tag names, so the agent has the same cross-cutting context I see in the app.

**Why this priority**: Extends the value of tags to the agent surface, but is a read-only add-on to data that User Stories 1 and 2 create and maintain.

**Independent Test**: Can be fully tested by tagging one person and one task in the app, then fetching each through the agent tools and checking the tags in the responses.

**Acceptance Scenarios**:

1. **Given** person "Sam Rivera" tagged "VIP" and task "Follow up with Sam" tagged "VIP" and "Q3", **When** an authorized agent fetches Sam Rivera's detail with the get-person tool and the task's detail with the get-task tool, **Then** the person response includes the tag name "VIP" and the task response includes the tag names "VIP" and "Q3" — names only, with no colors or ids.

---

### Edge Cases

- Typing a name into a tag input that case-insensitively matches an existing tag (e.g. "vip" when "VIP" exists): the existing tag is suggested; no create option is offered for a name that would duplicate it, so a duplicate can never be created from the input.
- Creating or renaming with a name that is empty or whitespace-only: rejected with the "A name is required" validation message; surrounding whitespace on an otherwise valid name is trimmed before saving and before uniqueness checks.
- Renaming a tag to a name already in use by another tag, in any letter casing: rejected with the "That tag name is already in use" validation message; renaming a tag to a different casing of its own name is allowed.
- Attaching a tag the record already carries: the input does not offer tags already attached to the current record, so the same tag cannot be attached twice to one record.
- Deleting a tag attached to nothing: the confirmation dialog still appears, stating it is attached to 0 people and 0 tasks.
- A record with many tags: there is no cap on tags per person or task; chips wrap onto additional lines as needed.
- More tags than distinct auto-assign colors: consecutive creations draw different palette colors, so back-to-back tags stay visibly distinct; colors may repeat across the wider vocabulary once the palette cycles. If the most recently created tag was manually recolored to a custom color, the next auto-assigned color differs from it by value, but visual distinctness from an arbitrary custom color is best-effort.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide tags as a single shared vocabulary: one tag record, with a name and a color, attachable to any number of people and any number of tasks simultaneously.
- **FR-002**: Tag names MUST be unique case-insensitively and MUST be non-empty after trimming surrounding whitespace; violations are rejected with a validation message ("A name is required" for empty/whitespace names, "That tag name is already in use" for case-insensitive duplicates) and leave tags and attachments unchanged.
- **FR-003**: Task detail views and person detail views MUST each offer a tag input that suggests existing tags matching the typed text case-insensitively, excluding tags already attached to that record, and offers a create option when the typed name does not case-insensitively match an existing tag.
- **FR-004**: Choosing the create option MUST create the tag and attach it to the current record in one step; selecting a suggestion MUST attach the existing tag without creating anything.
- **FR-005**: Every newly created tag MUST receive an auto-assigned color, and consecutively created tags MUST receive different auto-assigned colors, drawn from a palette whose adjacent entries are visibly distinct. If the most recently created tag's color was manually changed to a custom color, the next auto-assigned color MUST still differ from that custom color by value; visual distinctness is guaranteed only between auto-assigned palette colors.
- **FR-006**: Attached tags MUST render as colored chips showing the tag name on the task detail view, the person detail view, and the person's row in the people list, and a given tag MUST render in the same color on every surface where it appears.
- **FR-007**: The task detail view and person detail view MUST let the user detach a tag from that record; detaching MUST remove only that record's attachment, never the tag itself or its attachments to other records.
- **FR-008**: The top navigation bar MUST include a "Tags" link that opens a Tags page and marks Tags as the active section while on it.
- **FR-009**: The Tags page MUST list every tag with its name and color, ordered by usage — total attachments across people and tasks, most-attached first, ties broken alphabetically by name — and MUST show a styled empty-state message instead of a list when no tags exist.
- **FR-010**: The Tags page MUST allow renaming a tag, subject to the FR-002 validation rules; a successful rename MUST be reflected everywhere the tag appears.
- **FR-011**: The Tags page MUST allow changing a tag's color by picking one of the preset palette swatches (the same palette used for auto-assignment) or by entering a custom color; the new color MUST be reflected everywhere the tag appears.
- **FR-012**: The Tags page MUST allow deleting a tag behind an in-app confirmation dialog that states how many people and how many tasks the tag is attached to; cancelling MUST change nothing, and confirming MUST remove the tag and all of its attachments everywhere.
- **FR-013**: All tag data — tags, their names and colors, and their attachments — MUST persist, so every outcome above still holds after a page reload.
- **FR-014**: The get-person and get-task agent tools MUST include the record's tags in their responses for authorized agents (MCP clients authenticated per the mcp-authentik-auth flow), as a list of tag names only — no colors or ids.
- **FR-015**: The Tags page MUST also allow creating a new tag by name, subject to the FR-002 validation rules; the new tag receives an auto-assigned color per FR-005 and starts with no attachments.

### Key Entities

- **Tag**: A colored label in one shared vocabulary. Attributes: name (case-insensitively unique, non-empty) and color (auto-assigned at creation; editable afterwards to a preset palette color or a custom color). No other metadata — no description, and no usage count shown outside the delete confirmation.
- **Tag attachment**: The link between one tag and one person or one task. A tag has many attachments across both record types; a record carries at most one attachment per tag. Removing an attachment leaves the tag and its other attachments intact; deleting a tag removes all of its attachments.
- **Person** and **Task**: Existing records that gain tag attachments and display their tags as chips.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user on a task or person detail view can create a brand-new tag and see its chip on the record in one uninterrupted interaction without leaving the view — and can attach an existing tag the same way.
- **SC-002**: A tag shows identically — same name, same color — on 100% of the surfaces where it appears (Tags page, task detail views, person detail views, people-list rows), including after a page reload.
- **SC-003**: 100% of renames, recolors, and deletions performed on the Tags page are reflected on every surface where the affected tag appeared, verified after a page reload.
- **SC-004**: Attaching by typing an existing tag's name in any letter casing never creates a second tag record — the number of tags on the Tags page is unchanged by any number of such attachments.
- **SC-005**: 100% of invalid tag-name submissions (empty, whitespace-only, or a case-insensitive duplicate) are rejected with a visible validation message and produce no change to tags or attachments.
- **SC-006**: Detaching a tag from a record never removes it from any other record or from the vocabulary; deleting a tag from the Tags page removes it from every record that carried it.
- **SC-007**: An authorized agent fetching a tagged person or task receives that record's complete list of tag names, matching the tags the app shows on that record.

## Assumptions

- Attaching and detaching a tag need no confirmation — only deleting a tag from the Tags page confirms. (Confirmed 2026-08-10.)
- There is no cap on tags per person or task; chips wrap as needed. (Confirmed 2026-08-10.)
- The Tags page orders by usage without displaying the underlying attachment counts — counts still appear only in the delete confirmation. A newly created tag has zero attachments and therefore sorts among the zero-attachment tags alphabetically.
- Creating a tag from the Tags page auto-assigns its color just like inline creation — choosing a color at creation time remains out of scope.
- The auto-assign palette (its colors and size) is a planning decision; at the product level it only has to give consecutively created tags different auto-assigned colors from a palette whose adjacent entries are visibly distinct (a manual recolor to a custom color weakens the next creation's guarantee to different-by-value), and colors may repeat once the palette cycles.
- When the typed name case-insensitively matches an existing tag, the input offers only the existing tag (no create option for that name), which is how duplicate creation is prevented at the input.
- Tag inputs exclude tags already attached to the current record from their suggestions.
- Renaming a tag to a different casing of its own name (e.g. "VIP" → "Vip") is a permitted rename, not a duplicate.
- The attachment counts in the delete confirmation reflect the moment the dialog opens.
- Only the get-person and get-task agent tools gain tags in this slice, and they carry tag names only (no colors or ids); tag write/search tools and tags in other tool responses stay in the `mcp-tool-expansion` stub, per the feature doc's out-of-scope list.
- Out of scope, per the feature doc: filtering or searching by tag anywhere; tag chips on kanban card faces; tagging emails; custom fields; tag inputs on the create-person and create-task forms; choosing a color at creation time; usage counts on the Tags page list; bulk tagging, tag merging, tag descriptions or other metadata; authentication / multi-user access control.
