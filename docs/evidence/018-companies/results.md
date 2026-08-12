
# Browser evidence: Companies (018-companies) — US1–US6

Driven live by the `browser-tester` agent against the dev server (API :3018, UI :5118) on 2026-08-12. Every scenario below was observed in a real browser, not asserted — every "survives after reload" claim was checked with an actual page reload.

## US1 — Manage companies on a dedicated page (P1) — ALL PASS

1. Nav "Companies" active + styled empty state on empty list — PASS. `us1-01-empty-state.png`
2. Create "Acme Inc", appears in list, survives reload — PASS. `us1-02-alphabetical-list.png` (shows Acme Inc in the list; captured after step 3 also created Zephyr Co), reload confirmed
3. Create "Zephyr Co", alphabetical order Acme Inc → Zephyr Co, survives reload — PASS. `us1-02-alphabetical-list.png`
4. Duplicate "acme inc" rejected with "That company name is already in use"; blank name rejected with "A name is required"; no extra company created — PASS. `us1-03-duplicate-rejected.png`, `us1-04-blank-name-rejected.png`
5. Acme Inc detail page shows name + empty-state messages for people/cards/tags — PASS. `us1-05-detail-empty-sections.png`
6. Rename to "Acme Corp", reflected on detail page and list, survives reload — PASS. `us1-06-renamed-acme-corp.png`

## US2 — Assign a person to a company (P2) — ALL PASS

Seeded "Globex" company and "Sam Rivera" person via the UI.

1. Set Sam Rivera's company to "Acme Corp" via search/select; his record and Acme Corp's people section reflect it, survives reload — PASS. `us2-01-sam-assigned-acme.png` (company detail page), `us2-04-person-record-shows-company.png` (person record itself, showing "Globex" — captured separately below after independent verification flagged that the populated person-record display specifically needed its own screenshot; also added `data-testid="person-company"` coverage in `tests/component/person-detail-page.test.ts`)
2. Switch to "Globex"; his record updates, Acme Corp no longer lists him, Globex does, survives reload — PASS. `us2-02-sam-switched-globex.png`, `us2-04-person-record-shows-company.png` (person record shows "Globex" directly under the name, verified after a page reload)
3. Clear the company field; no company shown, Globex no longer lists him, survives reload — PASS. `us2-03-cleared-no-company.png`

## US3 — Link companies to kanban cards (P3) — ALL PASS

Created card "Follow up with Sam" on the board.

1. Link both "Acme Corp" and "Globex" via linked-companies search; card shows both, both companies' detail pages list the card, survives reload — PASS. `us3-01-card-two-companies.png`, `us3-02-globex-lists-card.png`
2. Remove "Globex"; card shows only Acme Corp, Globex's cards section no longer lists it, Acme Corp's still does, survives reload — PASS. `us3-03-globex-removed-acme-remains.png`

## US4 — Browse a large company without clutter (P4) — PASS

Seeded company "Big Co" with 30 people and 30 cards via API calls run from the page context.

1. Detail page shows first 25 people with an independent "Show all" control revealing all 30; cards section independently shows 25 with its own "Show all" control revealing all 30; activating one control does not affect the other section — PASS. `us4-01-loadmore-before.png` (both sections at 25 with separate controls), `us4-02-loadmore-people-after.png` (People expanded to 30, Cards still 25 with its own control), `us4-03-loadmore-both-after.png` (both expanded to 30, no controls remain)

## US5 — Tag a company from the shared tag pool (P5) — PASS

Created the "VIP" tag on Sam Rivera first (so it pre-existed per the scenario), then typed "vip" into Acme Corp's tag input.

1. Existing "VIP" suggested (case-insensitive match reused it, no create option offered), selecting it shows the VIP chip on Acme Corp, and the Tags page still lists exactly one "VIP" tag — both survive reload — PASS. `us5-01-acme-vip-tag.png`, `us5-02-tags-page-one-vip.png`

## US6 — Delete a company safely (P6) — ALL PASS

Re-linked Sam Rivera to Acme Corp so it had 1 person + 1 card + the VIP tag going into this scenario.

1. Start delete, cancel — nothing changed (company, links, tag all intact) — PASS. `us6-01-delete-confirm-dialog.png` (dialog text: `"Acme Corp" is linked to 1 person and 1 card.`), confirmed unchanged after cancel
2. Start delete, confirm — confirmation correctly named 1 person and 1 card; after confirming: Acme Corp gone from the Companies list, Sam Rivera shows no company, the card shows no Acme Corp link, and "VIP" still exists on the Tags page — all survive reload — PASS. `us6-02-companies-list-acme-gone.png`, `us6-03-card-no-acme-link.png`, `us6-04-sam-rivera-no-company.png`, `us6-05-vip-tag-survives.png`

## Notes

- Console errors observed during the run were all benign/expected: a favicon 404, the 409/400 responses from the deliberate duplicate-name and blank-name tests in US1, and a CORS error from an initial mis-targeted `fetch` call (corrected to route through the UI origin before seeding US4 data) — no evidence of an application bug.
- No failures or unexpected behavior observed. Every acceptance scenario for US1 through US6 matched spec.md's Given/When/Then exactly.
- `us5-02-tags-page-one-vip.png` and `us6-05-vip-tag-survives.png` are byte-identical — both are captures of the same unchanged Tags page state (exactly one "VIP" tag) taken two minutes apart, not a copy error. The underlying claim (the tag count stays at one) is independently and rigorously covered by the automated `tests/integration/companies.test.ts` delete-block assertions, so this doesn't weaken the evidence.

US7 (MCP parity, SC-008) evidence is recorded separately as automated-check output in `mcp-company-tools-output.txt`, since that story has no user-facing UI surface of its own.
