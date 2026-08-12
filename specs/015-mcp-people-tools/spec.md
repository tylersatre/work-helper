# Feature Specification: MCP People Tools

**Feature Branch**: `015-mcp-people-tools`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "@docs/product/features/mcp-people-tools.md — As Tyler, I want the work-helper MCP to let an authorized agent create and edit people — including managing a person's email addresses and phone numbers — and to see which synced email addresses aren't linked to anyone yet, so that I can point an AI agent at my synced mail and have it build out and maintain my People list instead of creating every correspondent by hand."

## User Scenarios & Testing *(mandatory)*

"An authorized agent" throughout means an MCP client authenticated per the established mcp-authentik-auth flow. Every write capability mirrors the UI's existing rules — the validation, uniqueness, and primary semantics specced in track-people and multiple-emails-and-phones — and grants an agent no power the UI lacks. All names, addresses, numbers, and dates below are illustrative concrete test data; scenarios run against people and a synced store seeded by test setup.

### User Story 1 - Agent creates a person (Priority: P1)

An authorized agent creates a person by supplying a first name, a last name, at most one email address, at most one phone number, and values for any extra fields defined in the field configuration. The created person is indistinguishable from one created through the UI: they appear on the People page, their record shows the supplied email and phone each marked primary, extra field values display on the record, and everything survives a page reload. When the supplied email already appears in synced mail but is linked to no person, the existing address record becomes linked to the new person, so their mail history is immediately theirs. Invalid input — a blank required name, an email or phone some person already holds, an extra field name not in the field configuration — is rejected with a validation error and no person is created; duplicate-value errors identify the person who already holds the value.

**Why this priority**: Creating people is the point of the feature — the sweep over Tyler's mail, and any other agent-driven upkeep, is worthless unless the agent can create a person the rest of the product treats as first-class.

**Independent Test**: With a seeded synced store and a field configuration defining "Nickname", call the create capability with valid and invalid inputs and confirm via the People page, the person record, and the existing person-query capabilities that exactly the valid calls produced people, with all values intact after a reload.

**Acceptance Scenarios**:

1. **Given** no person has the address jordan.smith@example.com and the field config defines an extra field "Nickname", **When** an authorized agent calls the create-person tool with first name "Jordan", last name "Smith", email "jordan.smith@example.com", phone "555-0142", and Nickname "Jo", **Then** "Jordan Smith" appears on the People page, his record shows that email and phone (each marked primary) and Nickname "Jo" — all still there after a page reload — and get-person returns the same.
2. **Given** a synced conversation "Quote attached" involving jordan.smith@example.com, that address linked to no person, **When** an authorized agent calls create-person with first name "Jordan", last name "Smith", and email "jordan.smith@example.com", **Then** the existing address record becomes linked to the new person — the conversation's detail view shows the address as linked to "Jordan Smith", his record's email section shows "Quote attached", and emails-for-person for Jordan Smith returns it.
3. **Given** person "Sam Rivera" has the address sam.rivera@example.com, **When** an authorized agent calls create-person with first name "Sam", last name "Rivera", and email "Sam.Rivera@example.com" (same address, different case), **Then** the call fails with a validation error saying that email is already in use and identifying "Sam Rivera" as the person who has it, and no new person is created — the People page still lists exactly one Sam Rivera.
4. **Given** the field config does not define a field "Favorite Color", **When** an authorized agent calls create-person with a whitespace-only first name, and then calls create-person with first name "Riley", last name "Chen", and an extra field "Favorite Color", **Then** each call fails with a validation error (first and last name are required; unknown field "Favorite Color") and no person is created.

---

### User Story 2 - Agent discovers unlinked synced addresses (Priority: P2)

An authorized agent asks which email addresses appearing in synced mail are linked to no person. The response lists every unlinked address, ordered by message count descending, and for each gives the address, the number of synced messages involving it in any role (from/to/cc/bcc), the display name most recently seen in mail for that address (the bare address when mail never carried a name), and the date of the most recent message involving it. Addresses linked to a person never appear, and the list reflects link changes immediately — an address drops off as soon as a person gains it. Nothing is suppressed: Tyler's own address and newsletter senders appear like any other unlinked address; deciding what deserves a person is the agent's job.

