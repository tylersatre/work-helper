# Contracts: MCP Tools

Interface contracts for this feature are MCP tool schemas, registered via `server.registerTool(name, { description, inputSchema, outputSchema }, handler)` in `src/server/mcp/tools.ts`, following the exact conventions already used by every existing tool in that file (Zod shape objects for `inputSchema`/`outputSchema`, `toolError(message)` for failures, `{ content: [{ type: 'text', text }], structuredContent }` for success). All three tools below are registered on the same `McpServer` instance as every existing tool and are therefore already behind the `mcp-authentik-auth` OAuth gate (FR-013) — no auth-specific contract details are needed per tool.

`suppress-address` is fully atomic and non-destructive on failure: a validation error changes nothing (FR-014), matching the transactional/no-partial-effect pattern already used across the MCP tool set.

---

## 1. `suppress-address`

Flags a currently-unlinked, previously-seen email address so it drops out of `list-unlinked-addresses` (FR-001, FR-002, FR-003, FR-004).

**Input**: `{ address: string }` (`z.string().trim().min(1, 'An address is required')`)

**Output** (`structuredContent`): `{ address: string, suppressedAt: number }` — `address` is the stored (synced) casing, `suppressedAt` is the original suppression time even on a repeat call (idempotent, FR-004).

**Errors**:
| Condition | Message |
|---|---|
| `address` empty/whitespace | `An address is required` |
| No `email_addresses` row matches (case-insensitive) | `` ${address} has never appeared in synced mail `` |
| Matching row is currently linked to a person | `` ${address} is linked to ${personName} `` |

**Success text**: `` Suppressed ${address}. ``

---

## 2. `list-suppressed-addresses`

Lists every currently-suppressed address, most recently suppressed first (FR-005).

**Input**: none

**Output** (`structuredContent`): `{ addresses: Array<{ address: string, suppressedAt: number }> }`, ordered `suppressedAt DESC`.

**Errors**: none — always succeeds (possibly with an empty list).

**Success text**: `` ${count} suppressed address${count === 1 ? '' : 'es'}. ``

---

## 3. `unsuppress-address`

Clears the suppression flag on an address, if any (FR-006, FR-007).

**Input**: `{ address: string }` (`z.string().trim().min(1, 'An address is required')`)

**Output** (`structuredContent`): `{ address: string, wasSuppressed: boolean }` — `wasSuppressed` reports whether a flag actually existed and was cleared, so a caller can tell a real reversal from a no-op without a separate `list-suppressed-addresses` call.

**Errors**:
| Condition | Message |
|---|---|
| `address` empty/whitespace | `An address is required` |

No "not found" error for an unknown or never-suppressed address (FR-007) — it resolves to `{ address, wasSuppressed: false }` and succeeds. `address` in the response echoes the caller's input value for an address with no matching `email_addresses` row (nothing to normalize against); it echoes the stored casing when a matching row exists.

**Success text**: `` Unsuppressed ${address}. `` when `wasSuppressed` is `true`; `` ${address} was not suppressed. `` when `false`.

---

## Change to an existing tool: `list-unlinked-addresses`

No input/output schema change (FR-008). The underlying query gains a suppression exclusion (see `data-model.md`'s Query change section) — a suppressed address that would otherwise qualify no longer appears. The tool's description text is updated to note that suppressed addresses are excluded (it previously described its output as unconditionally "complete").

---

## Cross-cutting notes

- **Address resolution is always case-insensitive** (FR-011), reusing the existing `findEmailAddressByValue` (`lower(value) = lower(:input)`) — no new comparison logic (research.md R8).
- **No tool in this contract has a confirmation, dry-run, or `force` parameter** — every call is the deliberate act, matching every other write tool already in `tools.ts`.
- **No tool writes an audit note** as a side effect (spec Assumptions) — suppression leaves no trace beyond the `suppressed_addresses` row itself.
- **No pagination** on `list-suppressed-addresses` in this slice (spec Assumptions) — the tool returns the full set.
- **Suppressing or unsuppressing never touches** `email_participants`, `calendar_event_participants`, or any message/event content (FR-012) — only the new `suppressed_addresses` table is written.
