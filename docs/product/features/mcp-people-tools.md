# Feature: mcp-people-tools

## User story

As Tyler, I want the work-helper MCP to let an authorized agent create and edit people — including managing a person's email addresses and phone numbers — and to see which synced email addresses aren't linked to anyone yet, so that I can point an AI agent at my synced mail and have it build out and maintain my People list instead of creating every correspondent by hand.

## Acceptance criteria

"An authorized agent" means an MCP client authenticated per the mcp-authentik-auth flow. Every write tool mirrors the UI's existing rules — the validation, uniqueness, and primary semantics specced in track-people and multiple-emails-and-phones — and grants MCP no power the UI lacks. Criteria run against people and a synced store seeded by test setup; Tyler's manual acceptance pass connects a real agent to the deployed MCP and runs a real create-people sweep over his real mail. All names, addresses, numbers, and dates are illustrative concrete test data.

- **Given** no person has the address jordan.smith@example.com and the field config defines an extra field "Nickname"
  **When** an authorized agent calls the create-person tool with first name "Jordan", last name "Smith", email "jordan.smith@example.com", phone "555-0142", and Nickname "Jo"
  **Then** "Jordan Smith" appears on the People page, his record shows that email and phone (each marked primary) and Nickname "Jo" — all still there after a page reload — and get-person returns the same

- **Given** a synced conversation "Quote attached" involving jordan.smith@example.com, that address linked to no person
  **When** an authorized agent calls create-person with first name "Jordan", last name "Smith", and email "jordan.smith@example.com"
  **Then** the existing address record becomes linked to the new person — the conversation's detail view shows the address as linked to "Jordan Smith", his record's email section shows "Quote attached", and emails-for-person for Jordan Smith returns it

- **Given** person "Sam Rivera" has the address sam.rivera@example.com
  **When** an authorized agent calls create-person with first name "Sam", last name "Rivera", and email "Sam.Rivera@example.com" (same address, different case)
  **Then** the call fails with a validation error saying that email is already in use and identifying "Sam Rivera" as the person who has it, and no new person is created — the People page still lists exactly one Sam Rivera

- **Given** person "Jordan Smith" exists with Nickname "Jo"
  **When** an authorized agent calls the edit tool changing the last name to "Smith-Lee" and the Nickname to "JS"
  **Then** the People page shows "Jordan Smith-Lee" and his record shows Nickname "JS" — both still true after a page reload

- **Given** person "Jordan Smith" exists
  **When** an authorized agent calls create-person with a whitespace-only first name, then calls the edit tool setting Jordan's last name to "", then calls create-person with first name "Riley", last name "Chen", and an extra field "Favorite Color" not present in the field config
  **Then** each call fails with a validation error (first and last name are required; unknown field "Favorite Color"), no person is created, and Jordan Smith is unchanged

- **Given** person "Jordan Smith" has only the address jordan.smith@example.com (primary)
  **When** an authorized agent adds the address "jordan@personal.example.com", then marks it primary, then removes "jordan.smith@example.com"
  **Then** after the add both addresses are listed with jordan.smith@example.com still primary, after the mark the primary marker has moved to jordan@personal.example.com, and after the remove his record holds only jordan@personal.example.com, marked primary — all verified on his record and still true after a page reload

- **Given** synced mail contains messages involving ana.alvarez@example.com (linked to no person), person "Ana Alvarez" exists without that address, and person "Sam Rivera" has sam.rivera@example.com
  **When** an authorized agent adds "ana.alvarez@example.com" to Ana Alvarez, and then tries to add "sam.rivera@example.com" to Ana Alvarez
  **Then** the first call links the existing address record — emails-for-person for Ana Alvarez now returns the previously synced messages, with her address tagged with its role — and the second call fails with a validation error saying that email is already in use and identifying "Sam Rivera", leaving Ana's addresses otherwise unchanged

