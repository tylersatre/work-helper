# Feature Specification: Multiple Emails and Phones per Person

**Feature Branch**: `005-multiple-emails-and-phones`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "@docs/product/features/multiple-emails-and-phones.md — As Tyler, I want each person to hold multiple email addresses and multiple phone numbers — with one of each marked primary — so that a contact's full reality (work address, personal address, several numbers) lives in one record, and so that future email ingestion can match a message from any of a person's addresses to the right person."

## Clarifications

### Session 2026-08-07

- Q: When Tyler creates a *new* person via the create-person form, should the new uniqueness rules reject a duplicate value entered there — in particular a phone number another person already has? → A: Yes — the create form enforces both uniqueness rules: duplicate email or duplicate phone is rejected with the same "already in use" message, and the person is not created.
- Q: What should happen to the single email and phone inputs on the existing edit-person form once a person's addresses and numbers are managed as lists on their record? → A: Remove email and phone from the edit-person form — it edits name (and other scalar fields) only; all email/phone management happens through the entry lists on the record.
- Q: If the data that exists when this feature ships already contains the same phone number on two people, what should the migration do? → A: Moot — there is no real (production) data yet, so the migration has no pre-existing conflicts or legacy rows to worry about; carry-over behavior is verified by automated test on seeded data instead of on real data at acceptance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage a person's email addresses (Priority: P1)

Tyler opens a person's record and manages their list of email addresses: he adds new addresses, edits an address in place, marks any address as the primary one, and removes addresses. Exactly one address is primary whenever the person has any, and the people list always shows each person's primary address. This is the heart of the feature — future email ingestion will match incoming messages against any of a person's addresses, so the full set must live on the record.

**Why this priority**: Email is the reason this feature exists (ingestion matching); phone numbers ride along. Delivering emails alone is a viable, valuable slice.

**Independent Test**: Can be fully tested by creating a person with one email, then adding, editing, re-marking primary, and removing addresses on their record and confirming the record and the people-list row after each step and after a page reload.

**Acceptance Scenarios**:

1. **Given** the People page is open and no people exist yet, **When** Tyler creates a person with first name "Sam", last name "Rivera", email "sam.rivera@example.com", and phone "555-0100", **Then** Sam Rivera's record shows "sam.rivera@example.com" as his only email address and "555-0100" as his only phone number, each marked as primary, and Sam Rivera's row in the people list shows that email and phone — all still true after a page reload.
2. **Given** a person "Sam Rivera" exists with primary email "sam.rivera@example.com", **When** Tyler opens his record and adds a second email address "sam.personal@example.com", **Then** his record lists both addresses with "sam.rivera@example.com" still marked primary, and both addresses are still there after a page reload.
3. **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com", **When** Tyler edits "sam.personal@example.com" to read "sam.p@example.com" and saves, **Then** his record shows "sam.p@example.com" in its place and no longer shows "sam.personal@example.com", and this survives a page reload.
4. **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com", **When** Tyler marks "sam.personal@example.com" as primary, **Then** the primary marker moves to "sam.personal@example.com" (and off "sam.rivera@example.com"), Sam Rivera's row in the people list now shows "sam.personal@example.com", and this survives a page reload.
5. **Given** Sam Rivera has email addresses "sam.rivera@example.com" (primary) and "sam.personal@example.com", **When** Tyler removes "sam.rivera@example.com", and then also removes "sam.personal@example.com", **Then** after the first removal "sam.personal@example.com" is automatically marked primary and shown in Sam's people-list row, and after the second removal his record shows no email addresses and his people-list row's email cell is empty — a person with zero emails is valid.

---

### User Story 2 - Manage a person's phone numbers (Priority: P2)

Tyler manages a person's phone numbers the same way as email addresses: add, edit, mark primary, and remove, with exactly one number primary whenever any exist, automatic promotion when the primary is removed, and the people list showing the primary number.

**Why this priority**: Phones complete the "contact's full reality" story and share the same interaction model as emails, but nothing downstream (ingestion) depends on them.

