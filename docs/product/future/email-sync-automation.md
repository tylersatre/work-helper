# Future: email-sync-automation

## One-liner

Make email sync run itself — scheduled polling and/or Microsoft Graph webhooks instead of only the manual MCP sync tool.

## Origin

- **Source:** split from `docs/product/features/email-sync.md`
- **Deferred because:** Tyler chose manual-trigger-only sync for the first slice ("only manual trigger on the sync for now"); automation is a follow-up
- **Recorded:** 2026-08-07

## Depends on

`email-sync` shipped (the sync machinery this automates).

## Notes

- The brief/constitution already allow both mechanisms ("scheduled polling and/or webhook") — which one, and the poll interval, are this feature's interview questions. The email-sync interview floated a configurable interval defaulting to 5 minutes as a plausible shape; nothing was decided.
- Webhooks need a public callback endpoint and subscription renewal; the home-server-deploy Caddy setup makes that feasible but it was judged too many moving parts for the first slice.
- An automated sync needs an incremental notion of "what's new" — the email-sync tool deliberately has none (every call requires an explicit date range; Tyler rejected a rangeless incremental default). Deciding incremental semantics is part of this feature.
- `email-sync-improvements` (specced 2026-08-10) builds two natural foundations: a persisted run history (per-run range, status, counts) and a "last successful run's end date through today" prefill on the web Sync page. An automated schedule could reuse that watermark; the MCP tool's explicit-range requirement was deliberately left unchanged there. That feature also decided only one sync runs at a time — a scheduler must respect the same rule.
