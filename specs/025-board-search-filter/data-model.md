# Phase 1 Data Model: board-search-filter

**No database schema change, and therefore no drizzle migration.** This feature reads existing tables only — `tasks`, `task_notes`, `task_people` → `people`, `task_companies` → `companies`, `task_tags` → `tags`. Every entity below is either an existing row shape being re-projected or a view-level structure that never reaches the database.

## Existing entities read (unchanged)

| Entity | Table | What this feature reads | Written by this feature |
| --- | --- | --- | --- |
| Card (task) | `tasks` | `id`, `title`, `lane`, `position`, `createdAt` | `lane` + `position` only via the existing cross-lane drag path (FR-015) |
| Note | `task_notes` | `text` (all notes for the card) | never |
| Tag | `tags` via `task_tags` | `id`, `name`, `color` for each tag on the card | never |
| Person | `people` via `task_people` | `firstName`, `lastName` (composed into a display name) | never |
| Company | `companies` via `task_companies` | `name` | never |

## New transport shape: `BoardTask`

Returned by `GET /api/board` in place of the bare `Task`, and built server-side for MCP filtering. Added to `src/shared/types.ts`.

```ts
export interface BoardTask extends Task {
  tags: Tag[];        // tags attached to this card, alphabetical (NOCASE)
  searchText: string; // lowercased title + note texts + linked person/company names, '\n'-joined
}

export interface BoardLane { name: string; tasks: BoardTask[] }  // existing interface, tasks re-typed
export interface BoardView { lanes: BoardLane[] }                // unchanged
```

**Field rules**

- `searchText` is built as `[title, ...noteTexts, ...personNames, ...companyNames].join('\n').toLowerCase()`. A person's name is `` `${firstName} ${lastName}`.trim() ``. A card with no notes and no links contributes only its title — never `undefined`, never an error (spec edge case "Cards with no notes, tags, or links").
- `searchText` is **already lowercased**, so a matcher lowercases only the query. This is a contract between the builder and the predicate and is asserted directly in the unit tests.
- `tags` follows the ordering `getTagsForTask` already produces (name, `COLLATE NOCASE`).
- Ordering of tasks within a lane is untouched: `position ASC, id ASC` (FR-010, SC-005).

## New view-level entity: `BoardFilter`

The "Active filter" of the spec. Client state, mirrored into `localStorage`; it is never persisted server-side and never part of a card's stored data.

```ts
export interface BoardFilter {
  text: string;      // raw input value, trimmed only at match time (FR-004)
  tagIds: number[];  // selected tag ids; empty means no tag filter
}
```

| Rule | Source |
| --- | --- |
| A filter is "active" when `text.trim() !== ''` **or** `tagIds.length > 0` | FR-011 |
| `text` is stored raw (so the input still shows what the user typed) and trimmed + lowercased at match time | FR-004, edge case "Whitespace-only search" |
| `tagIds` holds ids, not names, so a tag rename does not drop the filter | R3 |
| Persisted at `localStorage['wh.board.filter']` as `{"text":…,"tagIds":[…]}`; malformed or unreadable storage is read as `{text: '', tagIds: []}` | FR-014, R3 |
| Clearing sets it to `{text: '', tagIds: []}` and removes the storage key, in one action | FR-013 |

## Derived values (all `computed`, none stored)

| Value | Definition | Requirement |
| --- | --- | --- |
| `filterActive` | see rule above | FR-011, FR-015, FR-016 |
| `visibleLanes` | every configured lane, each with `tasks.filter(t => matchesBoardFilter(t, filter))` — lanes are never dropped | FR-009 |
| `visibleCount` / `totalCount` | N and M in the "N of M cards" indicator, counted across all lanes | FR-011, FR-012 |
| `availableTags` | union of (distinct tags across all board cards) and (tags currently selected), sorted by name case-insensitively | FR-005, FR-007 |
| `noMatches` | `filterActive && visibleCount === 0` → renders "No cards match" | FR-012 |

## The matching rule (single source of truth)

`src/shared/board-filter.ts`, imported by both `Board.vue` and the MCP `list-board` handler:

```ts
matchesBoardFilter(task: { searchText: string; tags: { id: number }[] }, filter: { text: string; tagIds: number[] }): boolean
```

A card matches when **both** hold (FR-008):

1. **Text** — `filter.text.trim() === ''` (no text filter, FR-004) **or** `task.searchText.includes(filter.text.trim().toLowerCase())` (FR-002).
2. **Tags** — `filter.tagIds.length === 0` (no tag filter) **or** at least one of `task.tags` has an id in `filter.tagIds` (FR-006, "any").

The MCP tool resolves its `tags: string[]` names to ids case-insensitively before calling this same function, so an agent and the UI cannot diverge (SC-006). A supplied name matching no tag resolves to no id and therefore matches no card.

## State transitions

None. No entity in this feature has a lifecycle; the only writes anywhere in the feature are the pre-existing lane/position updates issued by a cross-lane drag (FR-015), which go through the untouched `PUT /api/tasks/:id/placement` path (SC-007).
