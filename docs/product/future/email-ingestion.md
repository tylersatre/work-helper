# Future: email-ingestion

## One-liner

Ingest Tyler's Outlook email into work-helper's store, with the server pulling directly from Microsoft Graph.

## Origin

- **Source:** `docs/product/brief.md` — emails are a core concept ("ingested from Outlook and linked to people") that has not been specced yet
- **Deferred because:** foundational slices were sequenced first (tasks, then people); this is core-brief work awaiting its turn, not a scope split from another feature
- **Recorded:** 2026-08-06

## Depends on

None known, strictly. The app's Microsoft Graph credentials/registration setup will be a prerequisite in practice — a decision for plan time, not a shipped feature.

## Notes

- The architecture constraint is already decided and binding (brief "Architecture constraints"; constitution Principle IV): the work-helper server pulls directly from Microsoft Graph (scheduled polling and/or webhook). Ingestion is a server-side concern — AI agents are consumers of the work-helper MCP's tools only, never the ingestion path.
- Scope: ingestion only — getting emails from Microsoft Graph into work-helper's store. Linking ingested emails to people is a separate future feature; the feature-template's worked example (`link-email-to-contact` in `docs/product/feature-template.md`) sketches it.
- Nothing product-level has been decided. Open questions for the future `/new-feature` interview:
  - Which mailbox, and which folders?
  - How far back to backfill?
  - Scheduled polling, webhook, or both?
  - What of an email is stored (headers, body, attachments, ...)?
