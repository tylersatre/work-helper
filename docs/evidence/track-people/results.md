# Track People - Evidence

Feature: 002-track-people
Date tested: 2026-08-06
Base URL: http://localhost:5173

This file documents browser-driven verification of the 5 user stories in docs/product/features/track-people.md (as described in the task brief). Screenshots referenced below live alongside this file in docs/evidence/track-people/.

## User Story 1 - Directory (/people page)

### Scenario 1: Create Sam Rivera with all four fields

Given the People page is open and empty, when Tyler fills in First name "Sam", Last name "Rivera", Email "sam.rivera@example.com", Phone "555-0100" and submits, then a new row appears showing the name, email, and phone.

Result: PASS

The People page started empty (screenshot us1-scenario1-empty-people-page.png). After filling all four fields and clicking "Add person", a new row appeared reading "Sam Rivera — sam.rivera@example.com — 555-0100" with a Delete button.

Evidence: us1-scenario1-empty-people-page.png, us1-scenario1-sam-created.png

### Scenario 2: Reload persists Sam Rivera

Given Sam Rivera was just created, when Tyler reloads the page, then Sam Rivera's row still shows with the same email and phone.

Result: PASS

Navigated fresh to /people (full page load, not client-side nav). The row "Sam Rivera — sam.rivera@example.com — 555-0100" was still present.

Evidence: us1-scenario2-sam-persists-after-reload.png

### Scenario 3: Second person sorts above by last name

Given Sam Rivera exists, when Tyler creates Ana Alvarez (email ana.alvarez@example.com), then Ana Alvarez appears ABOVE Sam Rivera in the list (alphabetical by last name: Alvarez < Rivera).

Result: PASS

After creating Ana Alvarez, the list order was: Ana Alvarez (row 1), Sam Rivera (row 2) - correct alphabetical-by-last-name order.

Evidence: us1-scenario3-alvarez-above-rivera.png

### Scenario 4: Blank name rejected

Given the create form is open, when Tyler submits with First name and Last name blank, then a validation message appears and no new row is added.

Result: PASS

Submitting with blank First/Last name produced the inline validation message "First and last name are required". The list still showed exactly the same 2 rows (Ana Alvarez, Sam Rivera) - no new row added.

Evidence: us1-scenario4-blank-name-validation.png

### Scenario 5: Duplicate email (case-insensitive) rejected

Given Sam Rivera's email is sam.rivera@example.com, when Tyler submits a new person with email "Sam.Rivera@example.com" (different case) and any name, then an "email already in use" message appears and no new row is added.

Result: PASS

Submitting a person named "Duplicate Tester" with email "Sam.Rivera@example.com" produced the inline validation message "That email is already in use". The list still showed exactly the same 2 rows - no new row added. This confirms the uniqueness check is case-insensitive.

Evidence: us1-scenario5-duplicate-email-validation.png

## User Story 2 - Record & Edit (/people/:id page)

### Scenario 1: Open Sam Rivera's record, all fields shown

Given Sam Rivera exists in the directory, when Tyler clicks his name from the People page, then the record view shows First name, Last name, Email, and Phone all populated with his data.

Result: PASS

Clicking "Sam Rivera" navigated to /people/1. The record form showed First name "Sam", Last name "Rivera", Email "sam.rivera@example.com", Phone "555-0100", all populated.

Evidence: us2-scenario1-sam-record-fields.png

### Scenario 2: Edit phone, save, reload, persisted

Given Sam Rivera's record is open, when Tyler changes Phone to "555-0199" and clicks Save changes, then reloads the page, then the record shows Phone "555-0199".

Result: PASS

After changing the phone field and saving, then doing a full page reload of /people/1, the Phone field still showed "555-0199".

Evidence: us2-scenario2-phone-persists-after-reload.png

### Scenario 3: Editing to a duplicate email is rejected, record unchanged

Given Ana Alvarez's record is open and Sam Rivera's email is sam.rivera@example.com, when Tyler changes Ana's Email field to "sam.rivera@example.com" and clicks Save changes, then the save is rejected with a message, and Ana's persisted record is unchanged (still her original email).

Result: PASS

Saving Ana's record with Sam's email produced the inline validation message "That email is already in use" and the save was rejected (screenshot us2-scenario3-duplicate-email-rejected.png, taken with the rejected value still visible in the input box before any reload). Reloading /people/2 confirmed the persisted/displayed record reverted to showing her original email "ana.alvarez@example.com" (screenshot us2-scenario3-ana-email-unchanged-after-reload.png) - the rejected edit was never actually saved to the database.

