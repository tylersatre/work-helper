# US1/SC-001 Gap-Closure Evidence: Primary removal, three-entry scale, create-form duplicate rejection

Feature: Multiple Emails and Phones per Person. This supplements `results.md`, `us2-results.md`, and `us3-results.md` after an independent verifier audit found three specific evidence gaps in the original three runs. The underlying code was already correct and covered by automated tests (`tests/integration/contact-entries.test.ts`); this run captures the missing browser scenarios.

Tested against: http://localhost:5105 (UI) / http://localhost:3005 (API)

## Gap 1: Removing the entry that IS Primary (not a non-primary one) was never exercised

Both original runs happened to mark a different entry primary before removing an entry, so every removal in the original evidence removed a non-primary entry. This run removes the actual primary and confirms auto-promotion.

### Email case

**Given** Wren Ito has three emails: `wren.ito@example.com` (Primary), `wren.work@example.com`, `wren.old@example.com` (added in that order)
**When** `wren.ito@example.com` — the current Primary — is removed
**Then** `wren.work@example.com` (the lowest-id / earliest-added of the two survivors) is automatically promoted to Primary, both on the detail page and in the People list row

**Result: PASS**

- `us1-gap-03-primary-email-promoted-detail.png` — detail page shows `wren.work@example.com` marked Primary with a Remove control, `wren.old@example.com` with a "Make primary" control (i.e. not primary). Confirmed by direct inspection of the screenshot.
- `us1-gap-04-primary-email-promoted-list.png` — People list row for Wren Ito shows `wren.work@example.com`.
- `us1-gap-05-primary-email-promoted-list-reloaded.png`, `us1-gap-06-primary-email-promoted-detail-reloaded.png` — both re-verified after a full page reload.

### Phone case

**Given** Wren Ito has two phones: `555-0900` (Primary), `555-0999`
**When** `555-0900` — the current Primary — is removed
**Then** `555-0999` is automatically promoted to Primary, both on the detail page and in the People list row

**Result: PASS**

- `us1-gap-08-primary-phone-promoted-detail.png`, `us1-gap-09-primary-phone-promoted-list.png` — promotion confirmed.
- `us1-gap-10-primary-phone-promoted-list-reloaded.png`, `us1-gap-11-primary-phone-promoted-detail-reloaded.png` — re-verified after reload.

## Gap 2: SC-001 (one email growing to three) and lowest-id promotion among two survivors

**Given** Wren Ito starts with one email, `wren.ito@example.com`
**When** `wren.work@example.com` and then `wren.old@example.com` are added
**Then** all three are listed with `wren.ito@example.com` still Primary

**Result: PASS** — `us1-gap-01-create-wren.png` (one email), `us1-gap-02-three-emails.png` (three emails, correct primary), `us1-gap-07-two-phones.png` (phone side, two entries).

The subsequent removal in Gap 1's email case leaves **two** survivors (`wren.work@example.com`, added second overall, and `wren.old@example.com`, added third overall) rather than only one — this discriminates the "lowest id" rule from "the only remaining entry." `wren.work@example.com` was promoted, `wren.old@example.com` was not, confirming the promotion rule picks the earliest-added survivor specifically, not merely whichever one happens to be left.

## Gap 3: Duplicate rejected at the create-person form itself

**Given** `wren.work@example.com` is already in use (as Wren Ito's primary email)
**When** a new person "Test Duplicate" is submitted via the People page's create-person form with email `wren.work@example.com`
**Then** the form shows "That email is already in use" and no "Test Duplicate" person is created

**Result: PASS** — `us1-gap-12-duplicate-email-rejected-create-form.png` shows the inline message "That email is already in use" directly under the create-person form, with the submitted values (`Test`, `Duplicate`, `wren.work@example.com`) still populated in the (now-rejected) form. The people list below shows exactly the five pre-existing people (Eli Cruz, Dana Diaz, Wren Ito, Priya Nair, Sam Rivera) — no "Test Duplicate" row was added.

## Summary

| Gap | Scenario | Result |
|---|---|---|
| 1 (email) | Remove the current Primary email with a survivor remaining; survivor auto-promoted | PASS |
| 1 (phone) | Remove the current Primary phone with a survivor remaining; survivor auto-promoted | PASS |
| 2 | One email grows to three (SC-001 scale) | PASS |
| 2 | Two-survivor removal promotes the lowest-id/earliest-added survivor specifically | PASS |
| 3 | Duplicate email rejected at the create-person form, no person created | PASS |

All three gaps identified by the independent verifier are closed. Screenshots and reload re-verification are included for every claim above.
