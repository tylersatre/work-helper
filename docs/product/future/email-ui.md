# Future: email-ui

## One-liner

A UI for browsing synced email — an Emails page listing conversations with a detail view, plus email visibility on person pages.

## Origin

- **Source:** split from `docs/product/features/email-sync.md`
- **Deferred because:** Tyler chose a no-UI first slice for email sync — the data model, sync tool, and MCP read tools land first; browsing surfaces come later
- **Recorded:** 2026-08-07

## Depends on

`email-sync` shipped (synced conversations and role-tagged addresses exist to display).

## Notes

- The natural shape (offered in the email-sync interview but not chosen for that slice): a conversation list showing subject, participants, message count, and latest-message date, newest first; clicking a conversation shows its messages in order with from/to/cc and body.
- Rendering stored email HTML safely is a design/plan concern deliberately deferred to this feature — email-sync stores bodies but never renders them.
- A person page section showing that person's correspondence (the UI counterpart of the emails-for-person MCP tool) belongs here too.
- Manual linking flows beyond the People page edit form — e.g. "link this unmatched address to a person / create a person from it" straight from an email view (the `link-email-to-contact` sketch in `docs/product/feature-template.md`) — would ride with this feature or a follow-up to it.
