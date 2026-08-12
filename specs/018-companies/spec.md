# Feature Specification: Companies

**Feature Branch**: `018-companies`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: product feature doc `docs/product/features/companies.md` (a deliberately thin Company model — a name, tags, and links to people and cards — with a dedicated Companies page, person/card linking, and full MCP parity)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage companies on a dedicated page (Priority: P1)

As Tyler, I open a Companies page from the top navigation to see every organization I work with, listed alphabetically. From there I create a company by name, open a company's detail page, and rename it when needed. Names are required and unique regardless of letter case, so the list never accumulates duplicates or blanks.

**Why this priority**: Companies must exist before anything can be linked to them — the page, creation, and naming rules are the foundation every other story builds on.

**Independent Test**: Can be fully tested by opening the Companies page from the nav, creating companies, attempting invalid names, and renaming from the detail page — with no people, cards, or tags involved.

**Acceptance Scenarios**:

1. **Given** no companies exist, **When** I open the Companies page via a "Companies" link in the top navigation bar, **Then** the nav marks Companies as the active section and the page shows a styled empty-state message instead of a list.
2. **Given** no companies exist and the Companies page is open, **When** I create a company named "Acme Inc", **Then** "Acme Inc" appears in the list — still true after a page reload.
3. **Given** the company "Acme Inc" exists, **When** I create a company named "Zephyr Co", **Then** the list shows "Acme Inc" above "Zephyr Co" — alphabetical by name — still true after a page reload.
4. **Given** companies "Acme Inc" and "Zephyr Co" exist, **When** I try to create a company named "acme inc" (same name, different case) and then try to create one with a blank name, **Then** both attempts are rejected with validation messages — the duplicate because the name is already in use (matched case-insensitively), the blank because a name is required — and no extra company is created.
5. **Given** the company "Acme Inc" exists, **When** I open its detail page, **Then** it shows the company's name and styled empty-state messages for its people, cards, and tags sections.
6. **Given** the company "Acme Inc" exists, **When** I rename it to "Acme Corp" from its detail page, **Then** "Acme Corp" is the name shown on its detail page and on the Companies list — still true after a page reload.

---

### User Story 2 - Assign a person to a company (Priority: P2)

As Tyler, while editing a person's record, I search for an existing company by name, select it as that person's company, and save. Later I can switch the person to a different company or clear the field entirely. The company's detail page always lists exactly the people currently assigned to it.

**Why this priority**: Seeing who works at each organization is the core promise of the user story — the first link type that makes a company more than a name.

**Independent Test**: Can be fully tested by seeding two companies and one person, then setting, switching, and clearing the person's company while checking the person record and both companies' detail pages.

**Acceptance Scenarios**:

1. **Given** companies "Acme Corp" and "Globex" exist and person "Sam Rivera" has no company, **When** I edit Sam Rivera's record, search and select "Acme Corp" as his company, and save, **Then** Sam Rivera's record shows company "Acme Corp" and Acme Corp's detail page lists him in its people section — still true after a page reload.
2. **Given** Sam Rivera's company is "Acme Corp", **When** I edit his record, switch the company field to "Globex", and save, **Then** his record shows "Globex" instead, Acme Corp's people section no longer lists him, and Globex's people section does — all still true after a page reload.
3. **Given** Sam Rivera's company is "Globex", **When** I edit his record, clear the company field, and save, **Then** his record shows no company, and Globex's people section no longer lists him — still true after a page reload.

---

### User Story 3 - Link companies to kanban cards (Priority: P3)

As Tyler, on a card's detail view I use a linked-companies search to attach one or more existing companies to the card, and remove them again when they no longer apply. Each linked company's detail page lists the card in its cards section, so I can see which cards involve each organization.

**Why this priority**: Connects companies to work in flight, completing the "which cards involve them" half of the user story; it builds on companies existing but not on person assignment.

**Independent Test**: Can be fully tested by seeding one card and two companies, then adding both companies to the card, removing one, and checking the card's detail view and both companies' cards sections.

**Acceptance Scenarios**:

1. **Given** the card "Follow up with Sam" exists on the kanban board and companies "Acme Corp" and "Globex" exist, unlinked from the card, **When** I open the card's detail view and use its linked-companies search to add both "Acme Corp" and "Globex", **Then** the card shows both companies and both companies' detail pages list the card in their cards sections — still true after a page reload.
2. **Given** the card "Follow up with Sam" is linked to "Acme Corp" and "Globex", **When** I remove "Globex" from the card's detail view, **Then** the card shows only "Acme Corp", Globex's cards section no longer lists the card, and Acme Corp's still does — all still true after a page reload.