Evidence: us2-scenario3-duplicate-email-rejected.png, us2-scenario3-ana-email-unchanged-after-reload.png

## User Story 3 - Task Linking (board -> /tasks/:id)

### Scenario 1: Create task, open detail view, empty linked-people section with search box

Given the board is open, when Tyler creates a task titled "Follow up with Sam" and clicks the resulting card, then he is navigated to a task detail view showing the title and an empty linked-people section with a search box.

Result: PASS

Created the task on the board; it appeared as a card in "To Do". Clicking the card navigated to /tasks/1, which showed the heading "Follow up with Sam", a "Search people" textbox, and an empty linked-people list.

Evidence: us3-scenario1-task-detail-empty-linked.png

### Scenario 2: Search "sam", link Sam Rivera

Given the task detail view is open, when Tyler types "sam" into the search box, then Sam Rivera appears as a result; when Tyler selects/links him, then he appears in the linked list.

Result: PASS

Typing "sam" showed the result "Sam Rivera — sam.rivera@example.com" with a Link button. Clicking Link moved Sam Rivera into the linked-people list with a Remove button.

Evidence: us3-scenario2-search-sam-result.png, us3-scenario2-sam-linked.png

### Scenario 3: Search by email shows name AND email

Given the task detail view is open, when Tyler types "ana.alvarez@" into the search box, then the result shows Ana's name AND her email (not just name).

Result: PASS

The search result read "Ana Alvarez — ana.alvarez@example.com", showing both name and email.

Evidence: us3-scenario3-search-by-email-shows-name-and-email.png

### Scenario 4: Unlink Sam from task; Sam untouched in People directory

Given Sam Rivera is linked to the task, when Tyler clicks Remove, then he is gone from the linked list; when Tyler visits the People page, then Sam Rivera is still listed there, untouched.

Result: PASS

Clicking Remove cleared the linked-people list back to empty. Navigating to /people showed Sam Rivera still present with his prior data (sam.rivera@example.com, 555-0199) - deleting the link did not touch the People directory.

Evidence: us3-scenario4-sam-unlinked.png, us3-scenario4-sam-still-in-people-list.png

### Scenario 5: Board card face unchanged; task detail has no task-field editing or "create person" affordance

Given a task with linked people exists, when Tyler views the board, then the card still shows only the title (unchanged rendering); when Tyler views the task detail page, then there is no way to edit the task's own fields (title/lane) and no "create a new person" affordance.

Result: PASS

The board card for "Follow up with Sam" rendered as plain text with only the title, identical to how task cards rendered before this feature (no linked-people badge/count added to the card face). The task detail view at /tasks/1 showed the title as a plain (non-editable) heading, a people search box, and a linked-people list - no title input, no lane selector/dropdown, and no "create a new person" form or link anywhere on the page.

Evidence: us3-scenario5-board-card-title-only.png, us3-scenario5-task-detail-no-edit-affordances.png

## User Story 4 - Delete Everywhere

### Scenario 1-3: Delete Sam Rivera removes him from People and from every linked task

Given Sam Rivera is linked to two different tasks ("Follow up with Sam" and "Schedule review with Sam"), when Tyler deletes Sam from the People page, then Sam is gone from the People list, and both tasks' detail views show an empty linked-people list.

Result: PASS

Linked Sam Rivera to both /tasks/1 and /tasks/2 (verified each showed him in its linked list - us4-scenario1-sam-linked-task1.png, us4-scenario1-sam-linked-task2.png). Clicking Delete on Sam's People row removed him from the People list entirely (only Ana Alvarez remained - us4-scenario2-sam-deleted-from-people.png). Opening /tasks/1 and /tasks/2 afterward showed both linked-people lists now empty (us4-scenario3-task1-empty-after-delete.png, us4-scenario3-task2-empty-after-delete.png).

Evidence: us4-scenario1-sam-linked-task1.png, us4-scenario1-sam-linked-task2.png, us4-scenario2-sam-deleted-from-people.png, us4-scenario3-task1-empty-after-delete.png, us4-scenario3-task2-empty-after-delete.png

## User Story 5 - Extra Fields (config/person-fields.json = ["Nickname"])

### Scenario 1: Create form shows Nickname input

Given config/person-fields.json is configured with ["Nickname"], when Tyler opens the People page, then the create form shows a "Nickname" input alongside the built-in fields.

Result: PASS

The create form on /people showed First name, Last name, Email, Phone, and Nickname inputs, plus the Add person button.

