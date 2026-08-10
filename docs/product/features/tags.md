# Feature: tags

## User story

As Tyler, I want tags as a first-class model — colored labels I create on the fly and attach to both people and tasks, with one Tags page to manage the vocabulary — so that cross-cutting context like "VIP" or "Q3" is marked once and visible wherever those records appear, instead of being buried in notes or memory.

## Acceptance criteria

Tags are one shared vocabulary: the same tag record can be attached to people and to tasks. "An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. All tag names, people, and task titles are illustrative concrete test data.

- **Given** no tags exist
  **When** I open the Tags page via a "Tags" link in the top navigation bar
  **Then** the nav marks Tags as the active section and the page shows a styled empty-state message (e.g. "No tags yet") instead of a list

- **Given** a task "Follow up with Sam" exists and no tags exist
  **When** I open the task's detail view, type "VIP" into its tag input, and choose the create option
  **Then** a "VIP" chip appears on the task's detail view and the Tags page lists "VIP" — both still true after a page reload

- **Given** the tag "VIP" exists, attached to task "Follow up with Sam", and a person "Sam Rivera" exists with no tags
  **When** I type "vip" (lowercase) into the tag input on Sam Rivera's record and select the suggested existing tag "VIP"
  **Then** Sam Rivera's record shows the "VIP" chip, the people-list row for Sam Rivera shows the "VIP" chip, and the Tags page still lists exactly one tag — the suggestion matched case-insensitively and no duplicate was created

- **Given** task "Follow up with Sam" has tag "VIP", which is also attached to person "Sam Rivera"
  **When** I create and attach a second tag "Q3" on the task's detail view
  **Then** the task shows "VIP" and "Q3" chips in two visibly different auto-assigned colors, the "VIP" chip renders in the same color on the task's detail view, Sam Rivera's record, and Sam Rivera's people-list row, and all of this survives a page reload

- **Given** task "Follow up with Sam" has tags "VIP" and "Q3", and "VIP" is also attached to person "Sam Rivera"
  **When** I remove "VIP" from the task's detail view
  **Then** the task shows only "Q3" (still true after a page reload), while "VIP" remains attached to Sam Rivera and still appears on the Tags page — detaching never deletes the tag

- **Given** the tag "VIP" attached to person "Sam Rivera" and task "Follow up with Sam"
  **When** I rename it to "Key client" on the Tags page
  **Then** the chip reads "Key client" on the Tags page, the task's detail view, Sam Rivera's record, and Sam Rivera's people-list row, with no "VIP" chip left anywhere, and this survives a page reload

- **Given** tags "Key client" and "Q3" exist
  **When** I try to create a tag with an empty or whitespace-only name from a task's tag input, and then try to rename "Key client" to "q3" on the Tags page
  **Then** both attempts are rejected with a validation message (a name is required; that tag name is already in use, matched case-insensitively), and no tag was created or renamed

- **Given** the tag "Q3" with its auto-assigned color, attached to task "Follow up with Sam"
  **When** I change "Q3" to a different color on the Tags page
  **Then** the "Q3" chip renders in the new color on both the Tags page and the task's detail view, and this survives a page reload

- **Given** the tag "Key client" attached to person "Sam Rivera" and task "Follow up with Sam"
  **When** I start deleting it on the Tags page and cancel, then start again and confirm
  **Then** the confirmation is an in-app dialog stating the tag is attached to 1 person and 1 task; the cancel changes nothing anywhere, and the confirm removes "Key client" from the Tags page, Sam Rivera's record, Sam Rivera's people-list row, and the task's detail view — all still gone after a page reload

- **Given** person "Sam Rivera" tagged "VIP" and task "Follow up with Sam" tagged "VIP" and "Q3"
  **When** an authorized agent fetches Sam Rivera's detail with the get-person tool and the task's detail with the get-task tool
  **Then** the person response includes tag "VIP" and the task response includes tags "VIP" and "Q3"

## Out of scope

- Filtering or searching by tag anywhere — the board filter stays in the `kanban-sort-filter` stub (which also records a possible People-list tag filter); neither list gains filter controls in this slice.
- Tag chips on kanban card faces — cards stay title-only for the third consecutive slice; recorded in the `kanban-card-indicators` stub.
- Tagging emails — the brief's third tagged entity; split to the new `tag-emails` stub (synced email has no UI surface until `email-ui`).
- Custom fields — the other half of the brief's "tags and custom fields"; person extra fields already exist via the track-people field config, and further custom-fields work is split to the new `custom-fields` stub.
- MCP tag write or search tools, and tags in the search-people or list-board responses — only get-person and get-task gain tags; everything else stays in the `mcp-tool-expansion` stub.
- Tag inputs on the create-person and create-task forms — tags are attached after creation on the detail views, matching the multiple-emails-and-phones decision to keep creation forms minimal. (A deliberate call, not a deferral.)
- Choosing a color at creation time — colors are auto-assigned; the Tags page color control is the only picker.
- Usage counts on the Tags page list — attachment counts appear only in the delete confirmation dialog.
- Bulk tagging, tag merging, and tag descriptions or any metadata beyond name and color.
- Authentication / multi-user access control.

## Open questions

Interview resolved (2026-08-10): inline creation with autocomplete plus a Tags management page; one shared tag pool across people and tasks; chips on detail views and people-list rows; no filter controls; colors auto-assigned and editable on the Tags page; names case-insensitively unique; deleting an in-use tag confirms and then detaches everywhere; get-person and get-task include tags.

- **Assumption to confirm:** the Tags page has no create form — tags are born inline on a person or task; the page lists, renames, recolors, and deletes. Flag if you want direct creation there too.
- **Assumption to confirm:** the Tags page lists tags alphabetically by name (matching the people list's fixed-order precedent).
- **Assumption to confirm:** attaching and detaching a tag need no confirmation — only deleting a tag from the Tags page confirms.
- **Assumption to confirm:** no cap on tags per person or task; chips wrap as needed.
- The auto-assign palette (its colors and size) is a `/speckit-plan` decision; product-level it only has to give consecutively created tags visibly different colors, as the criteria above exercise.