**Why this priority**: This is the sweep's worklist — it turns "point an agent at my mail" from Tyler hand-collecting addresses into a single call, and its counts and names give the agent what it needs to prioritize and to name the people it creates.

**Independent Test**: Seed a synced store with linked and unlinked addresses at differing message counts, call the discovery capability, create a person for one listed address, and call it again — confirming content, ordering, and the address's disappearance.

**Acceptance Scenarios**:

1. **Given** a synced store where sam.rivera@example.com is linked to person "Sam Rivera" and appears in 5 messages, jordan.smith@example.com is linked to no person and appears in 3 messages (display name "Jordan Smith", most recent 2026-08-05), and news@example.com is linked to no person and appears in 1 message (most recent 2026-08-06), **When** an authorized agent calls the unlinked-addresses tool, then creates person "Jordan Smith" with email jordan.smith@example.com, then calls the tool again, **Then** the first response lists jordan.smith@example.com (message count 3, display name "Jordan Smith", most recent date 2026-08-05) before news@example.com (message count 1) — ordered by message count, descending — with sam.rivera@example.com absent because it is linked; and the second response no longer lists jordan.smith@example.com while news@example.com remains.

---

### User Story 3 - Agent manages a person's email addresses and phone numbers (Priority: P3)

An authorized agent maintains a person's contact lists with three actions per type: add an entry, mark an entry primary, and remove an entry. The semantics are exactly the UI's: exactly one entry of a type is primary whenever any exist, marking an entry primary moves the marker off the previous primary, and removing an entry that was primary promotes one of the remaining entries. Adding an email address that exists in synced mail unlinked links the existing address record, bringing that address's mail history onto the person. Adding a value another person already holds fails with a validation error identifying that person; email comparison is case-insensitive, phone comparison is exact stored text. Removing an address unlinks it from the person — their record stops showing its conversations — while the synced mail itself is untouched.

**Why this priority**: Create-person takes at most one email and one phone, so real records — people with work and personal addresses, multiple numbers — can only be completed through these actions; they are also how an agent maintains records as people's details change.

**Independent Test**: Take seeded people with known contact lists, perform add / mark-primary / remove sequences including duplicate attempts, and confirm each person's record (and its reload-persistence) after every step.

**Acceptance Scenarios**:

1. **Given** person "Jordan Smith" has only the address jordan.smith@example.com (primary), **When** an authorized agent adds the address "jordan@personal.example.com", then marks it primary, then removes "jordan.smith@example.com", **Then** after the add both addresses are listed with jordan.smith@example.com still primary, after the mark the primary marker has moved to jordan@personal.example.com, and after the remove his record holds only jordan@personal.example.com, marked primary — all verified on his record and still true after a page reload.
2. **Given** synced mail contains messages involving ana.alvarez@example.com (linked to no person), person "Ana Alvarez" exists without that address, and person "Sam Rivera" has sam.rivera@example.com, **When** an authorized agent adds "ana.alvarez@example.com" to Ana Alvarez, and then tries to add "sam.rivera@example.com" to Ana Alvarez, **Then** the first call links the existing address record — emails-for-person for Ana Alvarez now returns the previously synced messages, with her address tagged with its role — and the second call fails with a validation error saying that email is already in use and identifying "Sam Rivera", leaving Ana's addresses otherwise unchanged.
3. **Given** person "Ana Alvarez" has phone "555-0200" and person "Jordan Smith" has phone "555-0142" (primary), **When** an authorized agent adds phone "555-0199" to Jordan and marks it primary, then tries to add "555-0200" to Jordan, **Then** Jordan's record lists both numbers with "555-0199" marked primary — still true after a page reload — and the second call fails with a validation error saying that phone number is already in use and identifying "Ana Alvarez".

---

### User Story 4 - Agent edits a person's names and extra fields (Priority: P4)

An authorized agent edits an existing person's first name, last name, and extra configured field values. The same rules as the UI's edit form apply: first and last name must remain non-blank, and only field names present in the field configuration are accepted. Changes show on the People page and the person record and survive a reload. Email addresses and phone numbers are not edited through this path — contact changes go through the add/mark-primary/remove actions of User Story 3.

