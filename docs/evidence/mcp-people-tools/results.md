# MCP People Tools — Evidence

Evidence directory: `docs/evidence/mcp-people-tools/`

## Automated-check evidence (MCP-only criteria: SC-002, SC-003, SC-004, FR-015–FR-019)

Command: `npx vitest run tests/integration/mcp-people-write-tools.test.ts tests/integration/mcp-unlinked-addresses.test.ts tests/integration/mcp-read-tools.test.ts tests/integration/people.test.ts tests/integration/contact-entries.test.ts`

Result: **5 test files passed, 128 tests passed** (0 failed).

```
 Test Files  5 passed (5)
      Tests  128 passed (128)
   Start at  17:39:34
   Duration  2.60s (transform 583ms, setup 456ms, import 2.98s, tests 4.71s, environment 1ms)
```

Coverage by user story — US1 create (incl. synced-address linking, case-insensitive duplicate with holder name, whitespace name, unknown field) and US3/US4 write flows in `mcp-people-write-tools.test.ts` (28 tests, including a parity-boundary regression test enumerating the registered tool set to confirm no delete-person/edit-value-in-place tool exists — FR-013, FR-020); US2 discovery content/ordering/link-reactivity in `mcp-unlinked-addresses.test.ts` (9 tests); US5 full-lists-on-get-person plus unchanged search rows in `mcp-read-tools.test.ts` (21 tests, including the new US5 assertion); conflict-holder enrichment at the service seam in `people.test.ts` (24 tests) / `contact-entries.test.ts` (46 tests, including both the email and phone "already holds it" edge cases). The auth edge case (tokenless call reaches no tool, reads/changes nothing) is asserted in both new MCP suites.

## Browser evidence (UI-surface criteria)

## Criterion A (US1 / SC-001 / FR-014)

**Given** a person "Jordan Smith" was created via the `create-person` MCP tool with firstName "Jordan", lastName "Smith", email "jordan.smith@example.com", phone "555-0142", extraFields {"Nickname": "Jo"}, and the tool linked this to an already-existing unlinked synced email address.
**When** the People page is opened in the browser, and Jordan Smith's person record is opened, and the page is then fully reloaded (not SPA navigation).
**Then** "Jordan Smith" should be listed on the People page; his record should show email jordan.smith@example.com marked Primary, phone 555-0142 marked Primary, and a Nickname field with value "Jo"; and all of this should still be present after a full page reload.

**Result: PASS**

- People page lists "Jordan Smith" (row with email jordan.smith@example.com, phone 555-0142). Screenshot: `01-us1-jordan-people-page.png`
- Jordan Smith's person record (http://localhost:5115/people/1) shows: Emails - jordan.smith@example.com Primary; Phones - 555-0142 Primary; Edit section Nickname field populated with "Jo". Screenshot: `02-us1-jordan-record.png`
- After a full browser navigation/reload to http://localhost:5115/people/1, all of the above (email Primary, phone Primary, Nickname "Jo") is still present. Screenshot: `03-us1-jordan-record-after-reload.png`

## Criterion B (US1 AS2)

**Given** the "Introduction" conversation (received 2026-08-02, from jordan.smith@example.com, display name "Jordan Smith") exists in synced email, and jordan.smith@example.com has since been linked to the Jordan Smith person record via `create-person`.
**When** the "Introduction" conversation is opened in the Emails section, and then navigation returns to Jordan Smith's person record.
**Then** the from-address jordan.smith@example.com on the "Introduction" email should be shown as linked to person "Jordan Smith" (clickable link to his person record), not as an unmatched/unlinked address; and Jordan Smith's person record should show the "Introduction" conversation in its email/conversations section.

**Result: PASS**

- Emails list shows "Introduction" (Aug 2, 2026, 6:00 AM) from Tyler Satre, Jordan Smith.
- Opening the "Introduction" detail view (http://localhost:5115/emails/4) shows `from: Jordan Smith <jordan.smith@example.com>` where "Jordan Smith" is a clickable link to `/people/1` — not shown as unmatched (no "Search people to link" prompt on the from side; that unmatched-linking UI only appears for the recipient "Tyler Satre" who is not yet linked). Screenshot: `04-us1-introduction-linked.png`
- Clicking through to Jordan Smith's person record (http://localhost:5115/people/1) shows an "Email" section listing the "Introduction" conversation (Aug 2, 2026, 6:00 AM, jordan.smith@example.com — from), linking to `/emails/4`. Screenshot: `05-us1-jordan-email-section.png`

## Criterion C (US3 / SC-005 / FR-014)

**Given** Riley Chen (person id 2) had riley.personal@example.com added via `add-contact-entry`, marked primary via `mark-contact-primary`, and riley.chen@example.com removed via `remove-contact-entry`.
**When** Riley Chen's person record is opened in the browser, and the page is then fully reloaded (not SPA navigation).
**Then** his email list should show exactly one email, riley.personal@example.com, marked Primary, with riley.chen@example.com NOT listed — and this should still be true after a full page reload.

**Result: PASS**

- Riley Chen's person record (http://localhost:5115/people/2) shows an Emails list with exactly one entry: riley.personal@example.com — Primary. riley.chen@example.com does not appear anywhere on the page. Screenshot: `06-us3-riley-record.png`
- After a full browser navigation/reload to http://localhost:5115/people/2, the same single email (riley.personal@example.com, Primary) is shown, with riley.chen@example.com still absent. Screenshot: `07-us3-riley-after-reload.png`

## Criterion D (US4 / FR-008 / FR-014)

**Given** person id 1 "Jordan Smith" exists (firstName "Jordan", lastName "Smith", email jordan.smith@example.com marked primary, phone 555-0142 marked primary, extraFields {"Nickname": "Jo"}), and the `update-person` MCP tool has been called with personId 1, lastName "Smith-Lee", extraFields {"Nickname": "JS"} — a partial edit leaving firstName, email, and phone untouched.
**When** the People page is opened in the browser, and Jordan's person record (/people/1) is opened, and the page is then fully reloaded (not SPA navigation).
**Then** the People page should list him as "Jordan Smith-Lee" (not "Jordan Smith"); his person record should show the Nickname field as "JS" (not "Jo"), with email jordan.smith@example.com and phone 555-0142 unchanged and still marked Primary; and all of this should still be true after a full page reload.

**Result: PASS**

- People page (http://localhost:5115/people) lists "Jordan Smith-Lee" (not "Jordan Smith") with email jordan.smith@example.com and phone 555-0142. Screenshot: `08-us4-people-page-renamed.png`
- Jordan's person record (http://localhost:5115/people/1) shows heading "Jordan Smith-Lee"; Emails - jordan.smith@example.com Primary (unchanged); Phones - 555-0142 Primary (unchanged); Edit section First name "Jordan" (unchanged), Last name "Smith-Lee" (updated), Nickname "JS" (updated from "Jo"). Screenshot: `09-us4-record-updated-nickname.png`
- After a full browser navigation/reload to http://localhost:5115/people/1, all of the above (name "Jordan Smith-Lee", email jordan.smith@example.com Primary, phone 555-0142 Primary, Nickname "JS") is still present. Screenshot: `10-us4-record-after-reload.png`

## Summary

| Criterion | Result |
|---|---|
| A (US1 / SC-001 / FR-014) | PASS |
| B (US1 AS2) | PASS |
| C (US3 / SC-005 / FR-014) | PASS |
| D (US4 / FR-008 / FR-014) | PASS |
