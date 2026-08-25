# Data Model: Up Next Dashboard

**Branch**: `029-up-next-dashboard` | **Date**: 2026-08-25

No schema migration is required by this feature. One new stored value (an `app_state` row), one extended config shape, and two derived/projected shapes.

## 1. DashboardSavedView (stored — `app_state` key `dashboard.view`)

The single server-side saved view (spec Key Entities), stored as a JSON string in the existing `app_state` table (`src/server/db/schema.ts:118`). Zod schema lives in `src/shared/validation.ts` (shared by client pre-validation and server PUT validation).

| Field | Type | Validation | Meaning |
| --- | --- | --- | --- |
| `lanes` | `string[]` | ≥1 entry, unique, non-empty strings | Selected lane names. Names may go stale (lane removed from config) — see read-time rules. |
| `tagIds` | `number[]` | integers, unique | Selected tag ids; empty = no tag filter. Ids may go stale (tag deleted). |
| `text` | `string` | any (trimmed at match time, not at rest) | Text filter; `''` = no text filter. |
| `limit` | `number` | integer, 1–100 | Card limit, applied after all filters (FR-003). |
| `show` | `object` | all four booleans required | Display toggles: `tags`, `latestNote`, `links` (people/companies), `lane`. |

**Existence states**: absent row / unparsable JSON / schema-invalid ⇒ treated as never-saved (built-in default view applies, FR-005). Valid ⇒ interpreted client-side per read-time rules. There is exactly zero or one of these; no MCP surface (FR-012).

**Write rules (PUT)**: full replacement of the whole object (both popups submit the complete merged view); strict validation, 400 on violation; last write wins (FR-019).

**Read-time rules (client, per render — never rewritten in storage)** (FR-021):

- effective lanes = `saved.lanes ∩ configured lanes`; if empty ⇒ config-designated `defaultLanes`.
- effective tagIds = `saved.tagIds ∩ tags present in the payload`; stale ids silently dropped.
- never-saved ⇒ built-in default: lanes = `defaultLanes`, `tagIds: []`, `text: ''`, `limit: 5`, `show: { tags: true, latestNote: true, links: true, lane: false }`.

## 2. LanesConfig (config file — `config/lanes.json`, loaded at boot)

Extended shape returned by `loadLanesConfig` (`src/server/lanes-config.ts`); file accepts a backward-compatible union (research D2):

| Field | Type | Validation | Fallback when absent |
| --- | --- | --- | --- |
| `lanes` | `string[]` | existing rules: ≥1, unique, non-empty trimmed | — (required; a legacy bare-array file *is* this field) |
| `dashboardDefaultLanes` | `string[]` | non-empty, unique, subset of `lanes` | `[lanes[0]]` (first configured lane) |
| `quickDoneLane` | `string` | member of `lanes` | `lanes[lanes.length - 1]` (last configured lane) |

Normalized loader return: `{ lanes: string[], dashboard: { defaultLanes: string[], quickDoneLane: string } }`. Applied by restart only, like lanes today (FR-006). Validation failures throw at boot with the config path in the message (deploy-test contract). `dashboardDefaultLanes` selects lanes; list ordering always follows `lanes` order (FR-002).

## 3. DashboardCard (derived — response shape of `GET /api/dashboard`, not stored)

Projection over existing tables (`tasks`, `task_notes`, `tags`/`task_tags`, `people`/`task_people`, `companies`/`task_companies`). Types in `src/shared/types.ts`.

| Field | Type | Source / rule |
| --- | --- | --- |
| `id`, `title`, `lane`, `position`, `createdAt` | as in `tasks` | `archived = false` rows only, all configured lanes (FR-004: archived excluded server-side) |
| `tags` | `{ id, name, color }[]` | ordered `name COLLATE NOCASE` (same as board) |
| `searchText` | `string` | same builder as the board: lowercased newline-join of title + all note texts + person full names + company names (`src/server/services/tasks.ts:117`) — filter corpus only, never displayed |
| `latestNote` | `{ text, createdAt } \| null` | newest note by `desc(createdAt), desc(id)` (ms-collision tiebreak, matching `getTaskDetail`) |
| `people` | `{ id, name }[]` | linked people, `name` = `firstName lastName` |
| `companies` | `{ id, name }[]` | linked companies |

**Response ordering**: lane (configured order) first, then `position ASC, id ASC` — the flat-list order (FR-002); the client only filters and truncates, never re-sorts.

## 4. EffectiveView / list selection (client-side pure functions — `src/client/utils/up-next-view.ts`)

Not persisted; computed each render from (payload, saved view, popup pending state):

- `effectiveView(saved, config, availableTags)` → applies §1 read-time rules.
- `selectCards(cards, view)` → lane membership → `matchesBoardFilter(card, { text, tagIds })` (`src/shared/board-filter.ts`, reused verbatim, FR-010) → truncate to `limit` (FR-003). Input order is preserved (server pre-sorted).
- `tagOptions(cards)` → tags attached to ≥1 card, deduped by id, `localeCompare(..., { sensitivity: 'base' })` (FR-009).

## 5. State transitions

- **Saved view**: never-saved → saved (first OK in either popup); saved → saved (any later OK, full replacement). No delete/reset path in this feature.
- **Quick done**: card's `lane` → `quickDoneLane`, `position` → bottom (existing `moveTask` transaction; dense re-positioning of both lanes). Dashboard membership afterwards is a pure consequence of the current filters — no special-casing (FR-014).
- **Add note**: new `task_notes` row with `source: 'ui'` (renders as "You"); card's `latestNote` changes on next fetch (FR-015).
