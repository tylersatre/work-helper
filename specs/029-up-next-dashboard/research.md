# Research: Up Next Dashboard

**Branch**: `029-up-next-dashboard` | **Date**: 2026-08-25

All unknowns the spec delegated to `/speckit-plan` are resolved below. No NEEDS CLARIFICATION remain.

## D1 — Saved-view storage: `app_state` key/value row, no migration

**Decision**: Store the single saved view as a JSON blob in the existing `app_state` table (`src/server/db/schema.ts:118`, `{ key TEXT PRIMARY KEY, value TEXT }`) under key `dashboard.view`, via the existing `getAppState`/`setAppState` service (`src/server/services/app-state.ts`). The blob is zod-validated on read; an absent, unparsable, or schema-invalid value is treated as "never saved" (built-in default view applies). Writes are last-write-wins, matching FR-019.

**Rationale**: The spec needs exactly one record for the app's single user — a key/value row is the natural fit, the service already exists, and it requires **zero schema migration**, which sidesteps the production-data migration constraints entirely (constitution "Data & migrations"). The spec already mandates a defined fallback for the never-saved case, so "corrupt ⇒ default" adds no new behavior surface.

**Alternatives considered**: A dedicated single-row `dashboard_view` table with typed columns — rejected: needs a migration, adds column churn every time the view shape grows (display toggles, future facets), and column-level constraints buy little since the server never interprets the view (see D3). Client-side localStorage (the board filter's pattern, `src/client/utils/board-filter-storage.ts`) — ruled out by FR-012/SC-003 (server-side, cross-device).

## D2 — Lane config designations: backward-compatible union format

**Decision**: `loadLanesConfig` (`src/server/lanes-config.ts`) accepts two file shapes via a zod union and returns a normalized `LanesConfig` object `{ lanes: string[], dashboard: { defaultLanes: string[], quickDoneLane: string } }`:

- **Legacy form** (today's file): a bare array `["To Do", "In Progress", "Waiting", "Done"]` → `lanes` = the array, `defaultLanes` = `[lanes[0]]`, `quickDoneLane` = last lane (the spec's fallback rule, FR-006).
- **Object form**: `{ "lanes": [...], "dashboardDefaultLanes": [...], "quickDoneLane": "..." }` with both designation fields optional, each independently falling back as above. Validation: `lanes` keeps today's rules (non-empty trimmed, unique, ≥1); `dashboardDefaultLanes` must be a non-empty unique subset of `lanes`; `quickDoneLane` must be one of `lanes`. Errors keep embedding the config path in the message (the deploy test `tests/deploy/config-mount.test.ts:50-55` asserts the filename appears in startup logs on malformed config).

`buildApp` keeps its existing `lanes: string[]` option unchanged and gains an optional `dashboardLanes?: { defaultLanes: string[]; quickDoneLane: string }`; when absent it derives the same first/last fallback internally, so the ~20 existing test files passing `lanes: LANES` keep working untouched and the fallback edge case is exercised by default. `src/server/index.ts:25` passes both from the loader.

**Rationale**: `config/` is a bind-mounted host volume in production (`compose.yaml`), so a deployed legacy-array `lanes.json` must keep booting the app — the union makes the old file valid forever and the fallback rule is exactly the spec's edge case. Flat top-level keys (`dashboardDefaultLanes`, `quickDoneLane`) keep the file trivially hand-editable by Tyler.

**Alternatives considered**: Nested `{ "lanes": [...], "dashboard": { ... } }` file shape — rejected as needless depth for a two-field addition (the *returned* object nests for typing ergonomics; the *file* stays flat). A separate `config/dashboard.json` — rejected: the spec places the designations "in the lane config file, edited and applied by restart, exactly like lanes".

**Note on list order**: `dashboardDefaultLanes` selects lanes; the flat list's ordering always follows configured lane order (`lanes` array order) per FR-002, regardless of the designation array's order.

## D3 — Data flow: new `GET /api/dashboard`, filtering client-side

**Decision**: One new endpoint `GET /api/dashboard` returns everything the page needs in a single response: the configured lane order, the (fallback-applied) `defaultLanes` and `quickDoneLane`, the raw saved view (or `null`), and **all non-archived cards across all configured lanes** — each enriched with tags, `searchText`, latest note (`{ text, createdAt }` or `null`), and structured linked people/companies (see data-model.md). The client computes the effective view and applies lane selection, text/tag filtering, ordering, and the limit locally; `PUT /api/dashboard/view` persists the saved view.

**Rationale**: FR-011's live preview re-filters on every popup keystroke/toggle — client-side filtering over a complete dataset makes preview instant with zero extra requests, and it reuses the existing shared predicate `matchesBoardFilter` (`src/shared/board-filter.ts`) verbatim, guaranteeing FR-010's "reuse board-search-filter semantics" by construction (same function, same server-built `searchText` corpus from `src/server/services/tasks.ts:117`). Returning *all* lanes' cards (not just the selected ones) is what lets the filter popup preview a newly selected lane (Story 3 scenario 2) without a refetch; at personal-CRM scale the payload is small. Archived cards are excluded server-side because FR-004 says they never appear under any client state.

**Alternatives considered**: Extending `GET /api/board`'s `BoardTask` with the display fields — rejected: couples the dashboard to the board payload the product doc walls off ("any change to the board page" is out of scope), and the board has no use for the extra weight. Server-side filtering with the saved view interpreted on the server — rejected: makes live preview require a round-trip per pending change or a duplicate query param surface; it also splits FR-010's semantics across two implementations.

## D4 — Saved-view interpretation happens client-side; stale entries sanitized at read time

**Decision**: The server stores and returns the saved view verbatim (validated for shape on PUT, tolerated-or-null on GET); it never interprets or rewrites it. The client computes the **effective view** each render: saved lanes are intersected with the configured lanes (silently dropping stale names, falling back to `defaultLanes` if the intersection is empty — FR-021), saved tag ids are intersected with tags present in the payload, and the never-saved/invalid case yields the built-in default view (FR-005). The stored blob is never cleaned up in place.

**Rationale**: One interpreter (the client) keeps FR-021's silent-ignore rule in exactly one pure function, unit-testable without a server; not rewriting storage means a lane temporarily removed from config and later restored resurrects the saved filter, which is the least surprising behavior for "silently ignore".

**Alternatives considered**: Server-side sanitization on GET — workable but duplicates lane/tag knowledge the client already holds in the same payload; sanitize-on-write cleanup — rejected: turns a read-time tolerance rule into a destructive write.

## D5 — Poll: 45-second interval, immediate refetch after local mutations, silent failure

**Decision**: The dashboard refetches `GET /api/dashboard` every **45 seconds** (constant `POLL_INTERVAL_MS = 45_000`), plus an immediate refetch after every dashboard-initiated mutation (quick done, note added, view saved, overlay closed). A failed poll keeps the last-good payload and schedules nothing special — the next tick retries (FR-022; no error UI). A separate 30-second "now" ticker drives relative-timestamp re-rendering, following the `TaskNotes.vue` pattern. Timers start on mount and are cleared in `onUnmounted`, modeled on `MailboxPanel.vue:37-59`.

**Rationale**: FR-018 caps the interval at 60s and SC-004 requires visibility within 90s; 45s leaves a 45-second budget for request latency and render even when a change lands immediately after a tick, making the browser-tester's 90-second watch robust rather than knife-edge. Polling only (no push) is an explicit out-of-scope decision in the product doc.

**Alternatives considered**: 60s — spec-legal but leaves only 30s of slack in the worst case; 15–30s — needless load for an always-on page whose freshness contract is 90s.

## D6 — Quick done: reuse `PUT /api/tasks/:id/placement`, no new endpoint

**Decision**: The quick done action calls the existing placement endpoint (`src/server/routes/tasks.ts:72-98`) with `{ lane: quickDoneLane, index: Number.MAX_SAFE_INTEGER }` — the established bottom-of-lane idiom (`TaskDetailPage.vue:34-37`, `src/server/mcp/tools.ts:1304`); `quickDoneLane` comes from the `GET /api/dashboard` payload. On success the dashboard refetches immediately; on failure (e.g. 404 because the card was deleted elsewhere) it shows an inline dismissible error (the `Board.vue:259` banner pattern) and refetches so the list shows true state — the edge case's "fails gracefully, never acts on the wrong card" holds because the action targets a stable task id.

**Rationale**: `moveTask` (`src/server/services/tasks.ts:127`) already implements clamped bottom-of-lane splicing transactionally with dense re-positioning, and is covered by tests (`tests/integration/tasks.test.ts:252`); a new endpoint would duplicate a solved problem.

**Alternatives considered**: A dedicated `POST /api/tasks/:id/quick-done` resolving the target lane server-side — rejected: the client already needs `quickDoneLane` for nothing extra (it arrives in the dashboard payload), and a second move code path is a divergence risk.

## D7 — Add note: reuse `POST /api/tasks/:id/notes` with shared validation

**Decision**: The inline add-note control posts to the existing notes route, which attributes `source: 'ui'` — exactly what makes the detail view label it "You" (`NoteItem.vue:11`). The client pre-validates with the shared `noteTextSchema` (`src/shared/validation.ts:17`) before fetching, mirroring `TaskNotes.vue:31-36`, so whitespace-only submissions are rejected with an inline validation message and no request (FR-015). On success the dashboard refetches, updating the latest-note snippet.

**Rationale**: Same schema on both sides is the codebase's established pattern; no server change is needed at all for this action.

## D8 — Detail overlay: extract `TaskDetail.vue` from `TaskDetailPage.vue`

**Decision**: Extract the body of `TaskDetailPage.vue` into a new `TaskDetail.vue` component taking `taskId: number` as a prop and emitting `closed`-relevant events instead of navigating: the two hard-coded `router.push('/')` calls (archive at `:130`, delete at `:180`) become emits the host interprets. `TaskDetailPage.vue` becomes a thin route wrapper (the exact `BoardPage → Board` split precedent) that passes `route.params.id` and navigates home on archive/delete as today. The dashboard renders `TaskDetail` inside an `NModal` (card preset, ~680px, matching the detail page's 640px column) and refetches the dashboard when the overlay closes — covering lane-pill moves made inside it (Story 4). The URL does not change while the overlay is open (spec: "no full navigation"). The nested `DeleteCardConfirm` modal stacks fine since naive-ui teleports modals to `body`.

**Rationale**: FR-017 demands "everything the detail page shows"; rendering the same component is the only way that stays true as the detail page evolves. The refactor is mechanical and the existing detail-page tests keep passing against the wrapper.

**Alternatives considered**: An iframe or routed child view — rejected (heavyweight; URL change violates "same page"); duplicating the detail markup in a dashboard-specific overlay — rejected (guaranteed drift).

## D9 — Settings popups: NModal dialogs with snapshot/dirty/confirm-discard

**Decision**: Two popups (display toggles; filters) are `NModal preset="dialog"` components following the codebase's modal conventions (`DeleteCardConfirm.vue` reference: `display-directive="if"`, `data-testid` on the root, keep-open-on-failure by returning `false`). Each popup snapshots the effective view on open, edits a local pending copy that the page uses for live preview (FR-011), and on OK PUTs the merged view (the popup's whole pending state — last write wins per FR-019). Any other close path (`@update:show` false, Esc, mask, Cancel) with a dirty pending state opens a nested confirm dialog ("Discard changes?"); discard reverts preview to the saved view. The dirty check is a deep-equal against the open-time snapshot, so toggling something back to its original value counts as clean — the `TagsPage.vue:16,95-101` snapshot/compare precedent, plus the confirm step.

**Card-limit input mechanics** (spec assumption → decided): `NInputNumber` with `min: 1`, `max: 100`, integer precision, default 5; the shared zod saved-view schema enforces the same bounds server-side. OK is disabled while the pending state is invalid (no lanes selected, or a non-integer/out-of-range limit), satisfying the "popup prevents saving an invalid view" edge case.

**Rationale**: Confirm-on-dismiss has no existing precedent, but the `@update:show` hook every modal already wires is exactly the interception point; building it in the popup keeps the page dumb.

## D10 — Tag options list: derived from the dashboard payload, board-bar rules

**Decision**: The filter popup's tag multi-select lists the union of tags attached to at least one card in the dashboard payload, deduped by id and sorted with `localeCompare(..., { sensitivity: 'base' })` — the same rules as `Board.vue:69-84`, lifted into the dashboard's pure view-logic module rather than shared with the board (the board page must not change, per out-of-scope).

## D11 — Card face and page composition

**Decision**: New components, flat in `src/client/components/` per convention: `UpNextPage.vue` (thin page shell) hosting `UpNextDashboard.vue` (fetch/poll/state/popups/overlay orchestration), `UpNextCard.vue` (card face: title, `TagChip` reuse for identical colors, latest-note snippet + relative time via `relativeTime` from `src/client/utils/time.ts`, linked people/company names, optional lane name, quick-done button, inline add-note editor), and the two popup components. The list renders in the existing `.wh-card-list` container (`App.vue:170-190`) inside a centered section (`max-width` ~720px), matching the UI conventions memory (card-contained lists, palette tokens). The no-match state is `NEmpty` with a `data-testid` (FR-013). The latest-note snippet truncates via single-line CSS ellipsis (acceptance-adjustable wording/length per spec). Pure view logic — effective-view computation (D4), lane/tag/text filtering + lane-order-then-position sort + limit-after-filter truncation, tag option derivation — lives in `src/client/utils/up-next-view.ts` as dependency-free functions for direct unit testing. `TaskCard.vue` is not reused (it is a drag-enabled board `<li>` with none of the display fields).

**Poll-tick non-clobber (FR-019) state design**: the poll only ever replaces the `data` ref (payload). Popup pending state, the per-card inline note editor state (keyed by task id), and the overlay's open/task state live in separate refs the poll never touches; card list items are keyed by task id so Vue patches in place and an open note editor survives reorders around it. While a popup is open, preview derives from pending state over the latest payload — a remotely changed saved view arriving mid-edit changes nothing visible until close/OK (OK still writes the popup's state, last write wins).

