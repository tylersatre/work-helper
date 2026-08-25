# Quickstart: Validating Up Next Dashboard

**Branch**: `029-up-next-dashboard` | Ports (from the `029-` prefix): API **3029**, UI **5129**. Contracts: [dashboard-api.md](contracts/dashboard-api.md), [lanes-config.md](contracts/lanes-config.md); shapes: [data-model.md](data-model.md).

## 1. Automated checks (primary evidence)

The full gate (also enforced by the Stop hook):

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Targeted runs while iterating:

```bash
npx vitest run tests/unit/lanes-config.test.ts tests/unit/up-next-view.test.ts
npx vitest run tests/integration/dashboard.test.ts
npx vitest run tests/component/up-next-page.test.ts tests/component/app-shell.test.ts
```

### Minimum coverage expected

**Unit — `tests/unit/lanes-config.test.ts` (extended)**:

- Legacy bare-array file still loads; normalized result carries `defaultLanes = [first]`, `quickDoneLane = last` (FR-006 fallback).
- Object form loads with designations; designation referencing an unknown lane, empty/duplicate `dashboardDefaultLanes`, and malformed JSON each throw with the config path in the message (deploy-test contract preserved).

**Unit — `tests/unit/up-next-view.test.ts` (new)**:

- Effective view: never-saved ⇒ built-in default (default lanes, no filters, limit 5, toggles tags/note/links on + lane off) (FR-005); stale lane names and tag ids silently dropped; all saved lanes stale ⇒ fall back to default lanes (FR-021).
- Selection: lane-order-then-position flat ordering (FR-002); text+tag AND combination with any-of tag match via the shared `matchesBoardFilter` (FR-010); limit truncates only after all filters (FR-003); limit larger than matches ⇒ all matches, no padding.
- Tag options: only tags attached to ≥1 card, deduped, alphabetical base-sensitivity (FR-009).

**Integration — `tests/integration/dashboard.test.ts` (new, `buildApp` + `app.inject`, in-memory DB)**:

- `GET /api/dashboard` returns configured lane order, fallback-applied `defaultLanes`/`quickDoneLane` (both with and without the `dashboardLanes` build option), `savedView: null` before any save, and cards ordered lane-then-position with archived cards absent (FR-004).
- Card enrichment: tags with colors, board-identical `searchText`, `latestNote` picked by `createdAt` desc with `id` desc tiebreak (two notes same ms), structured people/company names.
- `PUT /api/dashboard/view` roundtrip: saved view echoed by the next GET; 400 on empty `lanes`, limit 0 / negative / non-integer / >100, missing `show` key; second PUT fully replaces the first (last write wins, FR-019); a stored blob referencing deleted tags/lanes is returned verbatim (client-side tolerance, FR-021).
- Corrupt `app_state` value under `dashboard.view` ⇒ `savedView: null`, not an error.
- MCP path (Story 5 non-UI half): drive the real MCP `move-task` tool against a listening app (stub identity provider pattern from `tests/integration/mcp-move-tools.test.ts`) and assert the next `GET /api/dashboard` reflects the move (SC-004).
- Quick-done reuse (FR-014): `PUT /api/tasks/:id/placement` with `index: Number.MAX_SAFE_INTEGER` into the designated done lane lands the card at the bottom (below existing cards) — extends existing placement coverage only if the dashboard flow adds an untested angle.

**Component — `tests/component/up-next-page.test.ts` (new, jsdom + mocked `fetch`; `tests/component/app-shell.test.ts` extended)**:

- Nav: "Up Next" link present, `/up-next` marks the section active — and Board is *not* active there (FR-001, guards the `activeSection` fallback).
- Default view render from a seeded-board-shaped payload: exactly the expected 5 cards in order; card faces show title/tag chip/note snippet + relative time/people/companies, no lane name; a bare card shows title only (Story 1).
- Quick done: click fires the placement PUT with `{ lane: quickDoneLane, index: Number.MAX_SAFE_INTEGER }`, then refetches; non-ok response ⇒ inline error + refetch (FR-014, concurrent-change edge).
- Add note: submit posts to the notes route and refetches; whitespace-only shows the validation message and fires no request (FR-015).
- Display popup: four toggles reflecting current view; pending changes preview live behind the popup; dismiss-with-dirty raises the discard confirmation, discard reverts, OK saves via the view PUT (FR-008, FR-011).
- Filter popup: lanes/tags/text/limit controls; live preview grows the list when a lane is added or limit raised; OK disabled for zero lanes or invalid limit; empty result renders the styled no-match message (FR-009, FR-011, FR-013, SC-005).
- Overlay: card click (outside quick actions) renders `TaskDetail` in a modal; closing refetches and the list reflects an overlay-made lane move; no route change (FR-017).
- Poll (fake timers): a 45s tick refetches and applies list changes while an open popup's preview, a typed-but-unsent note draft, and an open overlay all survive; a failed tick leaves the last-good list with no error UI (FR-018, FR-019, FR-022).

## 2. Manual / browser evidence (`browser-tester` agent → `docs/evidence/029-up-next-dashboard/`)

### Setup

```bash
# Scenario lane config (object form) + scratch DB, then the dev server:
mkdir -p /tmp/up-next-acceptance
cat > /tmp/up-next-acceptance/lanes.json <<'EOF'
{ "lanes": ["Up Next", "In Progress", "Waiting", "Done"], "dashboardDefaultLanes": ["Up Next", "In Progress"], "quickDoneLane": "Done" }
EOF
LANES_CONFIG_PATH=/tmp/up-next-acceptance/lanes.json DATABASE_PATH=/tmp/up-next-acceptance/work-helper.db npm run dev
```

Seed the spec's board through the API at `http://localhost:3029` (order matters — creation order sets lane positions): create tags VIP + Q3, person Sam Rivera, company Acme Inc; create the 9 cards into their lanes per the spec's seeded-board table; add the two notes; link Sam Rivera + Acme Inc to "Follow up with Sam"; archive "Old duplicate". The UI is `http://localhost:5129/up-next`.

### What the browser-tester must confirm (with screenshots)

1. **Story 1**: nav link + active section; the exact default 5-card list and the absences (limit cut, non-default lanes, archived); the "Follow up with Sam" face (VIP chip color matching the tags page, note snippet + relative time, Sam Rivera, Acme Inc, no lane name) vs. "Order catering" title-only.
2. **Story 2**: quick done on "Write proposal" — no confirmation, board shows it below "Prep board deck" in Done, "Send invites" backfills, all persisting through reload; add-note on "Follow up with Sam" — snippet updates, detail view labels the note "You", whitespace-only submit rejected with a message, never leaving the page.
3. **Story 3**: display popup live preview → dismiss → discard confirmation → revert; same changes + OK persist through reload; filter popup lane+limit preview and save; the saved view appearing identically in a fresh browser profile (server-side proof, SC-003); the Q3-then-"budget" AND sequence ending in the styled no-match message.
4. **Story 4**: card click opens the full detail overlay (lane pills, notes, tags, links, archive/delete all present); "Up Next" pill move inside it; after close the dashboard shows "Order catering" 4th, "Book venue" 5th with no navigation.
5. **Story 5**: with the page untouched, move "Follow up with Sam" to Waiting server-side and capture the list updating on its own within 90 seconds (the MCP-tool half of this criterion is the integration test above).

Evidence lands as `docs/evidence/029-up-next-dashboard/results.md` (+ `pr-screenshots/`), one numbered entry per criterion with PASS/FAIL and screenshot links; the `verifier` agent independently re-runs the gate and cross-checks evidence against the spec before anything is reported done.
