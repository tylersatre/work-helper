# Contract: board filter bar (UI surface)

The user-facing contract for US1–US4. Test ids are part of the contract — the component tests and the `browser-tester` agent both drive the board through them.

## Structure

```text
BoardPage
└── Board.vue                       ← owns board data + BoardFilter state + localStorage
    ├── BoardFilterBar.vue (new)    ← search input, tag selector, indicator, clear control
    └── Lane.vue × 4                ← receives already-filtered tasks + filterActive
        └── TaskCard.vue            ← unchanged (FR-010)
```

## Elements

| Test id | Element | Shown when | Requirement |
| --- | --- | --- | --- |
| `board-filter-bar` | container above the lanes | always, even on an empty board | FR-001, edge case "Empty board or no tags in use" |
| `board-search-input` | text input, `placeholder="Search cards"` | always | FR-001, FR-003 |
| `board-tag-filter` | multi-select of tag names | always (may offer nothing) | FR-001, FR-005 |
| `board-filter-indicator` | text `"{N} of {M} cards"` | only while a filter is active | FR-011, FR-012 |
| `board-clear-filters` | button `"Clear filters"` | only while a filter is active | FR-011, FR-013 |
| `board-no-matches` | message `"No cards match"` | filter active **and** N = 0 | FR-012 |
| `lane-empty` | existing per-lane placeholder | that lane has no visible cards | FR-009 |

## Behaviour

| # | Behaviour | Requirement |
| --- | --- | --- |
| U1 | Typing in the search input re-filters on every `input` event — no debounce, no submit button, no fetch | FR-003, SC-002 |
| U2 | Leading/trailing whitespace is trimmed before matching; a whitespace-only value is no filter at all | FR-004 |
| U3 | The tag selector offers exactly the tags in use on the board, alphabetically (case-insensitive), plus any still-selected tag that has left the board | FR-005, FR-007 |
| U4 | Selecting multiple tags widens by union; text and tags intersect | FR-006, FR-008 |
| U5 | All four lanes always render, each with its empty placeholder when it has no visible cards; the board never collapses | FR-009, FR-012 |
| U6 | Visible cards keep their manual order and their existing title-only face — no highlighting, no match explanation | FR-010 |
| U7 | With no filter active, neither the indicator nor the clear control is rendered | FR-011 |
| U8 | The clear control empties the text and deselects every tag in one action, restoring all cards in manual order | FR-013, SC-005 |
| U9 | The filter is written to `localStorage['wh.board.filter']` on every change and restored on mount, surviving a reload and an SPA navigation round trip | FR-014, SC-004 |
| U10 | A cross-lane drag while filtered issues `PUT /api/tasks/:id/placement` with `index` = destination lane's **unfiltered** task count | FR-015 |
| U11 | A within-lane drag while filtered issues **no** request and leaves the board state untouched | FR-016, SC-007 |
| U12 | While filtered, no drop indicator is rendered in any lane | FR-016 (supporting) |
| U13 | A card that stops matching (edited elsewhere, or refetched) disappears on the next render and the N/M count follows | edge case "A card stops matching while filtered" |
| U14 | If `localStorage` is unavailable or holds malformed JSON, the board renders with no filter rather than failing | R3 |

## Styling

Per the project's UI conventions, the filter bar uses `palette.ts` tokens (`--wh-surface`, `--wh-border-subtle`, `--wh-text-primary`) and naive-ui primitives already used elsewhere in the app (`NInput`, `NSelect`, `NButton`) — no new dependency, no pure black.
