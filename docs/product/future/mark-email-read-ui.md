# Future: mark-email-read-ui

## One-liner

Mark a conversation or message read/unread from the Emails page and conversation detail view — the in-app counterpart to the MCP-only read-state tool that mcp-mark-emails-read ships.

## Origin

- **Source:** split from `docs/product/features/mcp-mark-emails-read.md`
- **Deferred because:** Tyler chose MCP-only for that slice — the workflow he wanted was agent triage keeping his Outlook inbox honest, and the web app only needs to reflect the result
- **Recorded:** 2026-08-20

## Depends on

`mcp-mark-emails-read` shipped (the write-back to Outlook, the permission, and the per-target semantics a UI control would reuse). `email-ui` shipped (the views the controls would live in).

## Notes

- Offered in the mcp-mark-emails-read interview as "MCP tool + a UI control"; not chosen, but not rejected on the merits.
- Decisions from that interview a UI control would inherit: the mark writes to Outlook first and work-helper's stored state updates immediately; both directions (read and unread); a write the mailbox can't take fails with nothing changed (tell the user to connect/reconnect the mailbox on the Sync page); marking something already in the requested state is a harmless no-op.
- Undecided and needing an interview: whether simply opening a conversation in the Emails page marks it read (Outlook-client behavior) or only an explicit control does — the MCP feature deliberately ruled out all implicit marking; whether the control sits on list rows, the detail view, or both; and whether a conversation-level control exists or only per-message (the MCP tool is per-message only — Tyler declined conversation targets there, so a conversation-level UI control would be a new decision, not an inherited one).
