# Data Model: Email Sync

**Feature**: 007-email-sync | **Date**: 2026-08-08 | **Storage**: SQLite via drizzle-orm (`src/server/db/schema.ts`)

Schema changes follow the dev-phase policy: `schema.ts` is edited in place and the drizzle migrations are squashed to a single regenerated baseline (research R8). All timestamps are epoch milliseconds (`integer`), matching the existing tables.

## Entity overview

```
people 1 ──< email_addresses >── (person_id nullable: NULL = unlinked, seen only in synced mail)
                    ▲
                    │ address_id (no cascade — snapshots protect their addresses)
email_conversations 1 ──< email_messages 1 ──< email_participants
```

`person_phones`, `tasks`, `task_people`, `task_notes`, `oauth_clients` are unchanged. `person_emails` is restructured into `email_addresses` (research R7).

## email_addresses (restructured from person_emails)

The shared address record used by both the People page and ingestion (spec Key Entities: Email Address).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | integer | PK autoincrement | |
| person_id | integer | **nullable**, FK → people.id | NULL = unlinked record from synced mail. FK declared `onDelete: 'set null'` as a backstop; person-deletion cleanup is service-managed (below) |
| value | text | not null | Stored with original casing as first seen |
| is_primary | integer (bool) | not null, default false | Only meaningful while linked; always false when person_id is NULL |
| created_at | integer | not null | |

Indexes: unique on `lower(value)` (case-insensitive dedupe, FR-009 — unchanged from today); unique partial on `(person_id) WHERE is_primary = 1` (one primary per person — unchanged).

**Behavior rules** (service layer, `contact-entries.ts` and person deletion):

- **Ingest find-or-create**: lookup by `lower(value)`; if absent, insert with `person_id = NULL`. Ingestion never sets or changes `person_id` and never creates people (FR-010).
- **People-page add** (FR-011/FR-012): if `lower(value)` exists with `person_id = NULL` → link that row (set `person_id`, `is_primary = true` iff the person has no other email); if it exists with any non-null `person_id` → conflict, same rejection as today; otherwise insert linked, as today.
- **People-page edit**: unchanged (value update with conflict check); editing a linked address's value never touches unlinked records — a conflict with an unlinked record is still a conflict only if... no: editing to a value that exists unlinked cannot silently merge two rows, so edit treats *any* existing row (linked or not) as a conflict. Simpler and safe; linking an unlinked record is only offered through add.
- **People-page remove / person delete**: if any `email_participants` row references the address → unlink (`person_id = NULL`, `is_primary = false`), preserving the snapshot's address record; else delete the row (today's behavior). Primary reassignment to a surviving entry works as today.
- Loading a person's emails filters `person_id = ?` — unlinked rows never appear on the People page.

## email_conversations

A thread following the mailbox's own threading (spec Key Entities: Conversation).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | integer | PK autoincrement | |
| graph_conversation_id | text | not null, unique | Graph `conversationId`; find-or-create key (FR-006, research R3) |
| created_at | integer | not null | |

**Derived at query time** (not stored, so late-joining messages can never leave them stale): `subject` = subject of the conversation's earliest message (`min(sent_at)`, id ASC tiebreak) — so "Pricing question", not "Re: Pricing question"; `messageCount` = count of messages; `latestMessageAt` = `max(sent_at)`.

## email_messages

A permanent snapshot of one mailbox message (spec Key Entities: Email Message; FR-003).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | integer | PK autoincrement | |
| conversation_id | integer | not null, FK → email_conversations.id | No cascade paths ever delete messages |
| graph_message_id | text | not null, unique | Graph immutable id (`Prefer: IdType="ImmutableId"`); the dedupe key for idempotent sync (FR-004, research R2) |
| source_folder | text | not null, enum `'inbox' \| 'sent'` | Spec Key Entities: source folder |
| subject | text | not null, default `''` | Missing subject stored as blank (edge case) |
| body_original | text | not null | Body exactly as delivered (may be empty) |
| body_content_type | text | not null, enum `'html' \| 'text'` | As delivered by Graph |
| body_text | text | not null | Derived plain text (research R5); what read tools return |
| sent_at | integer | not null | Epoch ms of `receivedDateTime` (inbox) / `sentDateTime` (sent) (research R4); drives all ordering |
| created_at | integer | not null | Ingest time |

Indexes: unique on `graph_message_id`; on `(conversation_id, sent_at)` for get-conversation ordering; on `sent_at` for emails-for-person keyset paging.

**Immutability**: no code path updates or deletes rows after insert; later mailbox changes are never mirrored (FR-003, SC-005).

## email_participants

The association of one message with one address in one role (spec Key Entities: Participant).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | integer | PK autoincrement | |
| message_id | integer | not null, FK → email_messages.id | |
| address_id | integer | not null, FK → email_addresses.id, **no cascade** | DB-level guarantee that referenced addresses can't be deleted |
| role | text | not null, enum `'from' \| 'to' \| 'cc' \| 'bcc'` | |

Indexes: unique on `(message_id, address_id, role)` — the same address in two roles on one message is two rows (edge case); a duplicate occurrence within one role collapses to one row. Index on `address_id` for emails-for-person.

**Validation at ingest**: exactly one `from` participant per message (Graph guarantees ≤ 1; a missing/empty `from` address is skipped like any recipient with an empty address string). Recipients with empty/absent address strings are skipped; everything else is stored as-is.

## State transitions

- **Message/Participant/Conversation**: insert-only; no updates, no deletes (permanent snapshot).
- **Email Address**: `unlinked → linked` (People-page add matching an existing unlinked record); `linked → unlinked` (remove/person-delete while referenced by a participant); `linked → deleted` (remove/person-delete while unreferenced); value edits only while linked, via the People page.
- **Sync run**: not persisted as an entity — idempotency derives from `graph_message_id` uniqueness, not run bookkeeping (research R10).

## Queries the model must serve (shape only; SQL lives in the implementation)

- **list-conversations**: aggregate per conversation (count, max/min sent_at, earliest subject), order `(latestMessageAt DESC, id DESC)`, keyset-filtered by cursor (research R9).
- **get-conversation**: messages of one conversation `(sent_at ASC, id ASC)` with participants joined to addresses and (via `person_id`) people (FR-008/FR-010).
- **emails-for-person**: distinct messages having any participant whose address's `person_id = ?`, order `(sent_at DESC, id DESC)` keyset-paged; per message, the matching `(address value, role)` pairs restricted to that person's addresses (FR-013).
- **sync dedupe**: `graph_message_id IN (…)` / single lookup before insert.
