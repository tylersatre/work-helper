# Data Model: MCP People Tools

**Feature**: 015-mcp-people-tools | **Date**: 2026-08-11

No schema changes. This document records the existing entities the feature operates on (with the invariants it relies on), the service-level result shapes that change, and the one new read-model shape.

## Existing entities (unchanged schema — `src/server/db/schema.ts`)

### Person (`people`)

| Field | Type | Notes |
|---|---|---|
| id | integer PK | |
| firstName / lastName | text NOT NULL | Non-blank enforced by validation (`First and last name are required`), not by DDL |
| extraFields | JSON text `Record<string,string>` | Only keys in the person-fields config are meaningful; reads filter to configured keys |
| createdAt | integer epoch ms | |

No provenance column exists — FR-002's "indistinguishable from a UI-created person" is structural, not enforced.

### Email address entry (`email_addresses`)

| Field | Type | Notes |
|---|---|---|
| id | integer PK | |
| personId | integer FK → people, **nullable** | NULL = unlinked synced address; set = linked to that person |
| value | text NOT NULL | Stored casing preserved |
| isPrimary | boolean | |
| createdAt | integer epoch ms | |

Invariants the feature leans on (DB-enforced): `email_addresses_value_unique` — unique on `lower(value)` across **all** rows, linked or unlinked, so "some person holds this email" means *a row exists with `personId IS NOT NULL`*, while an unlinked row is not a conflict but a link target (FR-006 vs FR-007/FR-010); `email_addresses_one_primary` — partial unique index allowing at most one `isPrimary = 1` row per person.

### Phone number entry (`person_phones`)

| Field | Type | Notes |
|---|---|---|
| id | integer PK | |
| personId | integer FK → people NOT NULL, cascade delete | Phones have no unlinked state |
| value | text NOT NULL | Compared as exact stored text |
| isPrimary | boolean | |
| createdAt | integer epoch ms | |

Invariants: `person_phones_value_unique` (exact text, product-wide), `person_phones_one_primary` (partial unique, one primary per person).

### Synced mail (read-only for this feature)

`email_messages` (with `sentAt` as the recency axis) and `email_participants` (`messageId`, `addressId` → `email_addresses`, `role` from/to/cc/bcc, `displayName`, indexed by `addressId`). No capability in this feature inserts, updates, or deletes rows in either table — FR-012's "synced mail itself is untouched" and the spec's synced-store guarantees rest on this.

## Address link-state transitions

An `email_addresses` row moves between states only as follows (all shipped service behavior, now reachable via MCP):

| From | Event | To | Mechanism |
|---|---|---|---|
| unlinked (personId NULL) | create-person / add-contact-entry supplies its value | linked | `UPDATE` sets `personId` (and `isPrimary` when it becomes the person's first/only email) — row identity and stored casing preserved, mail history follows (FR-007, FR-010) |
| linked | remove-contact-entry, and mail references the row | unlinked | `UPDATE` sets `personId = NULL`, `isPrimary = false`; row survives for the synced snapshot and reappears in discovery (FR-012, FR-016) |
| linked | remove-contact-entry, and **no** mail references the row | deleted | `DELETE` — nothing references it |
| (absent) | create-person / add-contact-entry with a value unknown to synced mail | linked | plain `INSERT` |

Primary promotion on removal: when the removed entry was primary and others of its type remain, the surviving entry with the lowest id is promoted (`removeEntry`) — a person with entries always has exactly one primary (FR-012, edge case). `markPrimary` on the current primary is a no-op (FR-011).

## Changed service result shapes (`src/server/services/`)

### `people.ts` — `CreatePersonResult` (conflict variants enriched)

```ts
export type CreatePersonResult =
  | { ok: true; person: PersonRecord }
  | { ok: false; error: 'email-conflict' | 'phone-conflict'; holder: { id: number; name: string } };
```

`holder` names the person who already has the value (FR-006). `name` is `"${firstName} ${lastName}"`. REST routes ignore `holder`; the MCP tool layer formats it into the error text.

### `contact-entries.ts` — `EntryMutationResult` (conflict variant enriched)

```ts
export type EntryMutationResult =
  | { ok: true; entries: ContactEntry[] }
  | { ok: false; error: 'person-not-found' | 'entry-not-found' }
  | { ok: false; error: 'conflict'; holder: { id: number; name: string } };
```

The holder may be the same person the call targets (edge case: adding a value the person already holds identifies that person).

## New read-model shape (`src/server/services/email/queries.ts`)

### `UnlinkedAddressSummary` — one discovery-list row (FR-015)

```ts
export interface UnlinkedAddressSummary {
  address: string;       // stored casing of the unlinked email_addresses row
  messageCount: number;  // COUNT(DISTINCT message) involving it in any role
  displayName: string;   // most recently seen non-empty participant display name; the bare address when none exists
  lastMessageAt: number; // MAX(sent_at) over its messages, epoch ms
}
```

`listUnlinkedAddresses(db): UnlinkedAddressSummary[]` — complete list (no pagination, research D8), ordered `messageCount DESC, lastMessageAt DESC, address ASC`. Computed live per call, so link changes reflect immediately (FR-016) and nothing is suppressed (FR-017).

## MCP person read-model (tool layer)

The person shape returned by `get-person`, `create-person`, and `update-person` (research D9): existing scalars `email` / `phone` (primary values or null) **plus** `emails` / `phones` arrays of `{ id: number; value: string; isPrimary: boolean }` (FR-018). `search-people` rows keep primary-only scalars (FR-019). Entry `id`s are the handles for `mark-contact-primary` / `remove-contact-entry`.

## Validation rules → requirements map

| Rule | Where enforced | Requirement |
|---|---|---|
| First/last name non-blank (create, and on update when provided) | zod schema at tool layer + shared `createPersonInputSchema` semantics | FR-004, FR-008 |
| Unknown extra-field names rejected, naming the field(s) | MCP tool layer against `context.personFields` (UI keeps silent-drop) | FR-005, FR-008 |
| Email uniqueness, case-insensitive, holder identified | services (existing checks + enriched holder) | FR-006, FR-009 |
| Phone uniqueness, exact text, holder identified | services (existing checks + enriched holder) | FR-006, FR-009 |
| Blank-but-present email/phone on create rejected (`A value is required`) | MCP-strict input schema at tool layer | Edge case, FR-009 analogue |
| Blank value on add-contact-entry rejected | existing `entryValueSchema` in `addEntry` | FR-009 |
| At most one email + one phone at creation, each becoming primary | create-person input schema (scalar fields) + existing service behavior | FR-003 |
| One primary per type whenever entries exist; promotion on primary removal | existing services + DB partial unique indexes | FR-011, FR-012 |
| No in-place value edit via agent | no such tool registered | FR-013 |
| No person deletion via agent | no such tool registered | FR-020 |
