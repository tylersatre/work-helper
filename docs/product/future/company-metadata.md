# Future: company-metadata

## One-liner

Fields on a company beyond its name — especially a `domain` field — so sender-domain checks (phishing: sender domain vs. known company domain) and address auto-linking have something to match against, and company context stops being stashed in task notes.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day (Tier 3, "later, if ever"); companies are name-only records today per the `companies` feature
- **Deferred because:** ranked lowest-priority in the audit; nothing decided beyond recording the idea
- **Recorded:** 2026-08-21

## Depends on

`companies` shipped. Related: the `custom-fields` stub (a flexible-fields mechanism could carry non-semantic company fields, but domain earns native treatment because behavior hangs off it) and `person-notes` (the person-side of "context has nowhere to live").

## Notes

- Domain is the motivating field because it has semantics: a phishing check can compare a sender's domain against the linked company's known domain, and new addresses at a known domain could auto-link or suggest-link. A free-text description/notes field is the other obvious candidate.
- Interview questions when picked up: one domain or several per company; whether domain match should actually drive auto-linking or only suggestions; whether the people-list/company views display any of it.
