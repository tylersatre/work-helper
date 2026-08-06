# Feature: <name>

Copy this file to `docs/product/features/<name>.md` and fill it in before running `/speckit-specify @docs/product/features/<name>.md`.

## User story

As Tyler, I want <capability> so that <benefit>.

## Acceptance criteria

Write each as Given/When/Then. A feature isn't done until every criterion here has a passing automated check and browser evidence (see `.specify/memory/constitution.md`).

- **Given** <starting state>
  **When** <action>
  **Then** <observable outcome>

- **Given** <starting state>
  **When** <action>
  **Then** <observable outcome>

## Out of scope

What this feature explicitly does NOT cover, so implementation doesn't creep into it and review doesn't flag it as missing.

## Open questions

Anything Tyler still needs to decide before `/speckit-plan` can run without guessing.

---

## Example (filled in)

# Feature: link-email-to-contact

## User story

As Tyler, I want to link an ingested email to a person so that when I open a contact I can see every email connected to them, without hunting through Outlook.

## Acceptance criteria

- **Given** an ingested email whose sender address matches no existing contact
  **When** I open that email in work-helper
  **Then** I see a prompt to link it to an existing contact or create a new one

- **Given** an email already linked to a contact
  **When** I open that contact's page
  **Then** the email appears in that contact's email list, newest first

- **Given** an email linked to the wrong contact
  **When** I unlink it and link it to the correct contact
  **Then** it disappears from the first contact's email list and appears in the second's, and this survives a page reload

## Out of scope

- Bulk re-linking of historical emails (separate feature).
- Auto-suggesting a contact match by name/domain heuristics (separate feature — this one is manual linking only).

## Open questions

- None — ready for `/speckit-specify`.