**Independent Test**: Can be fully tested by taking a person with one phone number, adding a second number, marking it primary, and confirming the record and people-list row after each step and after a page reload.

**Acceptance Scenarios**:

1. **Given** Sam Rivera has phone "555-0100" (primary), **When** Tyler adds a second phone "555-0199" and marks it primary, **Then** his record lists both numbers with "555-0199" marked primary, his people-list row shows "555-0199", and this survives a page reload.
2. **Given** Sam Rivera has phones "555-0100" (primary) and "555-0199", **When** Tyler removes "555-0100", **Then** "555-0199" is automatically marked primary, and removing it too leaves Sam with no phone numbers and an empty phone cell in his people-list row — a person with zero phones is valid.

---

### User Story 3 - Duplicate and blank values are rejected (Priority: P3)

When Tyler tries to give a person an email address or phone number that any person (including that same person) already has — or a blank value — the attempt is rejected with a clear validation message and nothing changes. Email matching is case-insensitive; phone matching compares the exact stored text.

**Why this priority**: Uniqueness is what makes ingestion matching unambiguous (one address resolves to exactly one person), but it only matters once the lists from Stories 1–2 exist.

**Independent Test**: Can be fully tested with two people by attempting to add one person's email/phone to the other, the person's own email in different letter-case, and a whitespace-only value, confirming each rejection message and that the lists are unchanged.

**Acceptance Scenarios**:

1. **Given** Sam Rivera has email "sam.rivera@example.com" and a person "Ana Alvarez" has email "ana.alvarez@example.com", **When** Tyler tries to add "Sam.Rivera@example.com" (Sam's own address in different case) to Sam, and then tries to add "ana.alvarez@example.com" (Ana's address) to Sam, **Then** both attempts are rejected with a validation message telling him that email is already in use, and Sam's email list is unchanged.
2. **Given** Ana Alvarez has phone "555-0200", **When** Tyler tries to add "555-0200" as a phone for Sam Rivera, **Then** the attempt is rejected with a validation message telling him that phone number is already in use, and Sam's phone list is unchanged.
3. **Given** Sam Rivera's record is open, **When** Tyler tries to add an email address or a phone number that is empty or whitespace-only, **Then** nothing is added and he sees a validation message telling him a value is required.

---

### Edge Cases

- Removing the primary entry while two or more other entries remain: one of the remaining entries is automatically promoted (the earliest-added one — see Assumptions); the person is never left with entries but no primary.
- Editing an entry to a value already held by another person, or by another entry on the same person, is rejected exactly like adding a duplicate; editing an entry to a differently-cased version of its own current value is allowed (an entry never collides with itself).
- Marking the entry that is already primary as primary again changes nothing.
- Editing the primary entry's value keeps it primary.
- A person created with the create-person form gets their single email and single phone stored as primary entries; the create form keeps one input per type, and a duplicate email or phone entered there is rejected like any other duplicate (no person is created).
- People who existed before this feature keep their data: the single stored email and phone each become that person's primary entry, with nothing lost.
- "555-0100" and "5550100" are different phone values — no normalization, so both can exist (on different people) and neither blocks the other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A person MUST be able to hold any number of email addresses and any number of phone numbers, including none of either.
- **FR-002**: Whenever a person has at least one email address, exactly one of them MUST be marked primary; the same MUST hold independently for phone numbers.
- **FR-003**: Users MUST be able to add an email address or phone number to an existing person from that person's record.
- **FR-004**: Users MUST be able to edit the value of any existing email address or phone number in place, replacing the old value.
- **FR-005**: Users MUST be able to mark any of a person's email addresses or phone numbers as primary, which moves the primary marker off the previous primary of that type.
- **FR-006**: Users MUST be able to remove any email address or phone number; when the removed entry was primary and others of that type remain, the system MUST automatically promote one remaining entry to primary; removing the last entry of a type is valid and leaves the person with none.
- **FR-007**: An email address MUST be unique across all people and all entries, compared case-insensitively; adding or editing an entry to a value that would collide MUST be rejected with a validation message saying the email is already in use, leaving all lists unchanged.
- **FR-008**: A phone number MUST be unique across all people and all entries, compared as the exact stored text with no normalization; adding or editing an entry to a colliding value MUST be rejected with a validation message saying the phone number is already in use, leaving all lists unchanged.
- **FR-009**: Empty or whitespace-only email or phone values MUST be rejected with a validation message saying a value is required, and nothing is added or changed.
- **FR-010**: Each person's row in the people list MUST show that person's primary email address and primary phone number, and an empty cell for a type the person has none of.
- **FR-011**: The create-person form MUST keep its single email input and single phone input; a value entered there becomes that person's primary entry of that type. Values submitted via the create form are subject to the same uniqueness rules as entries (FR-007, FR-008): a duplicate email or duplicate phone is rejected with the matching "already in use" validation message and the person is not created.
- **FR-012**: Every surface that presents a single email or phone for a person (the people list and the existing person-query tools used by AI agents) MUST present the primary one.
- **FR-013**: All additions, edits, primary changes, and removals MUST persist — the state shown after any action MUST still be shown after a page reload.
- **FR-014**: People that exist before this feature ships MUST keep their data: the previously stored single email and single phone each become that person's primary entry of that type, with nothing lost.
- **FR-015**: The edit-person form MUST no longer include email or phone inputs — it edits the person's other fields (names) only; adding, editing, re-marking primary, and removing email addresses and phone numbers happens exclusively through the entry lists on the person's record.

