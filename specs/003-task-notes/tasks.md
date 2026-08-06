# Tasks: Task Notes

**Input**: Design documents from `/specs/003-task-notes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: INCLUDED and NON-NEGOTIABLE — constitution principle II mandates TDD. Every implementation task is preceded by test tasks — per-story within each user-story phase, and a foundational schema test (T002) for Phase 2; each test task must be run and observed to FAIL (red) before its implementation tasks begin. Code written before its failing test is discarded, not retrofitted.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story is independently implementable, testable, and shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US5); Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path(s)

## Path Conventions

Single npm package web app per plan.md: server in `src/server/`, Vue client in `src/client/`, shared types/validation in `src/shared/`, migrations in `drizzle/`, tests in `tests/{unit,integration,component}/`.

---

## Phase 1: Setup

**Purpose**: Bring in the feature's only new dependency.

- [X] T001 Install markdown-it 14 as a runtime dependency (`npm install markdown-it@14`), updating package.json and package-lock.json — it ships its own TypeScript types, so no @types package is needed (research R1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, and shared types that every user story depends on — test-first like everything else (constitution II).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Extend tests/integration/db.test.ts with a failing-first schema test for `task_notes`, following the file's existing raw-SQL idiom (`sqlite.prepare` against `sqlite_master` / raw inserts via the `sqlite` handle, no imports of not-yet-written schema exports): the `task_notes` table exists with columns id, task_id, text, source, created_at; inserting a note row referencing a missing task throws (FK enforced); deleting a task removes its notes (ON DELETE CASCADE). Run it and observe it FAIL (red) before T003 begins (constitution II, data-model.md)
- [X] T003 [P] Add the `taskNotes` table to src/server/db/schema.ts: `id` integer primary key autoincrement, `task_id` integer NOT NULL referencing `tasks.id` ON DELETE CASCADE, `text` text NOT NULL, `source` text NOT NULL as Drizzle enum `['ui', 'mcp']`, `created_at` integer NOT NULL (epoch ms UTC instant) — matching the column idioms of the existing `tasks`/`people` tables (data-model.md, research R3; depends on T002 observed red)
- [X] T004 Generate the migration with `npx drizzle-kit generate` producing drizzle/0002_*.sql, and confirm it applies cleanly through the existing startup path (`createDb(':memory:')` boots without error; `PRAGMA foreign_keys = ON` is already set by feature 002) — T002's schema test now passes (green)
- [X] T005 [P] Extend src/shared/types.ts with `type NoteSource = 'ui' | 'mcp'`, `interface Note { id: number; taskId: number; text: string; source: NoteSource; createdAt: number }`, and add `notes: Note[]` to `TaskDetail` (data-model.md API shapes)

**Checkpoint**: T002's schema test is green, `task_notes` exists in the schema with a working migration, and shared types compile — user story phases can begin.

---

## Phase 3: User Story 1 - Add and revisit notes on an existing task (Priority: P1) 🎯 MVP

**Goal**: A persistent, timestamped note history on the task detail view — add a note, see the list newest-first with a "You" label and relative timestamp (absolute local time on hover), get a validation message on empty input, and find every note still there after a reload.

**Independent Test**: Open any existing task's detail view, add a note, reload the page, and confirm the note is still listed with its label and timestamp.

### Tests for User Story 1 (write first — must FAIL before T011) ⚠️

- [X] T006 [P] [US1] Extend tests/unit/validation.test.ts with note-text schema cases: accepts text whose trimmed length is > 0 while leaving the value byte-for-byte untransformed (leading indentation and internal newlines preserved); rejects empty string and whitespace-only inputs covering spaces, tabs, and newlines (research R4, FR-010)
- [X] T007 [P] [US1] Create tests/unit/time.test.ts: `relativeTime` buckets — under 60 s → "just now", under 60 min → "N minute(s) ago", under 24 h → "N hour(s) ago", otherwise "N day(s) ago" with a 48-hour-old instant reading exactly "2 days ago" — including boundary values at 60 s, 60 min, and 24 h; `absoluteLocal` formats 2026-08-04T18:00:00Z with timeZone 'America/Denver' as "Aug 4, 2026, 12:00 PM" (en-US, dateStyle medium + timeStyle short) proving timezone conversion — timestamp-string assertions compare after normalizing U+202F (the narrow no-break space some ICU builds emit before AM/PM) to a regular space, so the pinned literal holds across ICU versions (research R2, US1-3)
- [X] T008 [P] [US1] Create tests/integration/task-notes.test.ts (`app.inject()` against `createDb(':memory:')`, existing idiom) covering contract obligations 1–5: add→read round-trip (POST /api/tasks/:id/notes → 201 with `source: "ui"` and server-assigned id/createdAt, note then present in GET /api/tasks/:id); newest-first ordering with distinct timestamps and the higher-id-first tiebreak for identical `createdAt`; raw-text preservation (leading indentation + internal newlines round-trip untrimmed); 400 `{"error":{"message":"Note text is required"}}` for empty and whitespace-only text with nothing persisted; 404 `{"error":{"message":"Task not found"}}` when adding to an unknown task (contracts/http-api.md)
- [X] T009 [P] [US1] Extend tests/component/task-detail.test.ts: the detail page renders a notes section — populated list for a task with notes, and the empty state (no entries, add-note input still present) for a task with none (FR-003)
- [X] T010 [P] [US1] Create tests/component/task-notes.test.ts with the US1 cases: notes render newest first; each note shows the "You" label and a relative timestamp inside a `<time>` element whose `datetime` holds the ISO instant and whose `title` holds the absolute local time (title comparisons normalize U+202F to a regular space, per T007); submitting the add form sends POST /api/tasks/:id/notes and prepends the returned note; empty/whitespace submit shows "Note text is required" and sends no request (FR-004, FR-005, FR-006, FR-010)

### Implementation for User Story 1

- [X] T011 [P] [US1] Add the note-text schema to src/shared/validation.ts: valid if and only if `text.trim().length > 0`, and the value is never transformed — the untrimmed original is what flows onward (research R4)
- [X] T012 [US1] Extend src/server/services/tasks.ts: `addNote(taskId, text)` inserting with `source: 'ui'` and `created_at: Date.now()`, distinguishing a missing task; extend `getTaskDetail` to return the task's notes ordered `created_at DESC, id DESC` in SQL so the API order is authoritative (research R3, R6; depends on T011)
- [X] T013 [US1] Extend src/server/routes/tasks.ts: add POST /api/tasks/:id/notes → 201 with the created `Note`, 400 `"Note text is required"` on trim-empty text, 404 `"Task not found"` on unknown task; GET /api/tasks/:id now always carries `notes` (`[]` when none) — error envelope `{ error: { message } }` unchanged (contracts/http-api.md; depends on T012)
- [X] T014 [P] [US1] Create src/client/utils/time.ts with the two pure functions: `relativeTime(thenMs, nowMs)` implementing the four buckets, and `absoluteLocal(thenMs, timeZone?)` via `Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone })` with `timeZone` defaulting to the browser's (research R2)
- [X] T015 [US1] Create src/client/components/NoteItem.vue rendering one note: "You" source label, `<time :datetime="iso" :title="absoluteLocal(note.createdAt)">{{ relativeTime(note.createdAt, now) }}</time>`, and the note text (plain text in this story — markdown rendering arrives in US4); no edit affordance of any kind (FR-012; depends on T014)
- [X] T016 [US1] Create src/client/components/TaskNotes.vue: newest-first list of NoteItem (server order, never re-sorted), add-note form with multiline input that POSTs to /api/tasks/:id/notes and prepends the returned note, visible "Note text is required" message on trim-empty submit with no request sent, and a reactive `now` refreshed every 30 s so relative labels roll over without a reload (research R2; depends on T015)
- [X] T017 [US1] Render the TaskNotes section on src/client/pages/TaskDetailPage.vue, fed by the detail response's `notes`, mirroring the existing LinkedPeople section pattern (depends on T016)

**Checkpoint**: User Story 1 is fully functional on its own — add a note in the browser, reload, and it persists with label and timestamp. This is the MVP.

---

## Phase 4: User Story 2 - Capture the first note while creating a task (Priority: P2)

**Goal**: The kanban create form gains an optional multiline note field; a filled note becomes the task's first note atomically, a blank one means a normal zero-note task.

**Independent Test**: Create one task with the note field filled and one with it blank, then open each detail view — the first shows exactly one note, the second an empty notes section with the add-note input.

### Tests for User Story 2 (write first — must FAIL before T020) ⚠️

- [X] T018 [P] [US2] Extend tests/integration/tasks.test.ts with contract obligations 6–7: POST /api/tasks with a note → the task's detail shows exactly one note with the matching raw text, `source: "ui"`, and `createdAt` equal to the task's own `createdAt`; without a note (absent, null, and blank-after-trim variants) → task created normally with `notes: []`; a blank title with a note persists nothing — no task and no note (US2-1, US2-2, FR-002, research R5)
- [X] T019 [P] [US2] Extend tests/component/create-task-form.test.ts: the form shows an optional multiline note field; submitting with it filled includes `note` in the request body; submitting with it blank or whitespace-only omits `note` from the request entirely (FR-001, FR-002)

### Implementation for User Story 2

- [X] T020 [US2] Extend `createTask` in src/server/services/tasks.ts with an optional note parameter: when the trimmed note is non-blank, insert the task row and its first note row inside one `db.transaction` with `source: 'ui'` and the note's `created_at` equal to the task's own `createdAt` instant; blank or absent → task only (research R5)
- [X] T021 [US2] Extend the POST /api/tasks body handling in src/server/routes/tasks.ts to accept optional `note` (absent / null / blank-after-trim all take the zero-notes success path, never a validation error); the 201 response stays the created `Task`, byte-compatible for callers that send no note (contracts/http-api.md; depends on T020)
- [X] T022 [P] [US2] Add the optional multiline note field to src/client/components/CreateTaskForm.vue, including `note` in the request only when its trimmed value is non-empty and clearing the field after a successful create (FR-001)

**Checkpoint**: User Stories 1 and 2 both work — a task can start life with its first note, and the kanban card face is untouched.

---

## Phase 5: User Story 3 - Delete a note, with a safety net (Priority: P3)

**Goal**: Any note can be permanently deleted, but only through a confirmation prompt; cancelling leaves everything untouched, and no edit path exists anywhere.

**Independent Test**: On a task with two notes, delete one (confirming) and start-then-cancel a delete on the other, then reload to verify the first stayed gone and the second stayed present.

### Tests for User Story 3 (write first — must FAIL before T025) ⚠️

- [X] T023 [P] [US3] Extend tests/integration/task-notes.test.ts with contract obligations 8, 9, and 11: DELETE /api/tasks/:id/notes/:noteId → 204 with no body, removing only the targeted note (sibling note verified intact via GET); 404 `"Task not found"` for an unknown task and 404 `"Note not found"` for an unknown note id or a note belonging to a different task; injected PUT and PATCH requests to the note path get Fastify's route-not-found response, proving no edit surface exists (FR-011, FR-012, research R6)
- [X] T024 [P] [US3] Extend tests/component/task-notes.test.ts: each note shows a delete control; with `vi.spyOn(window, 'confirm')` returning true the DELETE request fires and the note leaves the list; returning false → no request and the note stays; other notes are untouched in both branches; deleting the only note returns the section to the empty state with the add-note input still present (US3-1, US3-2, FR-011, edge case)

### Implementation for User Story 3

- [X] T025 [US3] Add `deleteNote(taskId, noteId)` to src/server/services/tasks.ts, distinguishing task-missing from note-missing-or-wrong-task so the route can return the right 404 message (research R6)
- [X] T026 [US3] Add DELETE /api/tasks/:id/notes/:noteId to src/server/routes/tasks.ts → 204 no body on success, 404 `"Task not found"` / `"Note not found"` per the contract; deliberately add no PUT/PATCH route anywhere (FR-012; depends on T025)
- [X] T027 [P] [US3] Add the delete control to src/client/components/NoteItem.vue guarded by `window.confirm('Delete this note?')` — the DELETE request fires only on true — and have src/client/components/TaskNotes.vue remove the note from the list only after a 204 (research R7)

**Checkpoint**: Notes can be deleted behind a confirmation, cancel is a true no-op, and immutability is enforced by the absence of any edit route or affordance.

---

## Phase 6: User Story 4 - Notes render basic markdown (Priority: P4)

**Goal**: Note text renders exactly the basic markdown set — bold, italic, links, bulleted and numbered lists, inline code, code blocks, headings — with raw HTML/script inert and out-of-scope or malformed constructs degrading to plain text.

**Independent Test**: Add one note containing the basic markdown constructs and confirm each renders as formatting, not raw characters.

### Tests for User Story 4 (write first — must FAIL before T030) ⚠️

- [X] T028 [P] [US4] Create tests/unit/markdown.test.ts: each supported construct renders to HTML (bold, italic, `[text](https://…)` links, bulleted and numbered lists, inline code, fenced code blocks, headings); raw HTML like `<script>alert(1)</script>` and `<img onerror=…>` emerges as escaped inert text; `javascript:`/`vbscript:` link URLs and non-image `data:` URLs (e.g. `data:text/html,…`) are refused by validateLink and degrade to text — note markdown-it's default validateLink permits `data:image/(gif|png|jpeg|webp)` URLs, which is acceptable since the image rule is disabled; out-of-scope constructs (images, tables, strikethrough, blockquotes, autolinks) stay literal text; a stray unclosed `**` renders as ordinary text (FR-008, FR-009, research R1, edge cases)
- [X] T029 [P] [US4] Extend tests/component/task-notes.test.ts: the spec's US4 note renders bold "Urgent:", italic "Sam", "pricing" as a hyperlink to https://example.com/pricing, `deck.pdf` as inline code, and a two-item bulleted list with zero raw markdown characters visible; a note containing script/HTML text lands in the DOM as text and executes nothing (US4-1, SC-005, FR-009)

### Implementation for User Story 4

- [X] T030 [US4] Create src/client/utils/markdown.ts: markdown-it 14 from the `'zero'` preset with `html: false`, enabling exactly the rules `heading`, `lheading`, `list`, `emphasis`, `link`, `backticks`, `code`, `fence`, `escape`, `newline`, keeping the default `validateLink`; export a pure `renderNoteMarkdown(text: string): string` (research R1)
- [X] T031 [US4] Switch note text rendering in src/client/components/NoteItem.vue from plain text to `v-html` of `renderNoteMarkdown(note.text)` on a container div (depends on T030)

**Checkpoint**: Markdown notes render formatted and safe; everything outside the basic set stays inert text.

---

## Phase 7: User Story 5 - Every note shows where it came from (Priority: P5)

**Goal**: Provenance is displayed on every note — "You" for source `'ui'`, "via MCP" for source `'mcp'` — with mcp notes (test-seeded only in this slice) behaving identically, including deletion.

**Independent Test**: Seed a note with source "mcp" alongside a UI-added note and confirm the two distinct labels appear, each with its timestamp.

### Tests for User Story 5 (write first — must FAIL before T034) ⚠️

- [X] T032 [P] [US5] Extend tests/integration/task-notes.test.ts with contract obligation 10: a note inserted directly into the DB with `source: 'mcp'` is returned by GET /api/tasks/:id and deletable via DELETE exactly like a `'ui'` note; also assert no API write path accepts a client-supplied source — a POST body smuggling `"source": "mcp"` still stores `'ui'` (FR-007, FR-011, research R8)
- [X] T033 [P] [US5] Extend tests/component/task-notes.test.ts: a source `'mcp'` note is labeled "via MCP" and a source `'ui'` note "You", each alongside its timestamp; the confirm-guarded delete flow works identically on the `'mcp'` note (US5-1, FR-007)

### Implementation for User Story 5

- [X] T034 [US5] Make the source→label mapping in src/client/components/NoteItem.vue the single mapping point — `'ui'` → "You", `'mcp'` → "via MCP" — so label copy is a one-line presentation change (research R8)

**Checkpoint**: All five user stories are independently functional; provenance is visible and uniform.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Regression guarantees, gates, and the constitution's evidence requirements.

- [X] T035 [P] Confirm FR-013/SC-006: the feature diff touches no kanban card components, and the existing tests/component/task-card.test.ts and tests/component/board.test.ts still pass unchanged
- [X] T036 Run every automated gate from quickstart.md and fix anything red: `npm run lint && npm run typecheck && npm test && npm run build`
- [X] T037 Execute the quickstart.md API smoke sequence with curl against the dev server (`npm run dev`), including the sqlite3 MCP-note seed, confirming every expected status and body
- [X] T038 Dispatch the browser-tester agent through quickstart.md browser scenarios 1–5 plus the folded-in edge checks (XSS inertness, malformed markdown, only-note deletion, untruncated long note, unchanged board, no edit affordance), with the Playwright context timezone pinned and the SC-001 add-note flow timed per quickstart, saving screenshot + results evidence to docs/evidence/task-notes/
- [X] T039 Dispatch the verifier agent to independently re-check every row of the quickstart.md acceptance-mapping table — passing automated check plus browser evidence per criterion — before the feature is reported done (constitution III; depends on T036–T038)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (the migration in T004 needs the repo installable); within the phase T002 (schema test, observed red) → T003 (schema) → T004 (migration), with T005 (types) runnable in parallel once T002 is red — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational completion; priority order is US1 → US2 → US3 → US4 → US5
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Only Foundational — no other story. Delivers the MVP.
- **US2 (P2)**: Foundational only for the server side; its detail-view verification reads the UI built in US1, so run after US1
- **US3 (P3)**: Builds on US1's NoteItem/TaskNotes components and integration test file — run after US1
- **US4 (P4)**: Swaps rendering inside US1's NoteItem — run after US1 (independent of US2/US3)
- **US5 (P5)**: Touches US1's NoteItem label and US3's delete flow assertion — run last

### Within Each User Story

- Test tasks first, observed failing, then implementation (constitution II)
- Shared validation before service, service before route (e.g. T011 → T012 → T013; T020 → T021; T025 → T026)
- Utilities before the components that consume them (T014 → T015; T030 → T031)
- Components inner-to-outer: NoteItem → TaskNotes → TaskDetailPage (T015 → T016 → T017)

### Cross-Story File Contention (if parallelizing stories)

tests/integration/task-notes.test.ts (US1/US3/US5), tests/component/task-notes.test.ts (US1/US3/US4/US5), src/server/services/tasks.ts and src/server/routes/tasks.ts (US1/US2/US3), and src/client/components/NoteItem.vue (US1/US3/US4/US5) are shared across stories — safe when stories run sequentially in priority order; coordinate or serialize if different agents take different stories.

---

## Parallel Example: User Story 1

```bash
# After Phase 2, launch all US1 test tasks together (different files):
Task T006: note-text schema cases in tests/unit/validation.test.ts
Task T007: time utility tests in tests/unit/time.test.ts
Task T008: contract obligations 1–5 in tests/integration/task-notes.test.ts
Task T009: notes section cases in tests/component/task-detail.test.ts
Task T010: US1 component cases in tests/component/task-notes.test.ts

# Then run the two independent implementation chains side by side:
Chain A (server): T011 validation → T012 service → T013 routes
Chain B (client): T014 time utils → T015 NoteItem → T016 TaskNotes → T017 TaskDetailPage
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T005) — schema test observed red first, then schema/migration/types; blocks everything
3. Phase 3: US1 tests red (T006–T010), then implementation green (T011–T017)
4. **STOP and VALIDATE**: run the gates, exercise US1's independent test in the browser
5. US1 alone is a shippable increment — the persistent note history

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate independently → MVP
3. US2 → validate (creation-time note) → US3 → validate (guarded delete) → US4 → validate (markdown) → US5 → validate (provenance)
4. Phase 8 gates + browser evidence + verifier → PR

Each story lands without breaking the previous ones; the kanban card face never changes at any point (FR-013).

---

## Notes

- [P] = different files with no dependency on an incomplete task; never mark two tasks [P] that touch the same file
- Verify each phase's tests fail before writing its implementation — red before green, per the constitution; this includes the foundational schema test T002
- Commit after each task or logical group using Conventional Commits, on branch `003-task-notes`
- No `updated_at` column, no PUT/PATCH route, no edit affordance — immutability is enforced by absence (FR-012)
- `source` is server-owned: every API write sets `'ui'`; `'mcp'` enters only via test seeding this slice (research R8)
- Timestamp-string assertions (unit, component, browser) normalize U+202F to a regular space before comparing, so the spec's pinned "Aug 4, 2026, 12:00 PM" literal holds across Node and Chromium ICU versions
- All markdown files in this repo use one logical line per paragraph — no hard wrapping