## D12 — Server card projection: extend the tasks service, don't fork it

**Decision**: A new `src/server/services/dashboard.ts` builds the enriched card list by reusing the existing per-table grouped-query helpers in `src/server/services/tasks.ts` (the `groupByTaskId` pattern and the `searchText` builder at `:112-120`), adding one new projection: latest note per task, ordered `desc(createdAt), desc(id)` — the same tiebreak `getTaskDetail` uses at `:210-215`, which matters because `createdAt` is ms-precision and collides. Cards are selected across all configured lanes with `archived = false` server-side, ordered by lane (config order) then `position ASC, id ASC`. Shared response types go in `src/shared/types.ts`; the saved-view zod schema goes in `src/shared/validation.ts` so client pre-validation and server PUT validation are the same object (the `noteTextSchema` precedent).

## D13 — Nav integration

**Decision**: Route `/up-next` → `UpNextPage` added to `src/client/router.ts`; an "Up Next" `RouterLink` in `App.vue:28-45`; and an explicit `up-next` branch in the `activeSection` computed (`App.vue:11-18`) **before** the `'board'` fallback (without it, `/up-next` would highlight Board). `tests/component/app-shell.test.ts` route list and per-section assertions extend accordingly.

## D14 — Acceptance-run environment (browser evidence)

**Decision**: The browser-tester runs against the feature dev server (branch 029 → API 3029, UI 5129) started with `LANES_CONFIG_PATH` pointing at a scenario lane config (object form: lanes Up Next / In Progress / Waiting / Done, `dashboardDefaultLanes: ["Up Next", "In Progress"]`, `quickDoneLane: "Done"`) and `DATABASE_PATH` pointing at a scratch DB file, then seeds the spec's board via the existing HTTP API (tasks, placements, tags, notes, people/company links). The committed `config/lanes.json` is left in legacy array form — it proves the backward-compat path in everyday dev and deploy tests. Story 5's MCP-move criterion gets two-part evidence: an integration test drives the real MCP `move-task` tool (stub identity provider pattern, `tests/integration/mcp-move-tools.test.ts`) and asserts the dashboard payload reflects the move, while the browser evidence shows the untouched open page updating within 90s after a server-side move. Full setup in quickstart.md.
