# Future: suppress-address

## One-liner

A "never link / ignore" flag for unlinked email addresses, so `list-unlinked-addresses` becomes a work queue of real contacts instead of an ever-regrowing list of no-reply senders, marketing, and bulk calendar attendees.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day — this deliberately reverses the mcp-people-tools interview decision (2026-08-11) that the list reports every unlinked address with no suppression
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately
- **Recorded:** 2026-08-21

## Depends on

`mcp-people-tools` shipped (the unlinked-address list this filters).

## Notes

- Decision reversal, made deliberately 2026-08-21: at ~230 entries and regrowing forever, "the agent decides what deserves a person" stopped scaling. This supersedes the 2026-08-11 confirmations that there is no built-in suppression and that Tyler's own address appears like any other (his address would presumably now be a prime suppression candidate, or simply linked to a person).
- Interview questions: MCP-only or also surfaced in email-ui's unlinked-address flows; an unsuppress path and a way to list suppressed addresses (the flag should be reversible, not a delete); per-address only or also domain patterns (a whole marketing domain, no-reply@*); whether suppression only affects the unlinked list or has any wider meaning (presumably list-only — suppressed addresses still appear in message participant data); what happens when a suppressed address is later given to a person (presumably the flag becomes moot or is cleared).
