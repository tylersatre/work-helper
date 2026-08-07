# Feature: multiple-emails-and-phones

## User story

As Tyler, I want each person to hold multiple email addresses and multiple phone numbers — with one of each marked primary — so that a contact's full reality (work address, personal address, several numbers) lives in one record, and so that future email ingestion can match a message from any of a person's addresses to the right person.

## Acceptance criteria

- **Given** the People page is open and no people exist yet
  **When** I create a person with first name "Sam", last name "Rivera", email "sam.rivera@example.com", and phone "555-0100"
  **Then** Sam Rivera's record shows "sam.rivera@example.com" as his only email address and "555-0100" as his only phone number, each marked as primary, and Sam Rivera's row in the people list shows that email and phone — all still true after a page reload

- **Given** a person "Sam Rivera" exists with primary email "sam.rivera@example.com"
  **When** I open his record and add a second email address "sam.personal@example.com"
  **Then** his record lists both addresses with "sam.rivera@example.com" still marked primary, and both addresses are still there after a page reload

- **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com"
  **When** I edit "sam.personal@example.com" to read "sam.p@example.com" and save
  **Then** his record shows "sam.p@example.com" in its place and no longer shows "sam.personal@example.com", and this survives a page reload

- **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com"
  **When** I mark "sam.personal@example.com" as primary
  **Then** the primary marker moves to "sam.personal@example.com" (and off "sam.rivera@example.com"), Sam Rivera's row in the people list now shows "sam.personal@example.com", and this survives a page reload

- **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com"
  **When** I remove "sam.rivera@example.com", and then also remove "sam.personal@example.com"
  **Then** after the first removal "sam.personal@example.com" is automatically marked primary and shown in Sam's people-list row, and after the second removal his record shows no email addresses and his people-list row's email cell is empty — a person with zero emails is valid

- **Given** Sam Rivera has email "sam.rivera@example.com" and a person "Ana Alvarez" has email "ana.alvarez@example.com"
  **When** I try to add "Sam.Rivera@example.com" (his own address in different case) to Sam, and then try to add "ana.alvarez@example.com" (Ana's address) to Sam
  **Then** both attempts are rejected with a validation message telling me that email is already in use, and Sam's email list is unchanged

- **Given** Sam Rivera has phone "555-0100" (primary)
  **When** I add a second phone "555-0199" and mark it primary
  **Then** his record lists both numbers with "555-0199" marked primary, his people-list row shows "555-0199", and this survives a page reload

- **Given** Ana Alvarez has phone "555-0200"
  **When** I try to add "555-0200" as a phone for Sam Rivera
  **Then** the attempt is rejected with a validation message telling me that phone number is already in use, and Sam's phone list is unchanged

- **Given** Sam Rivera's record is open
  **When** I try to add an email address or a phone number that is empty or whitespace-only
  **Then** nothing is added and I see a validation message telling me a value is required

## Out of scope

- Labels on addresses and numbers ("Work", "Personal", …) — Tyler chose a bare list plus a primary marker for this slice.
- Multi-entry on the create-person form — creation keeps one email input and one phone input (each becoming the primary); additional entries are added afterward on the person's record.
- Email or phone format validation, and phone-number normalization — duplicate checks match the stored string (case-insensitively for email, exactly for phone); "555-0100" and "5550100" are different values.
- MCP tool changes — the mcp-server people tools keep returning a single email and phone (the primary ones); exposing the full lists is recorded in the `mcp-tool-expansion` stub.
- Companies — separate follow-up (existing `companies` stub, re-flagged in this interview).
- Tags — separate follow-up (new `tags` stub from this interview).
- Ingested email messages — the `email-ingestion` stub; this feature only builds the address model those messages will match against.
- Searching or filtering people by any address or number — the people list keeps its fixed order and no search controls (per track-people); the task-linking search widget is unchanged and keeps matching whatever it matches today.
- Bulk operations and contact import.

## Open questions

- **Assumption to confirm:** people created before this feature keep their data — the existing single email and phone simply become that person's primary email and primary phone, with nothing lost. Verified on Tyler's real data at acceptance.
- **Assumption to confirm:** phone uniqueness matches the exact stored string with no normalization, so the same real-world number written two ways ("555-0100" vs "5550100") is not caught as a duplicate. Flag if you want smarter matching now rather than later.
- All interview questions resolved with Tyler (2026-08-07): emails and phones ride in one slice; no labels; explicit primary per type with auto-promotion when the primary is removed; both emails and phones unique across people (email case-insensitive); create form keeps one input of each.
