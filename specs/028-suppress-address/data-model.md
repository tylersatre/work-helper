# Phase 1 Data Model: Suppress Address

One new table. Everything else this feature touches (`email_addresses`, the `list-unlinked-addresses` query, `addEntry`, `createPerson`) already exists and is read or lightly extended, not redefined.

## New entity: Suppression flag (`suppressed_addresses`)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK, autoincrement | Row identity; not exposed to MCP callers. |
| `addressId` | integer, FK → `email_addresses.id`, `onDelete: 'cascade'`, unique | The suppressed address. Unique index makes a second `suppress-address` call for the same address a DB-level no-op via `onConflictDoNothing()` (research.md R6) — this is what makes FR-004's idempotency free. |
| `suppressedAt` | integer, not null | Unix ms timestamp set at insert time; never updated after creation (FR-004). Drives `list-suppressed-addresses`'s ordering (FR-005: `ORDER BY suppressed_at DESC`). |

```ts
export const suppressedAddresses = sqliteTable(
  'suppressed_addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    addressId: integer('address_id')
      .notNull()
      .references(() => emailAddresses.id, { onDelete: 'cascade' }),
    suppressedAt: integer('suppressed_at').notNull(),
  },
  (t) => [uniqueIndex('suppressed_addresses_address_id_unique').on(t.addressId)],
);
```

**Lifecycle**:
- **Created**: by `suppress-address`, only when the target `email_addresses` row exists and has `personId IS NULL` (research.md R2). Insert is `onConflictDoNothing()` — re-suppressing is a no-op, original `suppressedAt` survives.
- **Deleted (manual)**: by `unsuppress-address`. Always a no-op-safe delete (FR-007) — deleting a non-existent row is already a no-op in SQL.
- **Deleted (automatic)**: the moment the same `email_addresses` row's `personId` transitions from `null` to non-null, via either of the two existing link write-sites (`addEntry` in `contact-entries.ts`, `createPerson` in `people.ts`) — done inside the same transaction as the link itself (FR-009, research.md R4). A row deleted this way never comes back on a later unlink (FR-010) because unlinking (`removeEntry`) only ever sets `personId` back to `null`; it never re-inserts a `suppressed_addresses` row.
- **No update path**: the row is either absent, or present with its original `suppressedAt` — nothing ever modifies an existing row in place.

## Existing entity touched: Email address (`email_addresses`)

No schema change. Relevant existing fields for this feature:

| Field | Notes |
|---|---|
| `id` | Referenced by `suppressed_addresses.address_id`. |
| `personId` | `NULL` = unlinked = eligible suppression target (research.md R2); becomes non-null via `addEntry`/`createPerson`, which now also clears any suppression row for the same `id` (FR-009). |
| `value` | Matched case-insensitively via the existing `findEmailAddressByValue` (`lower(value) = lower(:input)`) for all three new tools' address resolution (research.md R8). Returned as-is (stored casing) in every tool's output (research.md R9). |

## MCP-level identifier shape (not persisted — resolution logic only)

Unlike the tag tools' id-or-name pair, every tool in this feature identifies its target by a single **address string**, matching how every acceptance scenario in the spec calls these tools (`suppress-address` for `news@example.com`, etc.) and how `list-unlinked-addresses` already surfaces addresses as plain strings, not internal ids.

- **Resolution**: `address: string` → `findEmailAddressByValue(db, address)` (case-insensitive) → `{ id, personId } | undefined`.
- Used by: `suppress-address`, `unsuppress-address`. (`list-suppressed-addresses` takes no input.)

## State transitions

```
                      suppress-address                    address linked
                      (target unlinked,                   (addEntry /
                       previously seen)                    createPerson)
   [unlinked,        ───────────────────►   [unlinked,    ───────────────►   [linked]
    not suppressed]                          suppressed]                      (no suppression
        ▲                                        │                            row possible —
        │         unsuppress-address             │                            FK'd address is
        └────────────────────────────────────────┘                            now personId-set)
```

- An address can only ever be in one of three states with respect to this feature: **unlinked & not suppressed** (default, appears in `list-unlinked-addresses`), **unlinked & suppressed** (appears in `list-suppressed-addresses`, excluded from `list-unlinked-addresses` — FR-008), or **linked** (excluded from both, regardless of suppression history — FR-009/FR-010).
- `[linked] → [unlinked, not suppressed]` (via `removeEntry` unlinking an address still referenced by synced data) is the one transition this feature must *not* special-case: FR-010 requires it to land in "not suppressed," which it does automatically since nothing re-creates a `suppressed_addresses` row on unlink.
- `[linked]` never transitions directly to `[unlinked, suppressed]` — suppression is only ever entered from `[unlinked, not suppressed]` via an explicit `suppress-address` call (FR-002/FR-003 reject every other starting state).

## Query change: `list-unlinked-addresses`

`listUnlinkedAddresses` (`src/server/services/email/queries.ts`) gains one exclusion condition against the new table (research.md R5):

```sql
... existing qualifying/join logic ...
AND NOT EXISTS (SELECT 1 FROM suppressed_addresses sa WHERE sa.address_id = ea.id)
```

No change to its output shape (`UnlinkedAddressSummary`) or its other filtering (`personId IS NULL`, mail-or-non-resource-event qualification, ordering).
