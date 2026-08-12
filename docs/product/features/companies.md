# Feature: companies

## User story

As Tyler, I want a simple Company model — a name, tags, and links to the people and cards that belong to it — so that I can see who I work with at each organization and which cards involve them, without cramming that context into notes. This is a deliberately thin first slice I can extend later.

## Acceptance criteria

A person can belong to at most one company; a card can be linked to multiple companies. Companies share the same tag pool as people and tasks (per `tags.md`). "An authorized agent" means an MCP client authenticated per the mcp-server feature. MCP tools mirror what the web app can do for companies: create, rename, delete, list, get detail (with linked people, cards, and tags), assign a person's company, and add/remove a company on a card. All company, person, and card names are illustrative concrete test data.

- **Given** no companies exist
  **When** I open the Companies page via a "Companies" link in the top navigation bar and create a company named "Acme Inc"
  **Then** the nav marks Companies as the active section, the page previously showed a styled empty-state message instead of a list, and "Acme Inc" now appears in the list — still true after a page reload

- **Given** the company "Acme Inc" exists
  **When** I create a company named "Zephyr Co", then try to create another company named "acme inc" (same name, different case), then try to create one with a blank name
  **Then** "Zephyr Co" is created and the list shows "Acme Inc" above "Zephyr Co" (alphabetical by name), while both other attempts are rejected with validation messages ("acme inc" is already in use, matched case-insensitively; a name is required) and no extra company is created

- **Given** the company "Acme Inc" exists
  **When** I open its detail page (showing its name and empty-state messages for its people, cards, and tags sections) and rename it to "Acme Corp"
  **Then** "Acme Corp" is the name shown on its detail page and on the Companies list — still true after a page reload

- **Given** companies "Acme Corp" and "Globex" exist and person "Sam Rivera" has no company
  **When** I edit Sam Rivera's record, search and select "Acme Corp" as his company and save, then later edit his record again, switch the company field to "Globex", and save
  **Then** after the first save Sam Rivera's record shows company "Acme Corp" and Acme Corp's detail page lists him in its people section; after the switch his record shows "Globex" instead, Acme Corp's people section no longer lists him, and Globex's people section does — all still true after a page reload

- **Given** Sam Rivera's company is "Globex"
  **When** I edit his record, clear the company field, and save
  **Then** his record shows no company, and Globex's people section no longer lists him — still true after a page reload

- **Given** the card "Follow up with Sam" exists on the kanban board and companies "Acme Corp" and "Globex" exist, unlinked from the card
  **When** I open the card's detail view, use its linked-companies search to add both "Acme Corp" and "Globex", and then remove "Globex"
  **Then** after adding, the card shows both companies and both companies' detail pages list the card in their cards section; after removing "Globex", the card shows only "Acme Corp", Globex's cards section no longer lists it, and Acme Corp's still does — all still true after a page reload

- **Given** the company "Acme Corp" linked to 30 people (seeded via test setup, alphabetical by last name) and 30 cards (seeded via test setup, alphabetical by title)
  **When** I open Acme Corp's detail page
  **Then** the people section shows the first 25 people with a load-more control that reveals all 30 when activated, and the cards section independently shows the first 25 cards with its own load-more control that reveals all 30

- **Given** the tag "VIP" already exists (created earlier on a person or task) and the company "Acme Corp" has no tags
  **When** I type "vip" into Acme Corp's tag input on its detail page and select the suggested existing tag
  **Then** Acme Corp shows the "VIP" chip and the Tags page still lists exactly one "VIP" tag — still true after a page reload

- **Given** the company "Acme Corp" linked to person "Sam Rivera", card "Follow up with Sam", and tag "VIP"
  **When** I start deleting Acme Corp from its detail page and cancel, then start again and confirm
  **Then** the cancel changes nothing anywhere; the confirmation names that the company is linked to 1 person and 1 card; confirming removes "Acme Corp" from the Companies list, Sam Rivera's record shows no company, the card shows no "Acme Corp" link, and "VIP" still exists on the Tags page — all still true after a page reload

- **Given** no company named "Initech" exists
  **When** an authorized agent calls the create-company tool with name "Initech", lists companies, fetches Initech's detail, renames it to "Initech LLC", and deletes it — all via MCP tools
  **Then** after creation Initech appears in the list-companies response and its detail returns its id, name, and empty people/cards/tags; after the rename both the MCP detail response and the web app's Companies page show "Initech LLC"; after the deletion it no longer appears in the MCP list-companies response or the web app's Companies page

- **Given** person "Sam Rivera", card "Follow up with Sam", and company "Globex" all exist, with Globex unlinked from both
  **When** an authorized agent calls the MCP tools to set Sam Rivera's company to "Globex" and to add "Globex" to the card
  **Then** the get-person response for Sam Rivera and the get-task response for the card each include company "Globex", Globex's own MCP detail response lists Sam Rivera among its people and the card among its cards, and the web app shows the same — Sam Rivera's record shows "Globex", the card shows "Globex" linked, and Globex's detail page lists both

## Out of scope

- More than one company per person — a person has at most one company in this slice (an "employer" model, not a many-to-many one).
- Any company fields beyond name, ID, and tags — logo, address, website, industry, notes, or any other metadata is future work (the `custom-fields` stub already covers general custom fields).
- Company hierarchy (parent companies, subsidiaries, divisions).
- Search or filter controls on the Companies list page — fixed alphabetical order only, matching the People page precedent.
- Creating a company inline from the person or card picker — a company must already exist (created on the dedicated Companies page) before it can be assigned to a person or added to a card.
- Company chips or indicators on the kanban card face — cards stay title-only, per the `kanban-card-indicators` stub.
- MCP tag write tools for companies (attach/detach a tag via MCP) — get-company includes tags read-only, matching the precedent set in `tags.md` where no entity gained MCP tag write tools.
- Bulk operations (bulk delete, bulk assign, bulk tagging).
- Authentication / multi-user access control.

## Open questions

Interview resolved (2026-08-12): full MCP parity alongside the UI (create, rename, delete, list, get detail, assign to person, add/remove on card); companies are created only from a dedicated Companies page; a person's company is set by searching/selecting an existing company (no inline creation); a card can link multiple companies via the same existing-only search pattern; the company detail page's people and cards sections each paginate independently with 25-per-page load-more; deleting a linked company requires an in-app confirmation naming the linked counts, then unlinks everywhere without deleting the people or cards; company names are required and case-insensitively unique; renaming is supported from the detail page.

- **Assumption to confirm:** the card's linked-companies search follows the same existing-only, case-insensitive substring-match pattern as the task linked-people search from `track-people.md` (name only, since a company has no email to search by).
- **Assumption to confirm:** the company detail page's people section sorts alphabetically by last name (matching the People page) and its cards section sorts alphabetically by title — neither order was explicitly discussed.
- **Assumption to confirm:** MCP tool coverage in this slice is create/rename/delete/list/get-detail for companies, plus set-a-person's-company and add/remove-company-on-a-card — matching "everything the UI can do" as discussed, with exact tool names left to `/speckit-plan`.
- None remaining — ready for `/speckit-specify`.