- **Given** person "Ana Alvarez" has phone "555-0200" and person "Jordan Smith" has phone "555-0142" (primary)
  **When** an authorized agent adds phone "555-0199" to Jordan and marks it primary, then tries to add "555-0200" to Jordan
  **Then** Jordan's record lists both numbers with "555-0199" marked primary — still true after a page reload — and the second call fails with a validation error saying that phone number is already in use and identifying "Ana Alvarez"

- **Given** a synced store where sam.rivera@example.com is linked to person "Sam Rivera" and appears in 5 messages, jordan.smith@example.com is linked to no person and appears in 3 messages (display name "Jordan Smith", most recent 2026-08-05), and news@example.com is linked to no person and appears in 1 message (most recent 2026-08-06)
  **When** an authorized agent calls the unlinked-addresses tool, then creates person "Jordan Smith" with email jordan.smith@example.com, then calls the tool again
  **Then** the first response lists jordan.smith@example.com (message count 3, display name "Jordan Smith", most recent date 2026-08-05) before news@example.com (message count 1) — ordered by message count, descending — with sam.rivera@example.com absent because it is linked; and the second response no longer lists jordan.smith@example.com while news@example.com remains

- **Given** person "Sam Rivera" with addresses sam.rivera@example.com (primary) and sam.personal@example.com, and phones "555-0100" (primary) and "555-0101"
  **When** an authorized agent fetches Sam Rivera with get-person and searches "sam" with search-people
  **Then** the get-person response includes both email addresses and both phone numbers with the primary of each marked, while the search-people result row still shows only the primary email and phone

## Out of scope

- Deleting a person via MCP — Tyler declined destructive power in agent hands for this slice; the People page remains the deletion path. Recorded in the `mcp-tool-expansion` stub.
- Editing an address or phone string in place via MCP — the UI's edit-in-place stays UI-only; the MCP path is remove + add.
- search-people response changes — result rows keep primary-only email and phone by decision; exposing full lists in search results stays in the `mcp-tool-expansion` stub.
- Provenance markers — deliberately none: a person created or edited via MCP is indistinguishable from one made in the UI. Person-level history is the `person-notes` stub's territory if ever wanted.
- Multiple emails or phones on create-person — at most one of each at creation (each becoming primary), mirroring the UI create form; further entries go through the manage tools.
- A bulk/batch create tool — an agent sweep loops single calls.
- Suppressing or hiding addresses from the unlinked-addresses list (Tyler's own address, newsletters) — the list reports every unlinked address; the agent decides what deserves a person.
- Any UI change — no new pages or controls; MCP-written data appears through existing UI surfaces.
- Auto-creating people during email sync — permanent per the brief: ingestion never creates people; creating a person is always a deliberate act, now via agent tool call or the UI.
- Any in-app or scheduled AI — agents remain external MCP consumers per the brief's binding constraint; this feature ships tools, and the sweep itself is Tyler prompting an agent.
- The rest of the `mcp-tool-expansion` stub — task link/unlink, note deletion, task move tools, tag write tools, free-text email search.

## Open questions

Interview resolved (2026-08-11): tools are create-person, an edit for names and extra fields, and add/remove/set-primary for emails and phones — no delete; a discovery tool lists unlinked synced addresses ordered by message count descending; create-person with an unlinked synced address links it, and conflicts with an owned address fail with an error identifying the owner; get-person gains full email/phone lists while search-people stays primary-only; extra config fields are settable with unknown field names rejected; create-person takes at most one email and one phone; no provenance markers.

- **Confirmed (2026-08-11):** removing an address via MCP behaves exactly like the UI remove — the address unlinks from the person (their record stops showing its conversations), and the synced mail itself is untouched.
- **Confirmed (2026-08-11):** the unlinked-addresses list counts messages involving the address in any role (from/to/cc/bcc), and shows the display name most recently seen in mail for that address (bare address when mail never carried a name).
- **Confirmed (2026-08-11):** Tyler's own address appears in the unlinked list like any other until a person holds it — no built-in suppression; the sweep prompt simply tells the agent whose mailbox it is.
- Tool names, whether editing is one update tool or several finer-grained tools, and any limit/pagination on the unlinked-addresses response are `/speckit-plan` decisions.
- None remaining — ready for `/speckit-specify`.
