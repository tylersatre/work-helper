# User Story 1 (P1 MVP) - Multiple Emails per Person - Evidence Results

Feature: multiple-emails-and-phones
Tested against: http://localhost:5105 (UI) / http://localhost:3005 (API)
Date: 2026-08-07

## Step 1: Create person with email and phone, confirm list row, reload and re-verify

**Given** the People page is open and no people exist yet
**When** I create a person with first name "Sam", last name "Rivera", email "sam.rivera@example.com", and phone "555-0100"
**Then** Sam Rivera's row in the people list shows that email and phone — all still true after a page reload

**Result: PASS**

- Created person via the People page form. List row immediately showed: "Sam Rivera — sam.rivera@example.com — 555-0100".
- After reloading /people, the row still showed "Sam Rivera — sam.rivera@example.com — 555-0100".
- Screenshots: us1-01-create-person.png, us1-01b-create-person-reload.png

## Step 2: Detail page shows Emails section with primary email, and phone displayed; reload and re-verify

**Given** Sam Rivera exists with primary email "sam.rivera@example.com" and phone "555-0100"
**When** I open his detail page
**Then** the Emails section shows "sam.rivera@example.com" marked Primary, and "555-0100" is shown somewhere on the page

**Result: PASS**

- Detail page (/people/1) shows an "Emails" heading with a list item "sam.rivera@example.com" + "Primary" label, plus Edit/Remove controls, an "Add Email" input and "Add" button.
- The phone "555-0100" is shown in a "Phones" section with a "Primary" label.
- Note (observation, not a failure): the Phones section already has full Edit/Add/Remove/Make-primary controls in this build, not just a read-only display as the task description anticipated ("phone management UI itself isn't built yet"). This exceeds what was expected but does not contradict any of the tested email acceptance criteria.
- After reloading /people/1, the same state persisted.
- Screenshots: us1-02-detail-primary.png, us1-02b-detail-primary-reload.png

## Step 3: Add second email, confirm both listed with original still primary; reload and re-verify

**Given** Sam Rivera has primary email "sam.rivera@example.com"
**When** I add a second email address "sam.personal@example.com" via the Emails section's add control
**Then** the record lists both addresses with "sam.rivera@example.com" still marked Primary, and both addresses are still there after a page reload

**Result: PASS**

- After typing "sam.personal@example.com" into the Add Email field and clicking Add, the Emails list showed two entries: "sam.rivera@example.com" (Primary) and "sam.personal@example.com" (with Edit / Make primary / Remove controls).
- After reloading /people/1, both entries were still present with "sam.rivera@example.com" still marked Primary.
- Screenshots: us1-03-add-second-email.png, us1-03b-add-second-email-reload.png

## Step 4: Inline edit "sam.personal@example.com" to "sam.p@example.com"; reload and re-verify

**Given** Sam Rivera has "sam.rivera@example.com" (primary) and "sam.personal@example.com"
**When** I edit "sam.personal@example.com" in place to "sam.p@example.com" using the inline edit control
**Then** the record shows "sam.p@example.com" in its place and no longer shows "sam.personal@example.com", surviving a page reload

**Result: PASS**

- Clicking "Edit" on the "sam.personal@example.com" row switched it to an inline textbox with Save/Cancel buttons, pre-filled with the current value.
- Changed the value to "sam.p@example.com" and clicked Save. The list then showed "sam.rivera@example.com" (Primary) and "sam.p@example.com"; "sam.personal@example.com" was no longer present.
- After reloading /people/1, the same state persisted (sam.p@example.com present, sam.personal@example.com absent).
- Screenshots: us1-04-edit-email.png, us1-04b-edit-email-reload.png

## Step 5: Mark "sam.p@example.com" as Primary; confirm marker moves and list row updates; reload and re-verify

**Given** Sam Rivera has "sam.rivera@example.com" (primary) and "sam.p@example.com"
**When** I mark "sam.p@example.com" as Primary
**Then** the Primary marker moves to it and off "sam.rivera@example.com", and the People list row for Sam Rivera now shows "sam.p@example.com"

**Result: PASS**

- Clicked "Make primary" on the "sam.p@example.com" row. The detail page immediately updated: "sam.rivera@example.com" now shows a "Make primary" button (no longer marked Primary), and "sam.p@example.com" now shows the "Primary" label.
- The People list row for Sam Rivera updated to "Sam Rivera — sam.p@example.com — 555-0100".
- After reloading both /people and /people/1, both pages still reflected "sam.p@example.com" as primary.
- Screenshots: us1-05-make-primary-detail.png, us1-05-make-primary-list.png, us1-05b-make-primary-detail-reload.png, us1-05c-make-primary-list-reload.png

## Step 6: Remove "sam.rivera@example.com" (non-primary); confirm "sam.p@example.com" remains Primary; reload and re-verify

**Given** Sam Rivera has "sam.rivera@example.com" (non-primary) and "sam.p@example.com" (primary)
**When** I remove "sam.rivera@example.com"
**Then** "sam.p@example.com" remains and is still marked Primary

**Result: PASS**

- Clicked "Remove" on the "sam.rivera@example.com" row. The Emails list then showed only "sam.p@example.com", still marked Primary.
- After reloading /people/1, the same single entry (sam.p@example.com, Primary) persisted.
- Screenshots: us1-06-remove-nonprimary.png, us1-06b-remove-nonprimary-reload.png

## Step 7: Remove the last remaining email ("sam.p@example.com"); confirm empty state on detail and empty email cell in list; reload and re-verify

**Given** Sam Rivera has only "sam.p@example.com" (primary)
**When** I remove "sam.p@example.com"
**Then** the record shows no email addresses (empty state) and the People list row's email cell is empty

**Result: PASS**

- Clicked "Remove" on the last remaining email row. The Emails section then displayed the empty-state message "No email addresses yet." (Add Email input/button still present, phone section unaffected).
- The People list row for Sam Rivera changed to "Sam Rivera — — 555-0100" (empty email segment between the two separator dashes, phone "555-0100" retained).
- After reloading /people and /people/1, both pages still reflected the empty-email state ("No email addresses yet." on detail; empty email cell in the list row).
- Screenshots: us1-07-remove-last-detail.png, us1-07-remove-last-list.png, us1-07b-remove-last-list-reload.png, us1-07c-remove-last-detail-reload.png

## Summary

| Step | Description | Result |
|------|-------------|--------|
| 1 | Create person, email/phone shown in list, survives reload | PASS |
| 2 | Detail page shows primary email + phone displayed, survives reload | PASS |
| 3 | Add second email, both listed, original still primary, survives reload | PASS |
| 4 | Inline edit an email address, survives reload | PASS |
| 5 | Mark second email primary, marker moves, list row updates, survives reload | PASS |
| 6 | Remove non-primary email, primary unaffected, survives reload | PASS |
| 7 | Remove last email, empty state on detail and list, survives reload | PASS |

All 7 steps PASS. No application code was modified during this verification; only the browser was driven.

Observation for the record (not a failure): the Phones section on the person detail page already has full Add / Edit / Remove / Make-primary controls in this build, exceeding the phone-related scope described in the test brief ("phone management UI itself isn't built yet"). This does not affect the pass/fail status of any of the 7 email-focused steps above.