Evidence: us5-scenario1-nickname-field-present.png

### Scenario 2: Create person with Nickname, shown in record

Given the create form is open, when Tyler creates a person (Samuel Nickerson) with Nickname "Sammy" and opens their record, then the Nickname field shows "Sammy".

Result: PASS

Created "Samuel Nickerson" with Nickname "Sammy". Opening his record at /people/3 showed the Nickname field populated with "Sammy".

Evidence: us5-scenario2-nickname-shown-in-record.png

### Scenario 3: Nickname persists after reload

Given Samuel Nickerson's Nickname is "Sammy", when Tyler reloads the record page, then the Nickname value "Sammy" is still shown.

Result: PASS

Full-page reload of /people/3 still showed Nickname "Sammy".

Evidence: us5-scenario3-nickname-persists-after-reload.png

## Edge Checks

### Two people with blank emails can coexist

Result: PASS

Created "Blank EmailOne" and "Blank EmailTwo", both with the Email field left empty. Both rows were added successfully with no "email already in use" conflict (blank/empty emails are not treated as a duplicate against each other).

Evidence: edge-two-blank-emails-coexist.png

### Re-saving a person without changing their own email succeeds (no false conflict)

Result: PASS

After the rejected edit in US2 Scenario 3, reloaded Ana Alvarez's record (email back to her own ana.alvarez@example.com) and clicked "Save changes" without modifying the email. No "email already in use" error appeared - saving a record with its own unchanged email does not falsely trigger the uniqueness conflict.

Evidence: edge-resave-own-email-no-conflict.png

### Re-selecting an already-linked person on a task does not create a duplicate entry

Result: PASS

With Sam Rivera already linked to task 1, searching "sam" again still showed him as a search result with a Link button. Clicking Link again did not add a second entry - the linked-people list still showed exactly one "Sam Rivera" row afterward.

Evidence: edge-relink-no-duplicate.png

### Long name/email does not break people-list, record, or linked-people layouts

Result: PASS

Created a person with a 60-character first name, 60-character last name, and a long email address. On the People list, the row wrapped the long text within its bordered container without any horizontal overflow (confirmed via DOM inspection: row scrollWidth 1182px === clientWidth 1182px, i.e. no overflow). The person's own record page similarly wrapped the long name in the heading and kept form inputs at fixed width. Linking this long-named person to a task and viewing the task's linked-people list also wrapped correctly without breaking the row layout or overflowing the container.

Evidence: edge-long-name-people-list-layout.png, edge-long-name-record-layout.png, edge-long-name-linked-people-layout.png

## Summary

| # | Scenario | Result |
|---|---|---|
| US1-1 | Create Sam Rivera with all four fields | PASS |
| US1-2 | Reload persists Sam Rivera | PASS |
| US1-3 | Second person sorts above by last name (Alvarez above Rivera) | PASS |
| US1-4 | Blank name rejected with validation message | PASS |
| US1-5 | Duplicate email (case-insensitive) rejected | PASS |
| US2-1 | Sam Rivera's record shows all fields | PASS |
| US2-2 | Edit phone, save, reload, persisted | PASS |
| US2-3 | Editing to a duplicate email rejected, record unchanged | PASS |
| US3-1 | Create task, open detail view, empty linked-people section with search | PASS |
| US3-2 | Search "sam", link Sam Rivera | PASS |
| US3-3 | Search by email shows name AND email | PASS |
| US3-4 | Unlink Sam from task; Sam untouched in People directory | PASS |
| US3-5 | Board card unchanged; task detail has no task-field editing / no create-person affordance | PASS |
| US4-1..3 | Delete Sam Rivera removes him from People and from all linked tasks | PASS |
| US5-1 | Create form shows Nickname input | PASS |
| US5-2 | Create person with Nickname, shown in record | PASS |
| US5-3 | Nickname persists after reload | PASS |
| Edge | Two people with blank emails can coexist | PASS |
| Edge | Re-saving a person without changing own email succeeds | PASS |
| Edge | Re-selecting already-linked person does not duplicate | PASS |
| Edge | Long name/email does not break layouts | PASS |

## Overall

All 17 acceptance scenarios across User Stories 1-5, plus all 4 edge checks, PASS. No application code was modified during this verification. Note: a handful of incidental harness-test artifacts (test.txt, test2.txt, test4.txt, test5.md, test6.png) were created in this directory while establishing a reliable file-writing mechanism for this evidence run; they contain no test data and can be ignored/deleted.