### Key Entities

- **Person**: An existing contact record (first name, last name, notes, task links). Now holds an ordered collection of email addresses and an ordered collection of phone numbers instead of a single value of each.
- **Email address entry**: One email address belonging to exactly one person, with a flag marking it as that person's primary email. Its value is unique across the whole product, ignoring letter case.
- **Phone number entry**: One phone number belonging to exactly one person, with a flag marking it as that person's primary phone. Its value is unique across the whole product, compared as exact text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tyler can take a person from one email address to three (adding, editing, and changing which is primary along the way) entirely from that person's record, with every intermediate state correct on the record and in the people list, including after a page reload.
- **SC-002**: 100% of people present in a database created before this feature still show their original email and phone, now as primary entries — zero values lost or altered, verified by an automated migration test on seeded data (there is no pre-existing production data to check at acceptance).
- **SC-003**: 100% of attempts to save a duplicate or blank email/phone are rejected with a visible explanatory message and cause no change to any person's data.
- **SC-004**: Given any email address stored on any person (primary or not), that address identifies exactly one person — no address or number appears on two people.

## Assumptions

- When a primary entry is removed and more than one other entry remains, the earliest-added remaining entry is promoted to primary (the feature description only exercises the one-remaining case; earliest-added is the predictable default).
- Uniqueness validation applies to edits exactly as to adds, but an entry is never rejected for colliding with itself (so re-casing an email in place is allowed).
- Values are trimmed of leading and trailing whitespace before saving and before duplicate comparison; a value that is only whitespace is treated as empty and rejected.
- The create-person form keeps email and phone optional at creation, with any provided value becoming the primary entry; its one behavior change is that duplicate values are now rejected for phones as well as emails (per FR-011 and the 2026-08-07 clarification).
- When a create-person submission conflicts on both the email and the phone, the email conflict is checked first and its message is the one reported — one validation message per attempt.
- There is no pre-existing production data (clarified 2026-08-07): the migration still converts any existing rows' single email and phone into primary entries (FR-014, verified by automated test on seeded data), and no handling for pre-existing duplicate values is needed.
- Phone uniqueness with no normalization means the same real-world number written two ways ("555-0100" vs "5550100") is not caught as a duplicate — Tyler accepted this for this slice.
- Out of scope, per the feature description: labels on entries ("Work", "Personal"), multi-entry inputs on the create form, email/phone format validation and phone normalization, changes to the AI-agent tools beyond continuing to return the primary values, companies, tags, ingested email messages, searching/filtering people by any address or number, and bulk operations or contact import.
