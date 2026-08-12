# MCP Tool Contracts: MCP People Tools

**Feature**: 015-mcp-people-tools | **Date**: 2026-08-11

The feature's entire external surface is MCP tools on the existing work-helper server (`src/server/mcp/tools.ts`). REST API and UI contracts are unchanged. All tools below require the shipped mcp-authentik-auth bearer token at `POST /mcp`; unauthenticated requests get 401 before any tool dispatch (FR-001). Errors are returned the registry's standard way: `{ content: [{ type: 'text', text: <message> }], isError: true }`. Successful calls return a short human-readable `content` line plus `structuredContent` matching the output schema. Schemas are expressed as zod, the registry's contract language.

## Shared shapes

```ts
const contactEntrySchema = z.object({ id: z.number(), value: z.string(), isPrimary: z.boolean() });

// Person shape returned by get-person, create-person, update-person (scalars = primary values, kept for compatibility)
const personDetailSchema = {
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  emails: z.array(contactEntrySchema),
  phones: z.array(contactEntrySchema),
  extraFields: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
};
```

## Error message catalog

| Condition | Message |
|---|---|
| Blank/whitespace first or last name (create; update when provided) | `First and last name are required` |
| Extra-field name not in the person-fields config | `Unknown field "Favorite Color"` (every offending name listed, quoted, comma-separated) |
| Email already held by a person (case-insensitive) | `That email is already in use by Sam Rivera` |
| Phone already held by a person (exact text) | `That phone number is already in use by Ana Alvarez` |
| Blank-but-present email/phone on create; blank value on add | `A value is required` |
| Unknown person | `Person 42 not found` |
| Unknown entry (or entry not belonging to that person) | `Entry 7 not found` |

## New tools

### create-person

Creates a person; supplied email/phone become that person's primary entries (FR-002, FR-003). An email that exists in synced mail unlinked is linked, not duplicated, bringing its mail history (FR-007).

```ts
inputSchema: {
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),   // when present: trimmed, non-empty — else `A value is required`
  phone: z.string().optional(),   // same rule
  extraFields: z.record(z.string(), z.string()).optional(),  // keys must be configured fields
}
outputSchema: personDetailSchema
```

Validation order: names → extra-field names → contact-value presence → uniqueness (holder-identifying). Any failure creates nothing (FR-004–FR-006). Success text: `Created person "Jordan Smith".`

### update-person

Partial edit of names and extra fields (FR-008; research D5). Omitted inputs keep current values; provided `extraFields` keys merge over current ones, empty-string value clears a field. Contact lists are not touchable here (FR-013 boundary).

```ts
inputSchema: {
  personId: z.number().int().positive(),
  firstName: z.string().optional(),  // when present: non-blank
  lastName: z.string().optional(),   // when present: non-blank
  extraFields: z.record(z.string(), z.string()).optional(),
}
outputSchema: personDetailSchema
```

Errors: `Person N not found`, blank-name, unknown-field. A failed call leaves the person unchanged. Success text: `Updated person "Jordan Smith-Lee".`

### add-contact-entry

Adds an email or phone to a person (FR-009). First entry of its type becomes primary; an email existing unlinked in synced mail is linked in place (FR-010).

```ts
inputSchema: {
  personId: z.number().int().positive(),
  type: z.enum(['email', 'phone']),
  value: z.string(),
}
outputSchema: {
  personId: z.number(),
  type: z.enum(['email', 'phone']),
  entries: z.array(contactEntrySchema),  // the person's full post-change list for that type
}
```

Errors: `Person N not found`, `A value is required`, holder-identifying duplicate (`That email is already in use by …` / `That phone number is already in use by …`). Success text: `Added email "jordan@personal.example.com" to Jordan Smith.` (or `phone`).

### mark-contact-primary

Marks an existing entry primary, moving the marker off the previous primary of that type (FR-011). Marking the current primary again is a successful no-op.

```ts
inputSchema: {
  personId: z.number().int().positive(),
  type: z.enum(['email', 'phone']),
  entryId: z.number().int().positive(),
}
outputSchema: { personId: z.number(), type: z.enum(['email', 'phone']), entries: z.array(contactEntrySchema) }
```

Errors: `Person N not found`, `Entry N not found`. Success text: `Marked "555-0199" as Jordan Smith's primary phone.`

### remove-contact-entry

Removes an entry (FR-012). A removed email that synced mail references reverts to unlinked (mail untouched, address reappears in discovery); an unreferenced one is deleted. When the removed entry was primary and others remain, one is promoted automatically. Removing the last entry of a type is valid.

```ts
inputSchema: {
  personId: z.number().int().positive(),
  type: z.enum(['email', 'phone']),
  entryId: z.number().int().positive(),
}
outputSchema: { personId: z.number(), type: z.enum(['email', 'phone']), entries: z.array(contactEntrySchema) }
```

Errors: `Person N not found`, `Entry N not found`. Success text: `Removed email "jordan.smith@example.com" from Jordan Smith.`

### list-unlinked-addresses

The discovery worklist (FR-015–FR-017): every synced-mail address linked to no person — complete, unsuppressed, computed live per call. No arguments, no pagination (research D8).

```ts
inputSchema: {}  // zero-arg; must also accept a call omitting `arguments` entirely
outputSchema: {
  addresses: z.array(z.object({
    address: z.string(),
    messageCount: z.number(),   // messages involving the address in any role (from/to/cc/bcc)
    displayName: z.string(),    // most recently seen non-empty name; bare address when mail never carried one
    lastMessageAt: z.number(),  // epoch ms of the most recent message involving it
  })),
}
```

Ordering: `messageCount` descending, then `lastMessageAt` descending, then `address` ascending. Empty store or all-linked → `{ addresses: [] }`, not an error. Success text: `Found N unlinked address(es).`

## Modified tool

### get-person

Input unchanged (`personId`). Output gains `emails` and `phones` arrays per `personDetailSchema` (FR-018) while keeping the existing scalar `email` / `phone` primaries, `extraFields`, and `tags`.

## Explicitly unchanged / absent

- `search-people` — result rows keep `{ id, name, email }` primary-only shape (FR-019).
- No tool edits an email/phone value in place (FR-013) and no tool deletes a person (FR-020) — the agent surface deliberately omits both.
- All other registered tools (`list-board`, `get-task`, `create-task`, `add-note`, `sync-emails`, `list-conversations`, `get-conversation`, `emails-for-person`) are untouched.