---

### User Story 4 - Browse a large company without clutter (Priority: P4)

As Tyler, when I open the detail page of a company linked to many people and many cards, each section shows a first page of results with a load-more control, so the page stays scannable while everything remains reachable.

**Why this priority**: A scale refinement of the detail page — it matters only once real volumes accumulate, and the feature is usable without it at small scale.

**Independent Test**: Can be fully tested by seeding one company with 30 linked people and 30 linked cards, opening its detail page, and activating each section's load-more control independently.

**Acceptance Scenarios**:

1. **Given** the company "Acme Corp" linked to 30 people (seeded via test setup, alphabetical by last name) and 30 cards (seeded via test setup, alphabetical by title), **When** I open Acme Corp's detail page, **Then** the people section shows the first 25 people with a load-more control that reveals all 30 when activated, and the cards section independently shows the first 25 cards with its own load-more control that reveals all 30.

---

### User Story 5 - Tag a company from the shared tag pool (Priority: P5)

As Tyler, on a company's detail page I type into a tag input that suggests existing tags from the same vocabulary people and tasks use, and the selected tag appears as a chip on the company. Companies never grow a separate tag namespace.

**Why this priority**: Extends existing cross-cutting context to companies; valuable but additive — every earlier story works without it.

**Independent Test**: Can be fully tested by creating a tag on a person or task, then attaching it to a company via the suggestion input and confirming the Tags page still lists exactly one such tag.

**Acceptance Scenarios**:

1. **Given** the tag "VIP" already exists (created earlier on a person or task) and the company "Acme Corp" has no tags, **When** I type "vip" into Acme Corp's tag input on its detail page and select the suggested existing tag, **Then** Acme Corp shows the "VIP" chip and the Tags page still lists exactly one "VIP" tag — still true after a page reload.

---

### User Story 6 - Delete a company safely (Priority: P6)

As Tyler, I delete a company from its detail page behind a confirmation that tells me how many people and cards are linked to it. Cancelling changes nothing; confirming removes the company and all its links everywhere, while the people, cards, and tags themselves survive untouched.

**Why this priority**: Completes the lifecycle, but destructive cleanup only matters once companies and links exist — it depends on the linking stories to be meaningful.

**Independent Test**: Can be fully tested by seeding a company linked to one person, one card, and one tag, then cancelling a delete, confirming a delete, and checking every surface the company appeared on.

**Acceptance Scenarios**:

1. **Given** the company "Acme Corp" linked to person "Sam Rivera", card "Follow up with Sam", and tag "VIP", **When** I start deleting Acme Corp from its detail page and cancel, **Then** nothing changes anywhere — the company, its links, and its tag are all intact.
2. **Given** the company "Acme Corp" linked to person "Sam Rivera", card "Follow up with Sam", and tag "VIP", **When** I start deleting Acme Corp and confirm, **Then** the confirmation names that the company is linked to 1 person and 1 card, and confirming removes "Acme Corp" from the Companies list, Sam Rivera's record shows no company, the card shows no "Acme Corp" link, and "VIP" still exists on the Tags page — all still true after a page reload.

---

### User Story 7 - Agents get full company parity over MCP (Priority: P7)

As Tyler, an authorized agent (an MCP client authenticated per the mcp-server feature) working on my behalf can do everything with companies the web app can: create, rename, delete, list, fetch detail (with linked people, cards, and tags), set or clear a person's company, and add or remove a company on a card — and what it does is immediately visible in the web app, and vice versa.

**Why this priority**: Mirrors the finished UI surface for agents; it depends on every UI capability existing first, so it lands last even though it's a headline part of the feature.

**Independent Test**: Can be fully tested by driving the full company lifecycle through MCP tool calls and cross-checking each result in both the MCP responses and the web app.

**Acceptance Scenarios**:

1. **Given** no company named "Initech" exists, **When** an authorized agent calls the create-company tool with name "Initech", lists companies, fetches Initech's detail, renames it to "Initech LLC", and deletes it — all via MCP tools, **Then** after creation Initech appears in the list-companies response and its detail returns its id, name, and empty people/cards/tags; after the rename both the MCP detail response and the web app's Companies page show "Initech LLC"; after the deletion it no longer appears in the MCP list-companies response or the web app's Companies page.
2. **Given** person "Sam Rivera", card "Follow up with Sam", and company "Globex" all exist, with Globex unlinked from both, **When** an authorized agent calls the MCP tools to set Sam Rivera's company to "Globex" and to add "Globex" to the card, **Then** the get-person response for Sam Rivera and the get-task response for the card each include company "Globex", Globex's own MCP detail response lists Sam Rivera among its people and the card among its cards, and the web app shows the same — Sam Rivera's record shows "Globex", the card shows "Globex" linked, and Globex's detail page lists both.

---

### Edge Cases

- Creating or renaming a company with a name that is empty or whitespace-only: rejected with a "name is required" validation message; surrounding whitespace on an otherwise valid name is trimmed before saving and before uniqueness checks.
- Creating or renaming to a name already used by another company, in any letter casing: rejected with a "name is already in use" validation message; renaming a company to a different casing of its own name is allowed.
- The person-edit company search and the card linked-companies search match existing companies only (case-insensitive substring on name, per the linked-people search precedent); a name that matches nothing yields no selectable result and offers no create option.
- Adding a company to a card it is already linked to: the linked-companies search does not offer companies already linked to that card, so a duplicate link cannot be created.
- A company's people or cards section with 25 or fewer entries: all entries are shown and no load-more control appears; the two sections paginate independently, so one can show a load-more control while the other does not.
- Deleting a company with no links: the confirmation still appears, naming 0 people and 0 cards.
- Deleting a company that people are assigned to: those people remain, each simply showing no company afterwards — clearing an assignment or deleting a company never deletes a person, card, or tag.
- Typing a tag name into a company's tag input that case-insensitively matches an existing tag: the existing tag is suggested and attaching it never creates a duplicate tag record.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Company record consisting of a name, attached tags, linked people, and linked cards — no other fields. A person belongs to at most one company; a card can be linked to any number of companies; a company can have any number of people, cards, and tags.
- **FR-002**: Company names MUST be non-empty after trimming surrounding whitespace and MUST be unique case-insensitively. Violating creates and renames are rejected with a visible validation message (a name is required; the name is already in use) and change nothing; renaming a company to a different casing of its own name is allowed.
- **FR-003**: The top navigation bar MUST include a "Companies" link that opens a Companies page and marks Companies as the active section while on it.
- **FR-004**: The Companies page MUST list all companies alphabetically by name and MUST show a styled empty-state message instead of a list when no companies exist.
- **FR-005**: The Companies page MUST offer company creation by name, subject to FR-002. This is the only place companies are created — the person-edit and card pickers MUST NOT offer inline creation.
- **FR-006**: Each company MUST have a detail page showing its name and its people, cards, and tags sections, each section showing a styled empty-state message when empty.
- **FR-007**: The detail page MUST allow renaming the company, subject to FR-002; a successful rename is reflected everywhere the company appears.
- **FR-008**: The person edit form MUST offer a company field that searches existing companies by name (case-insensitive substring match) and lets the user select one, switch to another, or clear it; the person's record shows their current company, and each company's detail page people section lists exactly the people currently assigned to it.
- **FR-009**: The card detail view MUST offer a linked-companies search (existing companies only, case-insensitive substring match on name, excluding companies already linked to the card) to add companies to the card, and MUST let the user remove a linked company; the card shows its linked companies, and each company's detail page cards section lists exactly the cards currently linked to it.
- **FR-010**: The company detail page's people section MUST list linked people alphabetically by last name and its cards section MUST list linked cards alphabetically by title; each section MUST independently show the first 25 entries with a load-more control that reveals the remainder, and MUST omit the control when 25 or fewer entries exist.
- **FR-011**: Companies MUST share the single existing tag vocabulary with people and tasks: the company detail page offers the same tag input pattern (suggesting existing tags case-insensitively, excluding tags already attached), attached tags render as chips, and attaching an existing tag never creates a duplicate tag record.
- **FR-012**: The detail page MUST allow deleting the company behind an in-app confirmation that states how many people and how many cards are linked to it. Cancelling changes nothing; confirming removes the company, clears it from every assigned person, removes it from every linked card, and detaches its tags — while the people, cards, and tags themselves are never deleted.
- **FR-013**: All company data — companies, their names, tag attachments, person assignments, and card links — MUST persist, so every outcome above still holds after a page reload.
- **FR-014**: Authorized agents (MCP clients authenticated per the mcp-server feature) MUST be able to mirror the web app's company capabilities via MCP tools: create a company, rename it, delete it, list all companies, fetch a company's detail (its id, name, and linked people, cards, and tags — tags read-only), set or clear a person's company, and add or remove a company on a card — all subject to the same validation and unlinking rules as the web app.
- **FR-015**: The existing get-person and get-task MCP responses MUST include the record's company (for a person) or linked companies (for a card), and every change made via MCP MUST be visible in the web app and vice versa.

