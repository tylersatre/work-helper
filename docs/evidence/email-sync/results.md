# Email Sync — Acceptance Evidence

Feature: 007-email-sync
Evidence directory: docs/evidence/email-sync/
Dev server: UI http://localhost:5107, API http://localhost:3007

## Scenario 1 — US3-2: Link an existing unlinked record

**Given** person "Ana Alvarez" (id=2) has no email addresses, and an unlinked email-address record `previously.synced@example.com` exists in the `email_addresses` table (person_id = NULL, simulating a synced-but-unlinked address).
**When** I navigate to Ana Alvarez's person detail page (http://localhost:5107/people/2), type `previously.synced@example.com` into the "Add Email" field, and click Add.
**Then** the save succeeds with no error, and Ana's record shows `previously.synced@example.com` as one of her emails, marked "Primary" (her first email).

**Result: PASS**

Observed: after clicking Add, the emails list on Ana's page immediately showed a single list item "previously.synced@example.com" with a "Primary" badge, and Edit/Remove buttons — no error was shown, no console errors were logged (only an unrelated favicon 404 seen earlier).

Screenshot: `us3-2-link-unlinked-address.png`

## Scenario 2 — US3-3: Cross-person conflict still rejected

**Given** Ana Alvarez's record now has `previously.synced@example.com` (from Scenario 1), and `sam.rivera@example.com` belongs to person "Sam Rivera" (id=1).
**When** on Ana Alvarez's page I type `sam.rivera@example.com` into the "Add Email" field and click Add.
**Then** the UI shows a validation/error message that the email is already in use, and Ana's record is left unchanged (still just the one email from Scenario 1, not two).

**Result: PASS**

Observed: after clicking Add, an alert appeared below the Add Email field reading exactly "That email is already in use". Ana's emails list still showed only the single entry `previously.synced@example.com` (Primary) — the attempted `sam.rivera@example.com` was not added.

Screenshot: `us3-3-conflict-rejected.png`

## Scenario 3 — Regression pass: existing add/edit/remove/primary flows

**Given** person "Sam Rivera" (id=1) with one linked, primary email `sam.rivera@example.com`.
**When** I exercise, in order: (a) add a second email `sam.personal@example.com`; (b) mark the non-primary email as primary; (c) edit the (now non-primary) email's value in place; (d) remove that edited email.
**Then** each step succeeds with no errors, and the person record reflects the change after each step.

**Result: PASS**

Observed, step by step:
- (a) Add second email: after typing `sam.personal@example.com` and clicking Add, the list showed two entries — `sam.rivera@example.com` (Primary) and `sam.personal@example.com` (with a "Make primary" button) — no error.
- (b) Mark non-primary as primary: clicking "Make primary" on `sam.personal@example.com` moved the "Primary" badge to it, and `sam.rivera@example.com` gained a "Make primary" button in its place — marker moved correctly.
- (c) Edit in place: clicking Edit on `sam.rivera@example.com` opened an inline textbox; changing the value to `sam.rivera.work@example.com` and clicking Save updated the list entry to show the new value with Edit/Make primary/Remove buttons restored — no error.
- (d) Remove: clicking Remove on `sam.rivera.work@example.com` removed it from the list immediately, leaving only `sam.personal@example.com` (Primary) — no error.

Final state after all steps: Sam Rivera has exactly one email, `sam.personal@example.com`, marked Primary.

Screenshot: `regression-email-crud.png` (end state after all four operations)

## Summary

| Scenario | Result |
|---|---|
| US3-2 — link unlinked record | PASS |
| US3-3 — cross-person conflict rejected | PASS |
| Regression — add/edit/remove/primary | PASS |

No console errors were observed during any of the flows (the only console error seen across the session was an unrelated `favicon.ico` 404 on initial page load, not related to the feature under test).