**Why this priority**: Maintenance matters — names get corrected, nicknames change — but a sweep that only creates already delivers the feature's core value, so editing ranks below creation, discovery, and contact management.

**Independent Test**: Edit a seeded person's last name and an extra field value and confirm the People page and record after a reload; attempt an edit blanking a required name and confirm rejection with the person unchanged.

**Acceptance Scenarios**:

1. **Given** person "Jordan Smith" exists with Nickname "Jo", **When** an authorized agent calls the edit tool changing the last name to "Smith-Lee" and the Nickname to "JS", **Then** the People page shows "Jordan Smith-Lee" and his record shows Nickname "JS" — both still true after a page reload.
2. **Given** person "Jordan Smith" exists, **When** an authorized agent calls the edit tool setting Jordan's last name to "", **Then** the call fails with a validation error saying first and last name are required, and Jordan Smith is unchanged.

---

### User Story 5 - Full contact lists on person fetch (Priority: P5)

When an authorized agent fetches a single person, the response carries every email address and every phone number the person has, with the primary of each type marked — the detail an agent needs to manage contacts without guessing. Search results are unchanged: each result row still carries only the primary email (search-people rows have never carried a phone).

**Why this priority**: It rounds out the agent's read picture and is needed for an agent to verify its own contact edits, but it is a read-surface refinement riding on the write capabilities above.

**Independent Test**: Seed a person with two addresses and two phones, fetch them by id and find them via search, and compare which contact values each response carries.

**Acceptance Scenarios**:

1. **Given** person "Sam Rivera" with addresses sam.rivera@example.com (primary) and sam.personal@example.com, and phones "555-0100" (primary) and "555-0101", **When** an authorized agent fetches Sam Rivera with get-person and searches "sam" with search-people, **Then** the get-person response includes both email addresses and both phone numbers with the primary of each marked, while the search-people result row still shows only the primary email.

---

### Edge Cases

- Create-person with names only (no email, no phone) is valid — email and phone are optional at creation, exactly as on the UI create form.
- Create-person or add-email/add-phone with an empty or whitespace-only email or phone value is rejected with a validation error saying a value is required, and nothing is created or changed.
- Adding a value the same person already holds (including the same email in different letter case) is rejected like any duplicate, identifying that same person as the holder.
- Removing the primary email or phone while other entries of that type remain: one remaining entry is automatically promoted to primary, matching the UI rule — a person is never left with entries but no primary.
- Removing a person's last email or phone entry is valid and leaves them with none of that type.
- Marking the entry that is already primary as primary again changes nothing and is not an error.
- Removing an address never touches synced mail: the messages remain in the synced store, the address simply reverts to unlinked (and so reappears in the discovery list).
- Extra configured fields left unset on create or edit are allowed — extra fields are always optional; only unknown field names are rejected.
- The discovery list when every synced address is linked, or the store is empty: an empty list, not an error.
- An unlinked address whose messages never carried a display name is listed with the bare address in place of a name.
- A caller that is not authenticated per the mcp-authentik-auth flow gets none of these capabilities — calls are rejected without reading or changing any data.

## Requirements *(mandatory)*

### Functional Requirements

**Authorization**

- **FR-001**: Every capability in this feature MUST be available only to MCP clients authenticated per the established mcp-authentik-auth flow; unauthenticated or unauthorized calls MUST be rejected without reading or changing any data.

**Creating a person**

- **FR-002**: An authorized agent MUST be able to create a person by supplying first name, last name, optionally one email address, optionally one phone number, and optionally values for extra configured fields; the created person MUST be indistinguishable from a UI-created person on every existing surface (People page, person record, search, query capabilities), with no provenance marker.
- **FR-003**: An email or phone supplied at creation MUST be stored as that person's primary entry of its type; creation MUST accept at most one email and at most one phone, with further entries added via the contact-management capabilities.
- **FR-004**: Creation MUST reject a blank or whitespace-only first or last name with a validation error saying first and last name are required, creating no person.
- **FR-005**: Creation MUST reject an extra field name not present in the field configuration with a validation error identifying the unknown field, creating no person; values for configured fields MUST persist and display on the person record exactly as UI-entered values do.
- **FR-006**: Creation MUST reject an email address any person already holds (compared case-insensitively) or a phone number any person already holds (compared as exact stored text) with a validation error saying the value is already in use and identifying the person who holds it, creating no person.
- **FR-007**: When a creation supplies an email address that appears in synced mail but is linked to no person, the existing synced address record MUST become linked to the new person — the person's record shows that address's conversations, conversation detail views show the address as linked to the person, and the emails-for-person capability returns those messages.

