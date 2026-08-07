# US3 Evidence: Validation for duplicate and blank email/phone values

Feature: Multiple Emails and Phones per Person -- User Story 3 (P3)

Tested against: http://localhost:5105 (UI) / http://localhost:3005 (API)

Test date: 2026-08-07

## Setup

Created two new people for this test:

- Dana Diaz -- email `dana.diaz@example.com`, phone `555-0700` (person id 3)
- Eli Cruz -- email `eli.cruz@example.com`, phone `555-0800` (person id 4)

Screenshot: `us3-01-create-dana-and-eli.png`

---

## Criterion 1: Create Dana Diaz and Eli Cruz

**Given** no existing people named Dana Diaz or Eli Cruz
**When** each is created via the People page form with the specified email and phone
**Then** both appear in the People list with their respective email and phone

**Result: PASS**

Both people were created successfully and appear in the People list with the correct email and phone values, alongside the pre-existing Sam Rivera and Priya Nair records (left untouched).

Screenshot: `us3-01-create-dana-and-eli.png`

---

## Criterion 2: Reject own email in different letter-case

**Given** Dana Diaz has email `dana.diaz@example.com`
**When** the user attempts to add `Dana.Diaz@example.com` (same address, different case) via the Emails section's add control on Dana's detail page
**Then** the attempt is rejected with a message that the email is already in use, and Dana's email list still shows only the original `dana.diaz@example.com`

**Result: PASS**

Submitting `Dana.Diaz@example.com` produced the inline alert "That email is already in use". The API call to `POST /api/people/3/emails` returned 409 Conflict. Dana's email list continued to show only the single original entry `dana.diaz@example.com` (Primary) -- nothing was added.

Screenshot: `us3-02-reject-own-email-case.png`

---

## Criterion 3: Reject another person's email

**Given** Eli Cruz has email `eli.cruz@example.com`
**When** the user attempts to add `eli.cruz@example.com` as a new email for Dana Diaz
**Then** the attempt is rejected with the same "already in use" style message, and Dana's email list is unchanged

**Result: PASS**

Submitting `eli.cruz@example.com` on Dana's page produced the same inline alert "That email is already in use". Dana's email list remained unchanged (only `dana.diaz@example.com`).

Screenshot: `us3-03-reject-other-person-email.png`

---

## Criterion 4: Reject another person's phone number

**Given** Eli Cruz has phone `555-0800`
**When** the user attempts to add `555-0800` as a new phone number for Dana Diaz
**Then** the attempt is rejected with a message that the phone number is already in use, and Dana's phone list is unchanged (still just `555-0700`)

**Result: PASS**

Submitting `555-0800` in the Phones section produced the inline alert "That phone number is already in use". Dana's phone list remained unchanged (only `555-0700`, Primary).

Screenshot: `us3-04-reject-other-person-phone.png`

---

## Criterion 5: Reject blank / whitespace-only values

**Given** Dana Diaz's detail page is open
**When** the user submits a whitespace-only value (a single space) or leaves the field blank in the Phones add control, and separately a whitespace-only value in the Emails add control
**Then** nothing is added and a validation message tells the user a value is required, for both sections

**Result: PASS**

- Phones: submitting a single space produced the alert "A value is required"; the phone list stayed at just `555-0700`. (Screenshot: `us3-05a-reject-whitespace-phone.png`)
- Emails: submitting a whitespace-only value (three spaces) produced the alert "A value is required"; the email list stayed at just `dana.diaz@example.com`. (Screenshot: `us3-05b-reject-whitespace-email.png`)
- Additionally verified submitting the Phones field completely empty (no characters at all) also produced "A value is required" with no change to the phone list, confirming both the "leave blank" and "whitespace-only" cases described in the acceptance criterion are handled consistently.

---

## Criterion 6: Reload confirms no side effects from rejected attempts

**Given** all of the above rejected add attempts have been made on Dana Diaz's detail page
**When** the page is reloaded
**Then** Dana's record still shows exactly the original one email (`dana.diaz@example.com`) and one phone (`555-0700`), with no trace of any of the rejected attempts

**Result: PASS**

After a full page reload (navigating fresh to `/people/3`), Dana Diaz's Emails section shows exactly one entry, `dana.diaz@example.com` (Primary), and the Phones section shows exactly one entry, `555-0700` (Primary). No duplicate emails, no Eli's email/phone, and no blank entries were persisted.

Screenshot: `us3-06-reload-unchanged.png`

---

## Summary

| Scenario | Result |
|---|---|
| Own email, different letter-case (case-insensitive dedupe) | PASS |
| Another person's email | PASS |
| Another person's phone number (exact string match) | PASS |
| Blank / whitespace-only value (both Emails and Phones sections) | PASS |
| Final reload shows no side effects from any rejected attempt | PASS |

All five US3 validation scenarios pass. Validation messages were clear and specific ("That email is already in use", "That phone number is already in use", "A value is required"), no data changes occurred on any rejected attempt, and the state after reload exactly matches the state before the rejected attempts were made.
