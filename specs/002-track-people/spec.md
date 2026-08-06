# Feature Specification: Track People

**Feature Branch**: `002-track-people`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Keep a record of the people Tyler interacts with — with their contact details — and link them to tasks, so there is a persistent, searchable record of who he knows and who each task involves. People have four built-in fields (first name, last name, email, phone) plus extra optional free-text fields defined in a field configuration. People are listed alphabetically by last name. Clicking a kanban card opens a new task detail view where people can be searched by name or email and linked to or removed from the task. Deleting a person removes them from every task they were linked to." (source: `docs/product/features/track-people.md`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build the people directory (Priority: P1)

Tyler opens the People page, creates a person with their name and contact details, and sees them in a list ordered alphabetically by last name. Attempts to create a person without a first or last name, or with an email some other person already uses, are rejected with a clear message.

**Why this priority**: This is the core of the feature — a persistent directory of people. Every other story (viewing, editing, linking, deleting) presupposes people exist, so nothing else can ship without this.

**Independent Test**: Open the People page, create a person, and confirm they appear in the list with their details and survive a page reload. Delivers value on its own: a searchable-by-eye contact list.

**Acceptance Scenarios**:

1. **Given** the People page is open and no people exist yet, **When** Tyler creates a person with first name "Sam", last name "Rivera", email "sam.rivera@example.com", and phone "555-0100", **Then** "Sam Rivera" appears in the people list showing their name, email, and phone — and still appears after a page reload (proving the person was persisted, not just held in browser state).
2. **Given** a person "Sam Rivera" already exists, **When** Tyler creates a person with first name "Ana", last name "Alvarez", and email "ana.alvarez@example.com", **Then** the people list shows "Ana Alvarez" above "Sam Rivera" (alphabetical by last name), and Sam Rivera's row is unchanged.
3. **Given** the People page is open, **When** Tyler tries to submit the create-person form with the first name or last name blank or whitespace-only, **Then** no new person is created and he sees a validation message telling him first and last name are required.
4. **Given** a person "Sam Rivera" already exists with email "sam.rivera@example.com", **When** Tyler tries to create another person with email "Sam.Rivera@example.com" (same address, different case), **Then** no new person is created and he sees a validation message telling him that email is already in use.

---

### User Story 2 - View and edit a person's record (Priority: P2)

Tyler opens a person's record to see all their details, and edits those details when they change — with the same validation rules applied on save as on create.

**Why this priority**: Contact details go stale; a directory that can't be corrected loses trust quickly. Ranks just below creation because a read-only directory is still usable, briefly.

**Independent Test**: Open an existing person's record, confirm all fields are displayed, change one field, save, and confirm the change survives a page reload.

**Acceptance Scenarios**:

1. **Given** a person "Sam Rivera" exists, **When** Tyler opens their record, **Then** he sees their first name, last name, email, and phone displayed.
2. **Given** a person "Sam Rivera" exists with phone "555-0100", **When** Tyler edits their record, changes the phone to "555-0199", and saves, **Then** their record shows "555-0199", and this survives a page reload.
3. **Given** people "Sam Rivera" (email "sam.rivera@example.com") and "Ana Alvarez" (email "ana.alvarez@example.com") both exist, **When** Tyler edits Ana Alvarez's record and changes her email to "sam.rivera@example.com", **Then** the save is rejected with a validation message telling him that email is already in use, and Ana Alvarez's record still shows "ana.alvarez@example.com".

---

### User Story 3 - Link people to a task (Priority: P3)

Tyler clicks a task card on the kanban board and a task detail view opens — a new surface introduced by this feature — showing the task's title and its linked people. He searches for an existing person by name or email, links them to the task, and can later remove the link without affecting the person's record.

**Why this priority**: This is the second half of the feature's value — knowing who each task involves. It depends on people existing (Story 1) but the directory is independently useful without it.

**Independent Test**: With one task and one unlinked person in place, open the task's detail view, search for the person, link them, confirm they appear in the linked-people list, then remove them and confirm the person is untouched on the People page.

**Acceptance Scenarios**:

1. **Given** a task "Follow up with Sam" exists on the kanban board, **When** Tyler clicks its card, **Then** a task detail view opens showing the title "Follow up with Sam" and an empty linked-people section with a search box.
2. **Given** the task detail view for "Follow up with Sam" is open and a person "Sam Rivera" exists (not yet linked), **When** Tyler types "sam" (lowercase) into the linked-people search and selects "Sam Rivera" from the results, **Then** "Sam Rivera" appears in the task's linked-people list.
3. **Given** the task detail view for "Follow up with Sam" is open and a person "Ana Alvarez" with email "ana.alvarez@example.com" exists, **When** Tyler types "ana.alvarez@" into the linked-people search, **Then** the results show "Ana Alvarez" with their email address displayed alongside the name.
4. **Given** the task "Follow up with Sam" has "Sam Rivera" as a linked person, **When** Tyler removes "Sam Rivera" from the task's linked-people list, **Then** the task no longer shows "Sam Rivera" as linked, and "Sam Rivera" still exists and is unchanged on the People page.

---

### User Story 4 - Delete a person everywhere at once (Priority: P4)

Tyler deletes a person from the People page. The person disappears from the people list and from the linked-people list of every task they were linked to — no orphaned references anywhere.

**Why this priority**: Keeps the directory and task links trustworthy over time, but only matters once people and links exist, so it lands after the stories that create them.

**Independent Test**: Link one person to two tasks, delete the person from the People page, and confirm they are gone from the list and from both tasks' detail views.

**Acceptance Scenarios**:

1. **Given** a person "Sam Rivera" is linked to two different tasks, **When** Tyler deletes "Sam Rivera" from the People page, **Then** "Sam Rivera" no longer appears in the people list, and neither task's detail view shows "Sam Rivera" in its linked-people list anymore.

---

### User Story 5 - Extra fields from configuration (Priority: P5)

Tyler adds an extra field (e.g. "Nickname") to the field configuration by editing the configuration directly. The field then appears on the create/edit person form and on the person record, as an optional free-text input, without any code change.

**Why this priority**: A flexibility layer on top of the directory. Valuable for tailoring the CRM, but the built-in four fields cover the core need, so this ships last.

**Independent Test**: With an extra field "Nickname" defined in the field configuration, create a person, fill in the Nickname input, and confirm the value shows on their record and survives a page reload.

**Acceptance Scenarios**:

1. **Given** the field configuration defines an extra field "Nickname" alongside the built-in first name, last name, email, and phone, **When** Tyler creates a person "Sam Rivera" and enters "Sammy" in the form's "Nickname" input, **Then** Sam Rivera's record shows Nickname "Sammy", and this survives a page reload.

---

### Edge Cases

- Two people both have a blank email: allowed, no conflict — the email-uniqueness rule applies only between non-blank emails.
- Tyler edits a person and saves without changing their email: the save must succeed — a person's email never conflicts with itself.
- Two people share the same full name: allowed; the linked-people search results show each person's email alongside their name so they can be told apart.
- The linked-people search matches no one: an empty result is shown; there is no way to create a person from the search (out of scope).
- Tyler selects a person in the linked-people search who is already linked to that task: the task must not end up listing the same person twice.
- A person linked to zero tasks is deleted: they simply disappear from the people list.
- A person's details are edited after they were linked to a task: the task's linked-people list reflects the updated details, since a link points at the person, not a copy of them.
- An extra configured field is left blank on the form: allowed — extra fields are always optional.
- Very long names or emails: the people list, person record, and linked-people list must still render without breaking the page layout.

## Requirements *(mandatory)*

### Functional Requirements

**People directory**

- **FR-001**: System MUST provide a People page listing all people, showing each person's name, email, and phone, ordered alphabetically by last name.
- **FR-002**: System MUST let the user create a person with first name, last name, email, and phone, where first name and last name are required and email and phone are optional.
- **FR-003**: System MUST reject creating or saving a person whose first name or last name is blank or whitespace-only, and MUST tell the user first and last name are required.
- **FR-004**: System MUST reject creating or saving a person whose non-blank email matches another person's non-blank email case-insensitively, MUST tell the user that email is already in use, and MUST leave existing records unchanged. Blank emails never conflict, and a person's own email never conflicts with itself.
- **FR-005**: System MUST persist people and all their field values so they remain correct after a page reload or a new browser session.
- **FR-006**: System MUST provide a person record view displaying the person's first name, last name, email, phone, and any extra configured field values.
- **FR-007**: System MUST let the user edit a person's fields and save, applying the same validation rules as at creation.
- **FR-008**: System MUST let the user delete a person from the People page, removing them from the people list and from the linked-people list of every task they were linked to.

**Field configuration**

