# MCP Tool Contracts: Email Drafts

**Feature**: `031-mcp-email-drafts`

Four new tools on the work-helper MCP server, registered in `src/server/mcp/tools.ts` per the house pattern: zod raw-shape `inputSchema`/`outputSchema`, success = one past-tense human sentence in `content` **plus** `structuredContent` matching the output schema, failure = `toolError(message)` (`isError: true`, text only). All tools sit behind the existing server-wide MCP OAuth gate (FR-020) — no per-tool auth.

All `messageId` parameters are **synced store message ids** — the same id-space `set-email-read-state`, `get-conversation`, and `emails-for-person` already use.

## Shared output shape: `draftSummarySchema`

```ts
{
  messageId: z.number(),           // store id of the draft row
  conversationId: z.number(),      // store conversation the draft sits in
  subject: z.string(),
  to: z.array(z.string()),         // addresses, as stored
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  isDraft: z.literal(true),
  webLink: z.string(),             // Outlook web link from the mailbox
}
```

## `create-draft`

Creates a fresh standalone draft in the mailbox's Drafts folder. Description steers revisions to `update-draft` (each call makes a new draft — FR-008) and notes the saved signature is appended below the body.

**Input**:

```ts
{
  to: z.array(z.string()).min(1).describe('Recipient email addresses'),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  bodyHtml: z.string().describe('HTML body, written verbatim; the saved signature is appended below it'),
}
```

**Behavior**: preflight write access → validate `bodyHtml` non-empty after trim → compose body = `bodyHtml` + saved signature (nothing appended when none saved) → `POST /me/messages` → ingest response into store (new conversation) → return summary.

**Success content**: `Created draft "<subject>" (message <id>).`

## `create-reply-draft`

Creates a reply or reply-all draft for a synced message, shaped exactly like an Outlook desktop reply: "Re:" subject, mailbox-derived recipients (owner never a recipient), body = supplied HTML, then signature, then quoted original thread. The draft lands inside the conversation it replies to.

**Input**:

```ts
{
  messageId: z.number().describe('Synced message id to reply to'),
  replyAll: z.boolean().optional().describe('true for reply-all; defaults to reply (sender only)'),
  bodyHtml: z.string().describe('HTML reply content, written verbatim above the signature and quoted thread'),
}
```

**Behavior**: preflight → validate body → look up store row by `messageId` (missing → not-found error) → `POST /me/messages/{graphId}/createReply` or `/createReplyAll` (empty body) → prepend `bodyHtml` + signature into the returned quoted body → `PATCH` the draft body → ingest into store (existing conversation) → return summary.

**Success content**: `Created reply draft "Re: <subject>" (message <id>).` / `Created reply-all draft …`

## `update-draft`

Replaces a draft's body verbatim and whole (appends nothing — not even the signature); optionally changes recipients and subject. Works on any draft — agent-created or started by Tyler in Outlook — and only on drafts.

**Input**:

```ts
{
  messageId: z.number().describe('Synced draft message id'),
  bodyHtml: z.string().describe('Replacement HTML body, written verbatim and whole — nothing is appended'),
  to: z.array(z.string()).optional(),      // omitted ⇒ unchanged
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
}
```

**Behavior**: preflight → validate body → store lookup + draft-flag guard (FR-011) → `PATCH /me/messages/{graphId}` with exactly the supplied fields → mirror response into store → return summary. A Graph 404 → stale-draft error, store untouched.

**Success content**: `Updated draft "<subject>" (message <id>).`

## `delete-draft`

Deletes a draft from the mailbox's Drafts folder. Drafts only; touches no other message.

**Input**: `{ messageId: z.number().describe('Synced draft message id') }`

**Behavior**: preflight → store lookup + draft-flag guard → `DELETE /me/messages/{graphId}` → remove store row (+ conversation if now empty) → confirmation. Graph 404 → stale-draft error, store untouched.

**Success content**: `Deleted draft "<subject>" (message <id>).` (no structuredContent needed beyond `{ messageId, deleted: true }` — final shape at implementation, kept trivial)

## Error contract (all four tools)

| Condition | `toolError` text |
|---|---|
| Mail provider not wired / never signed in | `The mailbox is not connected — connect the mailbox on the Sync page.` |
| Sign-in expired | `The mailbox sign-in has expired (<detail>) — reconnect the mailbox on the Sync page.` |
| Sign-in lacks Mail.ReadWrite | `The mailbox sign-in lacks permission to change mail — add delegated Mail.ReadWrite to the Entra app registration, then reconnect the mailbox on the Sync page to grant it.` |
| `bodyHtml` empty/whitespace | `A body is required` |
| Reply target / update / delete id unknown | `Message <id> not found` |
| Update/delete target not a draft | `Message <id> is not a draft — only draft messages can be edited or deleted.` |
| Draft gone from mailbox (Graph 404) | `The mailbox no longer has this draft — the next sync will reconcile it.` |

No failure has side effects: every guard fires before the mailbox write, and the store is written only after the mailbox write succeeds (FR-022).

## Changes to existing tools

- `list-conversations` (and `emails-for-person` conversation groupings): `conversationSummarySchema` gains `hasDraft: z.boolean()`.
- `get-conversation` / `emails-for-person`: message schemas gain `isDraft: z.boolean()`.
- `set-email-read-state`: description's "This is the only mailbox-modifying tool in work-helper" sentence updated to name the draft tools as the other sanctioned mailbox writes.
- `sync-emails`: description updated — the Drafts folder now syncs in full on every run (the folder-exclusion wording changes); the explicit-range requirement is untouched.
