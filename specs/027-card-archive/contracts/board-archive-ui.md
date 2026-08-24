# Contract: board & detail-view UI elements for card-archive

## `TaskDetailPage.vue` header

Extends the existing header row (`.task-detail-header`, currently title + delete button — `move-task-from-detail-view`'s and `delete-card`'s precedent):

- `task.archived === false` → renders `<button data-testid="archive-card-button">Archive</button>` (FR-001).
- `task.archived === true` → renders `<button data-testid="unarchive-card-button">Unarchive</button>` **instead of** the archive button (FR-007) — never both.
- The delete button (`data-testid="delete-card-button"`) is present regardless of archived state (FR-019 — delete and archive coexist, unaffected by each other).
- No modal, no `role="alertdialog"` confirmation — clicking either control fires the request immediately (FR-002).
- An inline `role="alert"` error region (new `archiveError` ref, styled like the existing `laneError`) appears only on a failed request; the control itself does not change state until the response resolves.

## `Board.vue` filter bar

`BoardFilterBar.vue` gains one new prop/emit pair, independent of its existing `text`/`tagIds` (FR-005, Out of Scope — no change to the tag selector or its own persistence):

```ts
defineProps<{ /* existing props */; showArchived: boolean }>();
defineEmits<{ /* existing */; 'update:showArchived': [boolean] }>();
```

Rendered as a labeled toggle, `data-testid="show-archived-toggle"`, defaulting to unchecked (FR-005). `Board.vue` owns the `showArchived` ref, seeded from and persisted to `localStorage` via the new `src/client/utils/board-archive-storage.ts` (`research.md` R7, mirroring `board-filter-storage.ts`'s try/catch shape but its own key, `wh.board.showArchived`) — satisfies FR-015/SC-006 (survives a reload) independent of `board-search-filter`'s own filter persistence.

## `Lane.vue` / `TaskCard.vue`

- `Lane.vue`'s `tasks` prop already receives whatever `Board.vue`'s `visibleLanes` computed decides to show (archived-gated, then text/tag-filtered) — no prop or behavior change needed in `Lane.vue` itself beyond the `Task` type already carrying `archived`.
- `TaskCard.vue`: when `task.archived === true`, adds a dimmed class (reduced opacity, consistent with the existing dark-mode-readability palette tokens — no pure-black, no new hardcoded colors) and a small "Archived" badge, `data-testid="archived-badge"` (FR-006). No archive/unarchive click affordance is added to the card (FR-017) — clicking the card still only navigates to its detail view, same as today.
- Drag-and-drop: unchanged for archived cards (`research.md` R6) — no new prop, no new branch in `Lane.vue`'s drop handling.

## Visibility/ordering summary (ties FR-004, FR-006, FR-009, FR-012 together)

| `showArchived` | Card state | Shown? | Position |
| --- | --- | --- | --- |
| off (default) | active | yes | its lane position, among other active cards |
| off (default) | archived | no | — |
| on | active | yes | its lane position |
| on | archived | yes, dimmed + badged | its lane position (interleaved with active cards, not segregated) |

Toggling `showArchived` off always wins over any active text/tag filter match (FR-012) — enforced structurally by `Board.vue`'s layered computed (`http-api.md`'s `archivedGatedLanes` → `visibleLanes`), not by a special case in `matchesBoardFilter` itself, which stays untouched.