- **FR-009**: System MUST read a field configuration that defines extra optional free-text fields beyond the built-in four; each extra field MUST appear as an input on the create/edit person form and as a value on the person record, and its values MUST persist like built-in fields.
- **FR-010**: The built-in fields (first name, last name, email, phone) MUST always be present with their fixed rules, regardless of the field configuration.
- **FR-011**: System MUST NOT provide any UI to add, remove, or reorder configured fields — the field configuration is edited directly, outside the app.

**Task linking**

- **FR-012**: Clicking a task card on the kanban board MUST open a task detail view showing the task's title and a linked-people section with a search box.
- **FR-013**: The linked-people search MUST match people by case-insensitive substring against first name, last name, and email, and each result MUST display the person's name and email.
- **FR-014**: Selecting a person from the search results MUST link that person to the task and show them in the task's linked-people list; a person can be linked to any number of tasks, a task can link any number of people, and the same person MUST NOT appear more than once per task.
- **FR-015**: System MUST let the user remove a linked person from a task; removal MUST NOT change or delete the person themselves.
- **FR-016**: The task detail view MUST NOT allow editing the task's own fields (title, lane, or anything else) in this feature, and the linked-people search MUST NOT offer creating a new person.
- **FR-017**: The kanban board's card rendering MUST remain unchanged — linked people do not appear on card faces in this feature.

### Key Entities

- **Person**: Someone Tyler interacts with. Has required first and last name, optional email (unique among non-blank emails, case-insensitively) and phone, plus a value per extra configured field. Persisted so they survive reloads.
- **Field configuration**: A definition, maintained outside the app, of extra optional free-text fields that extend every person's create/edit form and record. The built-in four fields exist independently of it.
- **Task–person link**: An association between one task and one person, meaning the task involves that person. Unordered and unroled; at most one link per task-person pair; removed when the person is deleted or the link is explicitly removed.
- **Task** *(existing)*: A kanban to-do item from the create-task feature. This feature adds a detail view (opened from its card) and a set of linked people; the task's own fields are untouched.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a person and see them in the people list within 5 seconds of submitting.
- **SC-002**: 100% of created people and saved edits are still correct after a page reload or a new browser session.
- **SC-003**: 0% of submissions with a blank required name or an already-in-use email result in a created or changed record, and every such rejection shows the user a validation message naming the problem.
- **SC-004**: Starting from the kanban board, a user can open a task and link an existing person to it in under 15 seconds.
- **SC-005**: 100% of linked-people searches return every person whose first name, last name, or email contains the typed text (ignoring case), each shown with name and email.
- **SC-006**: After a person is deleted, 0 tasks still show them as linked and the person no longer appears in the people list.
- **SC-007**: 100% of extra fields defined in the field configuration appear on the create/edit form and the person record, with saved values surviving a page reload.

## Out of Scope

The following are explicitly excluded from this feature (per the product spec), to keep the slice small:

- Companies or an employer field on a person (separate follow-up feature).
- Roles on a task–person link (e.g. "assignee") — links are an unordered, unroled bucket.
- Any in-app UI for managing the field configuration, extra field types beyond free text, or extra fields as columns in the people list.
- Editing the task itself (title, lane, description) from the new detail view, and any change to how kanban card faces render.
- Search, sort, or filter controls on the People list page — the list has a fixed alphabetical-by-last-name order. (The linked-people search box is a separate widget scoped to the task-linking flow.)
- Creating a person inline from the task-linking search.
- Bulk operations, duplicate-person merging, photos/avatars, notes, or activity history.
- Importing contacts (e.g. from Outlook/Microsoft Graph).
- The work-helper MCP tools for people.
- Authentication / multi-user access control.

## Assumptions

- Single user, no authentication — consistent with work-helper being a self-hosted personal tool for Tyler.
- The people list sorts alphabetically by last name, case-insensitively; people with the same last name are ordered by first name.
- Email and phone are optional at creation and may be cleared on edit; whitespace-only email or phone is treated as blank.
- Email uniqueness is enforced case-insensitively, only between non-blank emails, and never against the person's own record.
- Deleting a person is permanent — there is no archive or undo in this slice.
- The people list shows all people with no pagination, which is adequate at personal-CRM scale.
- Extra configured fields are optional free-text only; the configuration mechanism's format and location follow the same pattern as the kanban lane configuration and are decided during planning.
- Whether the task detail view is a page or a modal is decided during planning; either satisfies this spec.
- Tasks and the kanban board exist per the create-task feature; a task's card is the entry point to the new detail view.
