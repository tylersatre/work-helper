# Data Model: Multiple Emails and Phones per Person

Decision references (D1–D11) point into [research.md](research.md).

## Modified table: `people`

| Column | Type | Change |
|---|---|---|
| `id` | integer PK autoincrement | unchanged |
| `first_name` | text, not null | unchanged |
| `last_name` | text, not null | unchanged |
| `email` | text | **DROPPED** — migrated into `person_emails` (D5) |
| `phone` | text | **DROPPED** — migrated into `person_phones` (D5) |
| `extra_fields` | text (json), not null, default `{}` | unchanged |
| `created_at` | integer, not null | unchanged |

The `people_email_unique` index goes with the `email` column; its successor lives on `person_emails`.

## New table: `person_emails` (D1)

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | insertion order defines "earliest-added" (D4) |
| `person_id` | integer, not null, FK → `people.id`, `ON DELETE CASCADE` | each entry belongs to exactly one person |
| `value` | text, not null | trimmed before storage; never empty |
| `is_primary` | integer (boolean), not null, default 0 | |
| `created_at` | integer, not null | epoch millis |

**Indexes**:

- `person_emails_value_unique` — UNIQUE on `lower(value)` (case-insensitive global uniqueness, FR-007, D2)
- `person_emails_one_primary` — UNIQUE on `(person_id)` WHERE `is_primary = 1` (at most one primary per person, FR-002, D3)

## New table: `person_phones` (D1)

Identical shape to `person_emails`; only the value-uniqueness index differs:

- `person_phones_value_unique` — UNIQUE on `value` (exact-text global uniqueness, no normalization, FR-008, D2)
- `person_phones_one_primary` — UNIQUE on `(person_id)` WHERE `is_primary = 1`

## Read models (shared/types.ts)

```ts
interface ContactEntry {
  id: number;
  value: string;
  isPrimary: boolean;
  createdAt: number;
}

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  emails: ContactEntry[];   // ordered by id asc; replaces email: string | null
  phones: ContactEntry[];   // ordered by id asc; replaces phone: string | null
  extraFields: Record<string, string>;
  createdAt: number;
}
```

The MCP layer projects `emails`/`phones` down to the primary value (`string | null`) to keep tool output shapes frozen (D9); nothing else consumes a flat email/phone field.

## Validation rules (shared/validation.ts)

- **Entry value** (`entryValueSchema`): string, trimmed, min length 1 after trim — whitespace-only is rejected with "A value is required" semantics (FR-009, Assumptions). Applies to add and edit for both types. No format validation (out of scope).
- **Create person** (`createPersonInputSchema`): unchanged shape — names required, optional single `email`/`phone` (trimmed, empty → null), `extraFields` optional (D8).
- **Update person** (`updatePersonInputSchema`): names + `extraFields` only; `email`/`phone` keys are stripped if sent (FR-015, D8).

## Invariants

1. **Exactly one primary when non-empty** (FR-002): for each person and each type, if any entries exist, exactly one has `is_primary = 1`; if none exist, there is no primary. DB enforces "at most one" (partial unique index); service logic enforces "at least one" at every mutation (D3).
2. **Global value uniqueness** (FR-007/FR-008, SC-004): an email value (case-insensitive) or phone value (exact) appears on at most one entry product-wide. DB unique indexes are the backstop; service pre-checks produce the user-facing messages (D2). An entry is never compared against itself on edit.
3. **Trimmed, non-empty values** (FR-009): all stored values are trimmed and non-empty.
4. **Ownership**: entries reachable only through their person; deleting a person cascades its entries.

## State transitions (service operations, each in one transaction — D3/D4)

| Operation | Behavior |
|---|---|
| `addEntry(personId, value)` | Trim + validate → uniqueness check → insert; `is_primary = 1` iff the person had no entries of that type, else 0. |
| `editEntry(personId, entryId, value)` | Trim + validate → uniqueness check excluding `entryId` (self-recasing allowed) → update `value` only; `is_primary` untouched (editing the primary keeps it primary). |
| `markPrimary(personId, entryId)` | If already primary: no-op success. Else clear the type's current primary flag, set it on `entryId`. |
| `removeEntry(personId, entryId)` | Delete the row. If it was primary and survivors remain, promote the survivor with the lowest `id`. Removing the last entry leaves the person validly empty. |
| `createPerson(input)` | Names insert + (if provided) primary email entry + (if provided) primary phone entry, after pre-checking both uniqueness rules; any conflict aborts the whole creation (FR-011). |
| Migration 0004 | Each pre-existing non-null `people.email` / `people.phone` becomes that person's sole primary entry of the type, `created_at` carried from the person row; columns then dropped (FR-014, D5). |

## Failure modes (typed service results → route mapping)

| Condition | Service result | HTTP | Message |
|---|---|---|---|
| Blank/whitespace value | zod failure | 400 | "A value is required" |
| Email collides (case-insensitive, any person, any entry) | `email-conflict` | 409 | "That email is already in use" |
| Phone collides (exact text) | `phone-conflict` | 409 | "That phone number is already in use" |
| Unknown person or entry id | `not-found` | 404 | "Person not found" / "Entry not found" |

All failures leave every list unchanged (single transaction; pre-checks run before any write).
