# User Story 2 (P2) - Multiple Phones per Person - Evidence Results

Feature: multiple-emails-and-phones
Tested against: http://localhost:5105 (UI) / http://localhost:3005 (API)
Date: 2026-08-07

This is a new, self-contained test run using a brand-new person, "Priya Nair", created specifically for this US2 (phone management) verification. The pre-existing "Sam Rivera" person (from the prior US1 email-management evidence run) was left untouched and confirmed to still have no email and phone "555-0100" at the start of this run.

## Step 1: Create person with phone only (no email), confirm list row, reload and re-verify

**Given** the People page is open
**When** I create a person with first name "Priya", last name "Nair", phone "555-0500", and no email
**Then** Priya Nair's row in the people list shows "555-0500" as the phone and an empty email cell -- all still true after a page reload

**Result: PASS**

- Created Priya Nair via the People page form (email field left blank). The list row immediately showed: "Priya Nair -- -- 555-0500" (empty email segment between the two separator dashes, phone "555-0500" present).
- After reloading /people, the row still showed "Priya Nair -- -- 555-0500".
- Screenshots: us2-01-create-person.png, us2-01b-create-person-reload.png

## Step 2: Detail page shows Phones section with primary phone; reload and re-verify

**Given** Priya Nair exists with phone "555-0500"
**When** I open her detail page
**Then** the Phones section shows "555-0500" marked Primary

**Result: PASS**

- Detail page (/people/2) shows a "Phones" heading with a list item "555-0500" + "Primary" label, plus Edit/Remove controls (no "Make primary" button shown for the sole/primary entry, as expected since there is nothing else to promote it over).
- Emails section correctly shows the empty state "No email addresses yet." (email was left blank at creation).
- After reloading /people/2, the same state persisted.
- Screenshots: us2-02-detail-primary.png, us2-02b-detail-primary-reload.png

## Step 3: Add second phone, confirm both listed with original still primary; reload and re-verify

**Given** Priya Nair has primary phone "555-0500"
**When** I add a second phone number "555-0599" via the Phones section's add control
**Then** the record lists both numbers with "555-0500" still marked Primary, and both numbers are still there after a page reload

**Result: PASS**

- After typing "555-0599" into the Add Phone field and clicking Add, the Phones list showed two entries: "555-0500" (Primary, with Edit/Remove) and "555-0599" (with Edit / Make primary / Remove controls).
- After reloading /people/2, both entries were still present with "555-0500" still marked Primary.
- Screenshots: us2-03-add-second-phone.png, us2-03b-add-second-phone-reload.png

## Step 4: Mark "555-0599" as Primary; confirm marker moves and list row updates; reload and re-verify

**Given** Priya Nair has phones "555-0500" (primary) and "555-0599"
**When** I mark "555-0599" as Primary
**Then** the Primary marker moves to it and off "555-0500", and the People list row for Priya Nair now shows "555-0599"

**Result: PASS**

- Clicked "Make primary" on the "555-0599" row. The detail page immediately updated: "555-0500" now shows a "Make primary" button (no longer marked Primary), and "555-0599" now shows the "Primary" label.
- The People list row for Priya Nair updated to "Priya Nair -- -- 555-0599".
- After reloading both /people and /people/2, both pages still reflected "555-0599" as primary (list row: "Priya Nair -- -- 555-0599"; detail page: "555-0599" marked Primary, "555-0500" showing "Make primary").
- Screenshots: us2-04-make-primary-detail.png, us2-04-make-primary-list.png, us2-04b-make-primary-list-reload.png, us2-04c-make-primary-detail-reload.png

## Step 5: Remove "555-0500" (now non-primary); confirm "555-0599" remains Primary; reload and re-verify

**Given** Priya Nair has phones "555-0500" (non-primary) and "555-0599" (primary)
**When** I remove "555-0500"
**Then** "555-0599" remains and is still marked Primary

**Result: PASS**

- Clicked "Remove" on the "555-0500" row. The Phones list then showed only "555-0599", still marked Primary.
- After reloading /people/2, the same single entry (555-0599, Primary) persisted.
- Screenshots: us2-05-remove-nonprimary.png, us2-05b-remove-nonprimary-reload.png

## Step 6: Remove the last remaining phone ("555-0599"); confirm empty state on detail and empty phone cell in list; reload and re-verify

**Given** Priya Nair has only "555-0599" (primary)
**When** I remove "555-0599"
**Then** the record shows no phone numbers (empty state) and the People list row's phone cell is empty

**Result: PASS**

- Clicked "Remove" on the last remaining phone row. The Phones section then displayed the empty-state message "No phone numbers yet." (Add Phone input/button still present, Emails section unaffected/still empty).
- The People list row for Priya Nair changed to "Priya Nair -- --" (both email and phone segments empty).
- After reloading /people and /people/2, both pages still reflected the empty-phone state ("No phone numbers yet." on detail; empty phone cell in the list row, showing just "Priya Nair -- --").
- Screenshots: us2-06-remove-last-detail.png, us2-06-remove-last-list.png, us2-06b-remove-last-list-reload.png, us2-06c-remove-last-detail-reload.png

## Summary

| Step | Description | Result |
|------|-------------|--------|
| 1 | Create person with phone only, list row shows phone/empty email, survives reload | PASS |
| 2 | Detail page shows Phones section with sole entry marked Primary, survives reload | PASS |
| 3 | Add second phone, both listed, original still primary, survives reload | PASS |
| 4 | Mark second phone primary, marker moves, list row updates, survives reload | PASS |
| 5 | Remove non-primary phone, primary phone unaffected, survives reload | PASS |
| 6 | Remove last phone, empty state on detail and list, survives reload | PASS |

All 6 steps PASS. No application code was modified during this verification; only the browser was driven. A brand-new person ("Priya Nair") was created for this test, per instructions, leaving the pre-existing "Sam Rivera" record (from the prior US1 evidence run) untouched.
