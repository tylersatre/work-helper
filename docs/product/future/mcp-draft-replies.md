# Future: mcp-draft-replies

## One-liner

A `create-draft-reply` MCP tool that writes a reply draft into the Outlook Drafts folder, attached to the right thread — the agent drafts, only Tyler ever sends.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day — ranked the single biggest leap in email-triage value (today "offer draft text" means copy-paste from a triage brief)
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately
- **Recorded:** 2026-08-21

## Depends on

`email-sync` shipped (synced threads and message ids exist to reply to) and `mcp-authentik-auth` (the auth flow new tools inherit). The Graph integration already holds mailbox write scope precedent via `mcp-mark-emails-read`.

## Notes

- Decided 2026-08-21: MCP-only, permanently — not a deferral of a UI counterpart. Tyler's rule: tooling for something he does somewhere else (drafting happens in Outlook) is fine being MCP-only; he'll create drafts in Outlook himself when he wants to.
- This is the second sanctioned exception to the never-modify-Outlook rule (first: mcp-mark-emails-read's read-state writes). Decided the same day: the line holds there — read state and drafts are the only mailbox writes; archive/file/move-message-to-folder was considered and declined.
- Binding boundary, reaffirmed 2026-08-21: no send-email tool, ever. Drafts-only is a deliberate security posture given the prompt-injection surface of an inbox (email content trying to direct the assistant) — the AI files, drafts, and flags; a human sends.
- Safety design note from the review: the tool should write exactly the text the caller supplies — no composing or rewriting inside the tool — so content from a hostile email can't be smuggled into a draft without appearing verbatim in the tool call. Whether drafts should be visibly marked as machine-authored is an interview question.
- Other interview questions: reply vs. reply-all (or a parameter); plain text vs. HTML body; signature handling; whether calling again for the same message updates the existing draft or creates a second; what identifies the target (message id vs. conversation id — per-message ids are the mcp-mark-emails-read precedent).