### Key Entities

- **Company**: An organization Tyler works with. Attributes: a required, case-insensitively unique name and attached tags — nothing else in this slice. Related to people (one company to many people), cards (many to many), and tags (via the shared vocabulary).
- **Person**: Existing record that gains a single optional company assignment, shown on the person's record and settable from the person edit form.
- **Card**: Existing kanban record that gains links to any number of companies, managed from the card's detail view.
- **Tag**: Existing shared vocabulary record, unchanged in shape, now also attachable to companies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a company from the Companies page and see it in the alphabetical list in one uninterrupted interaction, with the result intact after a page reload.
- **SC-002**: 100% of invalid company-name submissions (blank, whitespace-only, or a case-insensitive duplicate) — on create or rename, via web app or agent tools — are rejected with a visible validation message and produce no change to the company list.
- **SC-003**: 100% of person-company changes (set, switch, clear) are reflected consistently on the person's record and on every affected company's detail page, including after a page reload.
- **SC-004**: 100% of card-company link changes (add, remove) are reflected consistently on the card's detail view and on every affected company's detail page, including after a page reload.
- **SC-005**: A company with 30 linked people and 30 linked cards presents each section as a 25-entry first page, and one activation of each section's load-more control reveals that section's full list.
- **SC-006**: Deleting a linked company removes it from 100% of the surfaces where it appeared (Companies list, person records, card detail views) while 100% of the people, cards, and tags it was linked to still exist afterwards.
- **SC-007**: Attaching existing tags to companies never changes the number of tags on the Tags page.
- **SC-008**: An authorized agent can perform the complete company lifecycle (create, list, fetch detail, rename, link to a person and a card, delete) through agent tools alone, and every intermediate state matches what the web app shows at that moment.

## Assumptions

- The card's linked-companies search follows the same existing-only, case-insensitive substring-match pattern as the task linked-people search from the track-people feature (name only, since a company has no email to search by) — flagged for confirmation in the feature doc.
- The company detail page's people section sorts alphabetically by last name (matching the People page) and its cards section sorts alphabetically by title — flagged for confirmation in the feature doc.
- MCP tool coverage in this slice is create/rename/delete/list/get-detail for companies, plus set-a-person's-company and add/remove-company-on-a-card, with exact tool names left to `/speckit-plan` — flagged for confirmation in the feature doc.
- Rename uses the same validation as create (case-insensitive uniqueness, name required), with a company's own name in a different casing allowed — mirroring the tags feature's rename rules.
- The delete confirmation appears even when the company has 0 linked people and 0 linked cards, stating the zero counts — mirroring the tags feature's delete behavior.
- The MCP tool that sets a person's company can also clear it, since the web app can and MCP mirrors the web app.
- The MCP company-detail response returns the complete people and cards lists without pagination — the 25-per-page load-more is a web-page presentation concern.
- The company tag input supports the full inline pattern from the tags feature (attach existing, create new, detach) since companies join the same tag pool; only MCP tag writes for companies are excluded, per the feature doc's out-of-scope list.
- Alphabetical ordering on the Companies list is case-insensitive, so "acme" and "Acme" would sort together rather than by character code.

## Out of Scope

Per the feature doc, this slice excludes: more than one company per person (an "employer" model, not many-to-many); any company fields beyond name, id, and tags (logo, address, website, industry, notes are future work); company hierarchy (parents, subsidiaries, divisions); search or filter controls on the Companies list (fixed alphabetical order only); creating a company inline from the person or card picker; company chips or indicators on the kanban card face; MCP tag write tools for companies (company detail includes tags read-only over MCP); bulk operations; and authentication / multi-user access control.
