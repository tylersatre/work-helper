# Feature: suppress-address

## User story

As Tyler, I want an agent to be able to flag an unlinked email address as "never link / ignore," so that `list-unlinked-addresses` becomes a work queue of real contacts instead of an ever-regrowing list of no-reply senders, marketing mail, and bulk calendar attendees.

## Acceptance criteria

"An authorized agent" means an MCP client authenticated per the `mcp-authentik-auth` flow. "Unlinked address" means an address seen in synced mail that is linked to no person, per `list-unlinked-addresses` from `mcp-people-tools`. Criteria run against a synced store and person data seeded by test setup. All addresses and names are illustrative concrete test data.

- **Given** a synced store where news@example.com is unlinked (1 message, linked to no person) and jordan.smith@example.com is unlinked (3 messages, linked to no person)
  **When** an authorized agent calls `list-unlinked-addresses`, then calls the suppress-address tool for news@example.com, then calls `list-unlinked-addresses` again
  **Then** the first response includes both addresses, and the second no longer includes news@example.com while jordan.smith@example.com still appears

- **Given** news@example.com is suppressed
  **When** an authorized agent calls the list-suppressed-addresses tool
  **Then** the response includes news@example.com

- **Given** news@example.com is suppressed, and ads@example.com is suppressed afterward
  **When** an authorized agent calls list-suppressed-addresses
  **Then** ads@example.com appears before news@example.com — ordered by suppression time, most recently suppressed first

- **Given** news@example.com is suppressed
  **When** an authorized agent calls the unsuppress-address tool for it
  **Then** `list-unlinked-addresses` includes news@example.com again (it is still linked to no person) and list-suppressed-addresses no longer includes it

- **Given** never-seen@example.com has never appeared in any synced message
  **When** an authorized agent calls suppress-address for never-seen@example.com
  **Then** the call fails with a validation error, and it does not appear in list-suppressed-addresses

- **Given** sam.rivera@example.com is linked to person "Sam Rivera"
  **When** an authorized agent calls suppress-address for sam.rivera@example.com
  **Then** the call fails with a validation error identifying that the address is linked to "Sam Rivera", and it does not appear in list-suppressed-addresses

- **Given** jordan.smith@example.com is suppressed and linked to no person
  **When** an authorized agent calls create-person with email jordan.smith@example.com, linking it to a new person "Jordan Smith"
  **Then** the address becomes linked to "Jordan Smith" as normal, and list-suppressed-addresses no longer includes it

- **Given** jordan.smith@example.com was suppressed, then linked to "Jordan Smith" (per the previous scenario, clearing the flag), and is then removed from Jordan Smith's addresses (per `mcp-people-tools`) so it is unlinked again
  **When** an authorized agent calls `list-unlinked-addresses`
  **Then** jordan.smith@example.com appears as a normal, non-suppressed unlinked address, proving the cleared flag does not reactivate

## Out of scope

- Domain-pattern suppression (e.g. suppressing an entire sender domain) — per-address only in this slice.
- A reason/note field on suppression — the flag carries no metadata beyond the address and suppression time.
- Any web UI surface — suppression is MCP-only for this slice; the per-address link control in the conversation detail view (`email-ui`) is unchanged.
- Any change to how suppressed addresses appear in synced mail, conversations, or message participant data — suppression only affects `list-unlinked-addresses` and list-suppressed-addresses; the address still shows normally everywhere else.
- Auto-suppression heuristics (detecting no-reply/bulk/marketing senders automatically) — suppression is always a deliberate per-address MCP call.
- Blocking or restricting linking a suppressed address to a person — linking is always allowed and clears the flag, per the acceptance criteria.

## Open questions

Interview resolved (2026-08-24): MCP-only surface; per-address only; suppress-address, unsuppress-address, and list-suppressed-addresses tools; suppress-address requires the target to be a currently-unlinked address (fails if never seen in synced mail, or if already linked to a person); no reason field; the flag auto-clears when the address becomes linked and does not reactivate if the address is later unlinked; list-suppressed-addresses orders most-recently-suppressed first. This supersedes the "no built-in suppression" decision recorded in `mcp-people-tools` (2026-08-11) — Tyler's own address is now a normal suppression candidate like any other, with no special-casing.

- **Assumption to confirm:** calling suppress-address on an address that's already suppressed is idempotent (succeeds, no error, no change to its suppression timestamp) rather than failing — not explicitly decided in this interview.
- Tool names, exact address matching mechanics (presumably case-insensitive, matching the rule used elsewhere per `mcp-people-tools`), and any pagination on list-suppressed-addresses are `/speckit-plan` decisions.

None remaining beyond the above — ready for `/speckit-specify`.
