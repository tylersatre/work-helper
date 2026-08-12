# Data Model: Calendar Sync

Three new tables, all added by one new drizzle migration (`drizzle/0002_*.sql`, generated with `npx drizzle-kit generate` after editing `src/server/db/schema.ts`). The migration is purely additive (`CREATE TABLE` + indexes) — no existing table is altered, so production data is untouched. Conventions follow the existing schema exactly: snake_case SQL names / camelCase TS keys, integer autoincrement PKs, epoch-ms integer timestamps, `integer(..., { mode: 'boolean' })` booleans, `text(..., { enum: [...] })` enums, JSON columns via `text(..., { mode: 'json' })`.

## Entity: calendar_events (`calendarEvents`)

One stored occurrence from the default calendar (spec Key Entities: "Calendar event"). Recurring series appear as one row per occurrence (FR-009).

| TS key | Column | Type | Notes |
|---|---|---|---|
| id | `id` | integer PK autoincrement | |
| graphEventId | `graph_event_id` | text NOT NULL | Immutable Graph event id; upsert identity (research R2) |
| seriesMasterId | `series_master_id` | text, nullable | Shared series identifier; NULL for one-off events (FR-009) |
| subject | `subject` | text NOT NULL default `''` | |
| bodyOriginal | `body_original` | text NOT NULL default `''` | Body as returned by Graph (mirrors `email_messages`) |
| bodyContentType | `body_content_type` | text enum `['html','text']` NOT NULL default `'text'` | |
| bodyText | `body_text` | text NOT NULL default `''` | Plain text derived from html via `html-to-text` (same helper as email) |
| startAt | `start_at` | integer (epoch ms) NOT NULL | UTC instant (research R3) |
| endAt | `end_at` | integer (epoch ms) NOT NULL | |
| isAllDay | `is_all_day` | boolean NOT NULL default `false` | FR-012 |
| isCancelled | `is_cancelled` | boolean NOT NULL default `false` | Set by fetch (`isCancelled: true`) or in-range disappearance (FR-011) |
| location | `location` | text NOT NULL default `''` | Graph `location.displayName` |
| onlineMeetingUrl | `online_meeting_url` | text NOT NULL default `''` | `onlineMeeting.joinUrl` falling back to legacy `onlineMeetingUrl` |
| categories | `categories` | json string[] NOT NULL default `[]` | Same shape as `email_messages.categories` |
| webLink | `web_link` | text NOT NULL default `''` | Opens the event in Outlook (FR-008) |
| createdAt | `created_at` | integer (epoch ms) NOT NULL | First-stored time |

**Indexes**: `calendar_events_graph_id_unique` UNIQUE on `graph_event_id`; `calendar_events_start_at` on `start_at` (range queries); `calendar_events_series_master_id` on `series_master_id` (future series grouping, cheap now).

**Validation / invariants**: `endAt >= startAt`; rows are never deleted by sync (FR-011); refresh overwrites every field above except `id`, `graphEventId`, `createdAt`.

**State transitions**: active → cancelled (in-range disappearance or `isCancelled` from Graph); cancelled → active (a later fetch returns the event un-cancelled, e.g. moved back into a synced range — spec moved-event edge case).

## Entity: calendar_event_participants (`calendarEventParticipants`)

The connection between an event and an email address (spec Key Entities: "Event participant"). Organizer is a participant row with role `organizer`.

| TS key | Column | Type | Notes |
|---|---|---|---|
| id | `id` | integer PK autoincrement | |
| eventId | `event_id` | integer NOT NULL FK → `calendar_events.id` ON DELETE cascade | |
| addressId | `address_id` | integer NOT NULL FK → `email_addresses.id` | Shared address records (FR-015) |
| role | `role` | text enum `['organizer','required','optional','resource']` NOT NULL | Graph attendee `type` + organizer; `resource` per clarification 2026-08-12 |
| responseStatus | `response_status` | text enum `['none','accepted','declined','tentative']` NOT NULL default `'none'` | Graph mapping in research R10; organizer rows carry `'none'` |
| displayName | `display_name` | text NOT NULL default `''` | Name as seen on this event; empty when absent (edge case) |

**Indexes**: `calendar_event_participants_event_address_role_unique` UNIQUE on `(event_id, address_id, role)` (same address in two roles = two rows, mirroring `email_participants`); `calendar_event_participants_address_id` on `address_id` (person→events lookups, FR-021).

**Refresh behavior**: on an updated event, participants are delete-and-reinserted inside the event's transaction (the `email_attachments` refresh pattern), so response-status changes land (US5 scenario 1).

## Entity: calendar_sync_runs (`calendarSyncRuns`)

One history entry per executed calendar sync run (spec Key Entities: "Calendar sync run"). A separate table, not a discriminator on `sync_runs` — rationale in research R6.

| TS key | Column | Type | Notes |
|---|---|---|---|
| id | `id` | integer PK autoincrement | |
| ranAt | `ran_at` | integer (epoch ms) NOT NULL | |
| startDate | `start_date` | text `YYYY-MM-DD` NOT NULL | Requested range, inclusive local days |
| endDate | `end_date` | text `YYYY-MM-DD` NOT NULL | |
| source | `source` | text enum `['web','mcp']` NOT NULL | FR-005, FR-018 |
| status | `status` | text enum `['success','failure']` NOT NULL | |
| newCount | `new_count` | integer NOT NULL | |
| updatedCount | `updated_count` | integer NOT NULL | |
| error | `error` | text, nullable | Error text on failure (FR-013) |

**Indexes**: `calendar_sync_runs_ran_at` on `ran_at`. Listed newest-first (`ORDER BY ran_at DESC, id DESC`), kept forever (FR-005). Validation failures record no row (FR-018); rejected "already running" attempts record no row (FR-006).

## Existing entities touched (no schema change)

- **`email_addresses`** — unchanged schema; now also referenced by `calendar_event_participants.address_id`. Find-or-create on `lower(value)` at ingest; `person_id IS NULL` still means "unlinked". Claiming an address for a person (`contact-entries.ts` `addEntry`) retroactively connects that person to already-synced events with no calendar code involved (FR-016).
- **`people`** — unchanged; reached from events only through linked addresses; never auto-created by sync (FR-015).
- **`contact-entries` service** — `isEmailAddressReferenced` gains a `calendar_event_participants` check so addresses referenced only by events are unlinked (person_id → NULL), never deleted, on removal/edit.
- **`sync_runs`** — untouched; remains email-only.

## Relationships

```text
people 1 ── * email_addresses (person_id, nullable)
email_addresses 1 ── * email_participants (mail, existing)
email_addresses 1 ── * calendar_event_participants (NEW)
calendar_events 1 ── * calendar_event_participants (NEW)
calendar_events * ──(series_master_id, nullable)── shared series identifier (no series table in this slice)
```
