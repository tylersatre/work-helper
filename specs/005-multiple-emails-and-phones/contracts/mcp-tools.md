# MCP Tools Contract: Multiple Emails and Phones per Person

**No MCP tool is added, removed, renamed, or reshaped by this feature.** The six existing tools keep their exact input and output schemas; this contract pins how the three person-bearing tools populate their single-value `email`/`phone` fields now that people hold entry lists (FR-012, research D9).

## Projection rule

Wherever a tool output has an `email` (or `phone`) field of type `string | null` for a person, its value is that person's **primary** entry of the type, or `null` when the person has no entries of that type. Non-primary entries are never surfaced by any tool in this feature (list-of-entries tools belong to the future `mcp-tool-expansion` feature).

## Affected tools

### `search-people`

- Input unchanged: `{ query: string }`. The substring search matches first name, last name, and primary email (same reach as before the feature).
- Output unchanged: `{ people: [{ id, name, email: string | null }] }` — `email` is the primary entry value.

### `get-person`

- Input unchanged: `{ personId }`.
- Output unchanged: `{ id, firstName, lastName, email: string | null, phone: string | null, extraFields }` — `email`/`phone` are the primary entry values.

### `get-task`

- Input/output unchanged; each linked person's `email` field is the primary entry value.

## Unaffected tools

`list-board`, `create-task`, `add-note` do not surface person contact data and are untouched.

## Contract assertions (integration tests)

1. A person with two emails (second marked primary) → `get-person.email` and `search-people` return the second value.
2. A person with zero emails/phones → `get-person` returns `email: null`, `phone: null` (schema still satisfied).
3. Removing a primary (with a survivor) → tools immediately return the promoted survivor.
4. `get-task` linked-person `email` equals the primary entry value.
