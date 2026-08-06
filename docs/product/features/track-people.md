# Feature: track-people

## User story

As Tyler, I want to keep a record of the people I interact with — with their contact details — and link them to tasks so that I have a persistent, searchable record of who I know and who each task involves, without hunting through email or memory.

## Acceptance criteria

- **Given** the People page is open and no people exist yet
  **When** I create a person with first name "Sam", last name "Rivera",
  email "sam.rivera@example.com", and phone "555-0100"
  **Then** "Sam Rivera" appears in the people list showing their name,
  email, and phone — and still appears after a page reload (proving the
  person was persisted, not just held in browser state)

- **Given** a person "Sam Rivera" already exists
  **When** I create a person with first name "Ana", last name "Alvarez",
  and email "ana.alvarez@example.com"
  **Then** the people list shows "Ana Alvarez" above "Sam Rivera"
  (alphabetical by last name), and Sam Rivera's row is unchanged

- **Given** the People page is open
  **When** I try to submit the create-person form with the first name or
  last name blank or whitespace-only
  **Then** no new person is created and I see a validation message telling
  me first and last name are required

- **Given** a person "Sam Rivera" already exists with email
  "sam.rivera@example.com"
  **When** I try to create another person with email
  "Sam.Rivera@example.com" (same address, different case)
  **Then** no new person is created and I see a validation message telling
  me that email is already in use

- **Given** a person "Sam Rivera" exists
  **When** I open their record
  **Then** I see their first name, last name, email, and phone displayed

- **Given** a person "Sam Rivera" exists with phone "555-0100"
  **When** I edit their record, change the phone to "555-0199", and save
  **Then** their record shows "555-0199", and this survives a page reload

- **Given** people "Sam Rivera" (email "sam.rivera@example.com") and "Ana
  Alvarez" (email "ana.alvarez@example.com") both exist
  **When** I edit Ana Alvarez's record and change her email to
  "sam.rivera@example.com"
  **Then** the save is rejected with a validation message telling me that
  email is already in use, and Ana Alvarez's record still shows
  "ana.alvarez@example.com"

- **Given** the field config defines an extra field "Nickname" alongside
  the built-in first name, last name, email, and phone
  **When** I create a person "Sam Rivera" and enter "Sammy" in the form's
  "Nickname" input
  **Then** Sam Rivera's record shows Nickname "Sammy", and this survives a
  page reload

- **Given** a task "Follow up with Sam" exists on the kanban board
  **When** I click its card
  **Then** a task detail view opens showing the title "Follow up with Sam"
  and an empty linked-people section with a search box

- **Given** the task detail view for "Follow up with Sam" is open and a
  person "Sam Rivera" exists (not yet linked)
  **When** I type "sam" (lowercase) into the linked-people search and
  select "Sam Rivera" from the results
  **Then** "Sam Rivera" appears in the task's linked-people list

- **Given** the task detail view for "Follow up with Sam" is open and a
  person "Ana Alvarez" with email "ana.alvarez@example.com" exists
  **When** I type "ana.alvarez@" into the linked-people search
  **Then** the results show "Ana Alvarez" with their email address
  displayed alongside the name

- **Given** the task "Follow up with Sam" has "Sam Rivera" as a linked
  person
  **When** I remove "Sam Rivera" from the task's linked-people list
  **Then** the task no longer shows "Sam Rivera" as linked, and "Sam
  Rivera" still exists and is unchanged on the People page

- **Given** a person "Sam Rivera" is linked to two different tasks
  **When** I delete "Sam Rivera" from the People page
  **Then** "Sam Rivera" no longer appears in the people list, and neither
  task's detail view shows "Sam Rivera" in its linked-people list anymore

## Out of scope

- Companies — a separate follow-up feature. No "employer" field on a person in this slice.
- Roles on a task-person link (e.g. "assignee", "stakeholder") — for this feature, linked people are an unordered, unroled bucket per task.
- Any UI for managing the field config (adding, removing, or reordering fields through the app) — extra fields are added by editing the config file directly.
- Extra field types beyond free text (dropdowns, dates, checkboxes, etc.) — extra config fields are optional free-text only in this slice.
- Extra config fields as columns in the people list — they appear on the create/edit form and the person record only.
- Editing the task itself from the new detail view (title, lane, description, anything else) — in this slice the detail view only displays the task title and manages linked people. Task editing remains unbuilt, per `create-task.md`.
- Showing linked people on the kanban card face (chips, avatars, counts) — the board rendering is unchanged by this feature.
- Search, sort, or filter **controls** on the People list page — the list has a fixed default order (alphabetical by last name) and no search box. (The search box used when linking a person to a task is a separate, narrower widget scoped to that linking flow.)
- Creating a new person inline from the task-linking search — the person must already exist on the People page first.
- Bulk operations (bulk delete, bulk link/unlink).
- Photo/avatar, notes field, or any activity history on a person.
- Merging duplicate people.
- Importing contacts (e.g. from Outlook/Microsoft Graph).
- The work-helper MCP tools for people.
- Authentication / multi-user access control.

## Open questions

All resolved with Tyler during spec review (2026-08-06):

- Duplicate-email rule: email is optional; two people may both have a blank email with no conflict. The uniqueness check fires only between non-blank emails and matches case-insensitively.
  - Confirmed — and case-insensitivity is baked into the acceptance criteria's test data.
- People list default order?
  - Alphabetical by last name, pinned with its own criterion.
- Are person fields fixed or config-driven?
  - Config-driven, core-four-plus-extras model: first name, last name, email, and phone are always present with their hardcoded rules (names required, email unique among non-blank); the config file adds extra optional free-text fields. The config file's format/location is a `/speckit-plan` decision (same pattern as kanban lane configuration).
- Where does the task linked-people UI live, given no existing spec lets you open a task?
  - Clicking a kanban card opens a task detail view (page or modal — `/speckit-plan` decision) that shows the title and the linked-people section. This feature introduces that surface.
- What does the linked-people search match on?
  - Case-insensitive substring match against first name, last name, and email; result rows display name and email so same-named people are distinguishable.
- None remaining — ready for `/speckit-specify`.