**Editing a person**

- **FR-008**: An authorized agent MUST be able to edit an existing person's first name, last name, and extra configured field values, under the same validation as creation (required names per FR-004, known fields per FR-005); a failed edit MUST leave the person unchanged, and a successful edit MUST show on the People page and person record and survive a reload.

**Managing email addresses and phone numbers**

- **FR-009**: An authorized agent MUST be able to add an email address or phone number to a person, subject to the same required-value and uniqueness rules as creation (FR-004's blank-value analogue and FR-006), with duplicate rejections identifying the holding person and leaving the person's lists unchanged.
- **FR-010**: Adding an email address that appears in synced mail but is linked to no person MUST link the existing synced address record to that person, exactly as FR-007 does at creation.
- **FR-011**: An authorized agent MUST be able to mark any of a person's email addresses or phone numbers as primary, moving the primary marker off the previous primary of that type; marking the current primary again changes nothing.
- **FR-012**: An authorized agent MUST be able to remove any of a person's email addresses or phone numbers; removing an address unlinks it from the person (their record stops showing its conversations) while synced mail itself is untouched; when the removed entry was primary and others of its type remain, one remaining entry MUST be automatically promoted per the existing UI rule; removing the last entry of a type is valid.
- **FR-013**: Editing an email address or phone number value in place MUST NOT be possible through agent capabilities — the agent path for changing a value is remove plus add.
- **FR-014**: Every agent-made change (create, edit, add, mark-primary, remove) MUST persist: the state it produces MUST still show on the relevant UI surfaces after a page reload.

**Discovering unlinked addresses**

- **FR-015**: An authorized agent MUST be able to fetch the list of email addresses that appear in synced mail and are linked to no person, ordered by message count descending, where each entry carries the address, the count of synced messages involving it in any role (from/to/cc/bcc), the display name most recently seen in mail for it (the bare address when mail never carried a name), and the date of the most recent message involving it.
- **FR-016**: The discovery list MUST reflect the current link state on every call — an address linked to a person never appears, an address that becomes linked (by creation, by adding, or in the UI) is absent from subsequent responses, and an address that reverts to unlinked (its holder removed it) reappears.
- **FR-017**: The discovery list MUST NOT suppress or hide any unlinked address — the mailbox owner's own address and bulk senders appear like any other.

**Reading people**

- **FR-018**: The single-person fetch capability MUST return all of a person's email addresses and all of their phone numbers, with the primary of each type marked.
- **FR-019**: The people-search capability's result rows MUST continue to carry only the primary email.

**Parity boundary**

- **FR-020**: Agent capabilities MUST grant no power the UI lacks: every write mirrors an existing UI action under the same rules, and no agent capability deletes a person.

### Key Entities

- **Person**: Someone Tyler interacts with — required first and last name, optional values for extra configured fields, plus lists of email address entries and phone number entries. Now creatable and editable by an authorized agent as well as through the UI, with no record of which path made a change.
- **Email address entry**: One email address belonging to exactly one person, one per person marked primary. Unique across the product ignoring letter case. May be connected to a synced address record, in which case the person's record shows that address's mail.
- **Phone number entry**: One phone number belonging to exactly one person, one per person marked primary. Unique across the product as exact text.
- **Synced address record**: An email address observed in synced mail, either linked to a person or unlinked. Linking attaches its mail history to the person; unlinking detaches it; the underlying messages are never altered by any capability in this feature.
- **Unlinked address summary**: One row of the discovery list — an unlinked synced address with its message count across all roles, its most recently seen display name (or the bare address), and its most recent message date.
- **Field configuration**: The existing externally maintained definition of extra optional free-text person fields; it bounds which extra field names agent calls may set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized agent can create a fully populated person — names, email, phone, extra field value — in a single call, and 100% of such creations appear on the People page and person record with every supplied value intact after a page reload, indistinguishable from a person created through the UI.
- **SC-002**: 0% of invalid agent calls — blank required name, duplicate email or phone, unknown extra field, blank contact value — create or change any data, and every rejection carries a validation message naming the problem, including the holding person's name for duplicate values.
- **SC-003**: Starting from a synced store with unlinked correspondent addresses, an agent can turn every reported address into a person using only agent capabilities — no UI action — after which each new person's record shows that address's existing mail history and the discovery list no longer contains any of those addresses.
- **SC-004**: 100% of unlinked synced addresses (including the mailbox owner's own) appear in the discovery list with their message count, best-known display name, and most recent date; 0% of linked addresses appear; and every response is ordered by message count descending.
- **SC-005**: 100% of agent-made contact-list changes (add, mark-primary, remove) are visible on the person's record in the UI after a page reload, with primary markers matching what the agent set.
- **SC-006**: 0% of agent write calls succeed in any case where the equivalent UI action would be rejected — the agent surface introduces no way to reach a state the UI forbids.

## Assumptions

- "Authorized agent" means an MCP client authenticated through the already-shipped mcp-authentik-auth flow; this feature adds no new authentication or authorization scheme.
- The validation, uniqueness, and primary-marker rules referenced throughout are exactly those already shipped by track-people and multiple-emails-and-phones; this feature changes no UI behavior and adds no new rules to the UI.
- Tool names used in scenarios (create-person, unlinked-addresses, the edit tool, get-person, search-people, emails-for-person) are working names from the product doc; final tool naming and whether editing is one tool or several finer-grained tools are planning decisions.
- Whether the unlinked-addresses response is limited or paginated is a planning decision; whatever the shape, completeness and message-count-descending ordering as specced must hold.
- Address linking behavior (a person gaining an address that exists in synced mail) matches the address-linking semantics already shipped in the email features; the synced store itself is never modified by people-capabilities.
- Removing an email address that no synced mail references deletes the entry outright rather than leaving an unlinked record — the shipped UI removal semantics (FR-020 parity). The unlink-and-reappear-in-discovery behavior described under removal applies to addresses synced mail references; either way the person no longer holds the address and synced messages are never altered.
- Automated checks run against people and a synced store seeded by test setup; Tyler's manual acceptance pass connects a real agent to the deployed MCP and runs a real create-people sweep over his real mail.

## Out of Scope

- Deleting a person via agent capability — Tyler declined destructive power in agent hands for this slice; the People page remains the deletion path (recorded in the `mcp-tool-expansion` stub).
- Editing an address or phone string in place via agent capability — the UI's edit-in-place stays UI-only; the agent path is remove + add.
- Changes to people-search results — result rows keep their existing primary-only email shape by decision; exposing full lists (or a phone field) in search results stays in the `mcp-tool-expansion` stub.
- Provenance markers — deliberately none: a person created or edited by an agent is indistinguishable from one made in the UI; person-level history is the `person-notes` stub's territory if ever wanted.
- Multiple emails or phones on creation — at most one of each at creation (each becoming primary), mirroring the UI create form; further entries go through the contact-management capabilities.
- A bulk/batch create capability — an agent sweep loops single calls.
- Suppressing or hiding addresses from the unlinked list (Tyler's own address, newsletters) — the list reports every unlinked address; the agent decides what deserves a person.
- Any UI change — no new pages or controls; agent-written data appears through existing UI surfaces.
- Auto-creating people during email sync — permanent per the product brief: ingestion never creates people; creating a person is always a deliberate act, via agent call or the UI.
- Any in-app or scheduled AI — agents remain external MCP consumers per the brief's binding constraint; this feature ships capabilities, and the sweep itself is Tyler prompting an agent.
- The rest of the `mcp-tool-expansion` stub — task link/unlink, note deletion, task move tools, tag write tools, free-text email search.
