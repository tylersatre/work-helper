# Phase 0 Research: Email Sync Improvements

All Technical Context entries were resolvable from the codebase and Microsoft Graph v1.0 documentation; no NEEDS CLARIFICATION markers remain. Each decision below records what was chosen, why, and what was rejected.

## R1. Graph field mapping for FR-009 capture

**Decision**: Back each captured item with these Microsoft Graph v1.0 `message` properties, added to the list query's `$select`:

| Captured item (FR-009) | Graph property | Notes |
|---|---|---|
| Participant display names | `from`/`toRecipients`/`ccRecipients`/`bccRecipients` → `emailAddress.name` | Already-fetched recipient objects; we currently discard `.name` and keep only `.address`. Name is per message-participant, not global — stored on the participant row, not the shared address record. |
| Sent timestamp | `sentDateTime` | Already fetched. |
| Received timestamp | `receivedDateTime` | Already fetched. |
| Read state | `isRead` | Boolean. |
| Importance | `importance` | `low` \| `normal` \| `high`. |
| Flag state | `flag.flagStatus` | `notFlagged` \| `complete` \| `flagged`; stored as-is so "flagged" and "complete" are distinguishable. |
| Categories | `categories` | String array (Outlook category display names); stored as JSON. |
| Has attachments | `hasAttachments` | Boolean; drives the per-message attachment metadata fetch (R3). |
| Attachment name/type/size | `GET /me/messages/{id}/attachments?$select=name,contentType,size` | See R3. `size` is bytes; `contentType` may be null for some attachment types — stored nullable. |
| Source folder | Folder enumeration (R2), not a message property | The per-folder listing already knows which folder it is reading; `parentFolderId` never needs resolving per message. |
| Open-in-Outlook link | `webLink` | Deep link into Outlook on the web. |
| Internet message ID | `internetMessageId` | RFC 2822 id, e.g. `<...@...>`. |

**Rationale**: Every field is a first-class v1.0 property on the objects we already page through — one wider `$select` captures everything except attachment details and folder, which have their own decisions below. No beta endpoints, matching the Graph-v1.0-only constraint.

**Alternatives considered**: Deriving read/flag/category state from Exchange extended properties — rejected, first-class properties exist. Resolving folder via `parentFolderId` per message — rejected, redundant when syncing folder-by-folder.

## R2. Folder enumeration and exclusion

**Decision**: The provider gains `listFolders(): Promise<MailFolderNode[]>` returning the mailbox's folder *tree* (each node: Graph folder `id`, `displayName`, `wellKnown` classification or `null`, `children`). The Graph implementation builds it by (a) resolving the ids of the well-known folders we must classify — `inbox`, `sentitems`, `archive`, `junkemail`, `deleteditems`, `drafts` — via `GET /me/mailFolders/{well-known-name}?$select=id` (well-known-name addressing is v1.0-stable), then (b) enumerating the full tree with `GET /me/mailFolders?$top=100` plus recursive `GET /me/mailFolders/{id}/childFolders?$top=100` (paged via `@odata.nextLink`), tagging each folder whose id matched a well-known id. The **sync service** (not the provider) prunes excluded subtrees: any folder tagged `junkemail`, `deleteditems`, or `drafts` is skipped *along with all its descendants*; every other folder — Inbox, Sent Items, Archive, and all custom folders at any depth — is synced. Each message is stored with its folder's `displayName` (e.g. `Inbox`, `Sent Items`, `Archive`, `Projects`).

**Rationale**: Putting classification in the provider (it knows Graph's well-known names) but exclusion policy in the sync service keeps the policy testable against `FakeMailProvider` — the integration test seeds a Junk folder in the fake and proves *shared* code excludes it, which a fake that pre-filters could not. The id-resolution approach avoids relying on the `wellKnownName` property, which is not dependably available on v1.0 folder listings. Subtree pruning covers folders nested under Deleted Items. Hidden folders are excluded by default by Graph's listing and stay excluded.

**Alternatives considered**: (1) One mailbox-wide `GET /me/messages` query with per-message `parentFolderId` mapping — rejected: it fetches Junk/Deleted/Drafts messages only to discard them, and it forces a single timestamp field for filtering, breaking the shipped rule that Sent items filter by `sentDateTime` (R6/FR-014). (2) Provider returns only syncable folders — rejected: moves the exclusion rule into unshared fake/real code paths, making the exclusion acceptance test vacuous. (3) `$expand=childFolders` — rejected: expand depth is limited; explicit recursion is unbounded and paged.

## R3. Attachment metadata fetch

**Decision**: Keep the message list query lean (`hasAttachments` in `$select` only); for each message with `hasAttachments = true`, issue one `GET /me/messages/{id}/attachments?$select=name,contentType,size` and store the returned metadata rows. File contents are never requested (`contentBytes` is excluded by the `$select`).

**Rationale**: `$expand=attachments` on a *list* query has documented quirks (page-size limits, full `contentBytes` unless carefully nested-`$select`ed) and bloats every page; a follow-up request only for the minority of messages that actually have attachments is simpler, self-limiting, and trivially mirrored by the fake provider. Single-user scale makes the extra round trips irrelevant.

**Alternatives considered**: `$expand=attachments($select=name,contentType,size)` inline — workable but rejected for the paging/limit quirks and larger blast radius on the hot query; revisit only if per-message fetches ever become a measured problem. Note: Graph may report inline attachments (embedded images) among the results; they are stored as-is — the spec captures "what attachments it had" without an inline/regular distinction.

## R4. Single-flight coordination and run recording

**Decision**: A new `SyncCoordinator` (constructed once in `buildApp`, decorated on the Fastify instance, passed into the MCP tools context) owns an in-process `running` flag and is the *only* entry point for triggering a sync. `trigger({ startDate, endDate, source })`: (1) rejects immediately with an `already-running` error when the flag is set — recording nothing, per FR-006; (2) validates the window via the existing `computeSyncWindow` — validation failures record nothing, per FR-004; (3) otherwise runs the sync and always inserts exactly one `sync_runs` row on completion — status `success` for a clean run, `failure` (with error text and partial counts) for a missing/unreachable mailbox, a mid-run interruption, or any other error. Rows are inserted only at run completion; there is no `running` status row.

**Rationale**: The app is a single Node process (Docker, one instance), so an in-process flag is a correct and simple system-wide guarantee — the constitution's architecture gives no multi-process deployment to defend against. Recording at completion keeps `sync_runs` free of stuck `running` rows after a crash; the spec's history fields (status success/failure, counts, error) never require observing an in-flight row, and the web page learns "busy" from its own pending POST. A "mailbox not connected" trigger is recorded as a failed run (it is indistinguishable in user terms from "unreachable", which spec scenario US1-5 requires in history); rejected triggers (validation, already-running) are not runs and never recorded.

**Alternatives considered**: DB-level lock row / `running`-status row — rejected: adds crash-recovery cleanup for zero benefit in a single-process deployment. Background job with polling — rejected: spec explicitly wants busy-state-then-result, no live progress; a synchronous await of the POST is simpler and sufficient.

## R5. Timestamp columns and the existing `sentAt`

**Decision**: Redefine `email_messages.sentAt` to always hold Graph's `sentDateTime`, and add `receivedAt` holding `receivedDateTime`. Ordering (conversation chronology, cursors, latest-message) keeps using `sentAt` unchanged.

**Rationale**: Today `sentAt` is folder-dependent (received time for Inbox, sent time for Sent) — an artifact of only having one timestamp column. With both timestamps stored, one consistent meaning per column is strictly better, and `sentAt`-based ordering semantics (FR-015) are preserved — sent and received times differ by seconds, and the ordering contract ("chronological", "latest activity") never promised a specific folder-dependent field. The dev-phase data policy makes the redefinition free: schema edited in place, dev store reset, no backfill.

**Alternatives considered**: Keeping `sentAt`'s folder-dependent meaning and adding two new "true" timestamp columns — rejected: three timestamp columns, two of them redundant, purely to preserve an accident.

## R6. Per-folder window filtering field

**Decision**: The Sent Items folder (well-known `sentitems`) filters and orders its window query by `sentDateTime`; every other synced folder uses `receivedDateTime`. The provider derives this from the folder's `wellKnown` tag.

**Rationale**: FR-014 freezes the shipped date-range semantics, which used `receivedDateTime` for Inbox and `sentDateTime` for Sent. Archive and custom folders hold received mail that was moved, so `receivedDateTime` is the natural extension of the Inbox rule.

**Alternatives considered**: One uniform field for all folders — rejected as a silent semantics change to Sent Items ranges, violating FR-014.

## R7. Refresh-on-re-sync semantics

**Decision**: When `ingestMessage` finds the Graph message id already stored, it updates the metadata columns (read state, importance, flag status, categories JSON, source folder name, web link, internet message id, `sentAt`/`receivedAt`) to the fetched values, replaces the message's `email_attachments` rows wholesale, leaves `subject`, `bodyOriginal`/`bodyContentType`/`bodyText`, `conversationId`, and all `email_participants` rows untouched, and counts the message as **updated**. Every already-stored message found in the range counts as updated on every run, even if nothing changed (per the confirmed decision in the feature doc). New messages count as **new**. `SyncResult` becomes `{ status, newCount, updatedCount, error? }`.

**Rationale**: Matches FR-013 and the snapshot rule exactly. Timestamps are included in the refresh set (FR-013 refreshes "the FR-009 fields") — they are immutable upstream, so US4's "timestamps unchanged" assertion holds trivially, and including them is what lets pre-feature rows (whose `sentAt` predates R5's redefinition, and whose `receivedAt` is missing) heal on the next overlapping sync, honoring the no-separate-backfill decision. Attachment replace-not-merge keeps refresh idempotent without diffing.

**Alternatives considered**: Counting "updated" only when a value actually changed — rejected: contradicts the feature doc's confirmed decision and requires field-diffing for no user benefit. Merging attachment rows by name — rejected: replace is simpler and attachment identity by name is unreliable.

## R8. `sync-emails` MCP tool: unchanged interface, additive counts

**Decision**: The tool's input schema (`startDate`, `endDate` — explicit range required), validation messages, and date-range semantics stay byte-identical. Its execution reroutes through `SyncCoordinator` with source `mcp`, so runs land in history. Output keeps `status` (`complete` | `interrupted`), `syncedCount` (meaning: newly stored messages, exactly as today), and `error`, and gains an additive `updatedCount` field. A trigger during an active run returns a tool error ("A sync is already running") and records nothing. A mailbox-unreachable failure still returns the existing tool error *and now also* records a failed run (FR-007: every run, web- or MCP-triggered, is recorded).

**Rationale**: FR-014 freezes the required inputs and validation behavior; an additive output field breaks no MCP client (the SDK output schema is a superset) and lets agents see the refresh effect. `syncedCount` keeping its "new messages" meaning preserves the shipped contract while `updatedCount` carries the new information.

**Alternatives considered**: Renaming `syncedCount` → `newCount` in the tool output — rejected: a breaking rename for cosmetic symmetry, contrary to "interface unchanged".

## R9. Web API design

**Decision**: One new Fastify route module, `src/server/routes/email-sync.ts`:

- `GET /api/email-sync/runs` → `{ runs: SyncRunView[] }`, newest first, unpaginated (history is small at personal scale; revisit if it ever isn't).
- `POST /api/email-sync/runs` with `{ startDate, endDate }` → `201` with the recorded run row (success **or** failure status — a failed sync is a completed request that recorded a run, not an HTTP error); `400` with an inline-able message for validation rejections (missing dates, start after end — nothing recorded); `409` for already-running (nothing recorded).

The client derives the prefill from `GET runs`: start = end date of the newest `success` run, else 30 days before today; end = today (client-local, which is the same machine class as server-local in this single-user deployment).

**Rationale**: Mirrors the codebase's existing route-module + JSON error shape (`{ error: { message } }`) conventions. Returning the failed run with 201 keeps "the run happened and was recorded" distinct from "your request was rejected", which is exactly the spec's line between FR-004/FR-006 (no record) and FR-008 (recorded failure). Synchronous POST matches the busy-state-then-result UX with no polling machinery.

**Alternatives considered**: A separate `GET /api/email-sync/prefill` endpoint — rejected: the runs list already contains the answer; two sources of truth invite drift. Async trigger + status polling — rejected under the no-live-progress scope cut.

## R10. `list-conversations` gains participants alongside the indicators

**Decision**: `list-conversations` entries gain `hasUnread` (any message with `isRead = false`), `hasAttachments` (any message with stored attachment rows), **and** a `participants` array (distinct addresses across the conversation's messages, each `{ address, person: { id, name } | null }`).

**Rationale**: Spec/reality mismatch resolved in favor of the acceptance scenario: both the feature doc and spec scenario US2-2 assert the indicators appear "alongside its existing subject, **participants**, message count, and latest-message date" — but the shipped `list-conversations` has no participants field, so the scenario as written could never pass. FR-010's "additionally shows" language plus the scenario's explicit field list make the intent clear (conversation entries that include participants); adding the distinct-participant array is a small, additive query change and makes the criterion literally verifiable. Flagged for Tyler's veto and **confirmed by Tyler on 2026-08-10** during `/speckit-analyze` remediation — the participants addition is now encoded in spec.md's FR-010 and Conversation entity, so acceptance checks against the spec directly.

**Alternatives considered**: Role-tagged participants per conversation — rejected: roles are per-message, aggregating them per conversation is lossy and unasked-for; the distinct address+person list matches what a conversation-level view can truthfully say.

## R11. Client page composition

**Decision**: New route `/sync` rendering `SyncPage.vue`, linked as "Email Sync" in `App.vue`'s nav with the same `aria-current` active-section pattern as Board/People/Tags. The page uses naive-ui components already in the bundle (`NDatePicker` for the two date fields, `NButton` with `loading` for busy state, `NAlert`/inline text for validation and run errors) and a plain list for run history with a styled empty state. Dates are handled as `YYYY-MM-DD` strings at the API boundary (the picker's ms timestamps are formatted client-side, local timezone — consistent with the tool's server-local-day semantics on the same host).

**Rationale**: Matches the established Vue 3 + naive-ui component conventions (memory: Vue is a hard requirement) and the existing nav/active-section idiom in `App.vue`, so the app-shell component test extends naturally.

**Alternatives considered**: A custom date input — rejected, naive-ui's picker is already the app's idiom.

## R12. Testing strategy per layer

**Decision**: (a) **Unit** — folder-tree pruning (excluded subtrees), refresh field rules (what updates vs. stays), window math already covered stays green. (b) **Integration** — extend `FakeMailProvider` to carry a folder tree and full message metadata + attachments and to honor `listFolders`; new `email-sync-runs.test.ts` covers the two HTTP routes, run recording (both sources, success/failure/partial), single-flight rejection, and prefill data; extend `email-sync.test.ts` for capture/folders/refresh/counts; extend MCP read-tool tests for the new output fields; MCP `sync-emails` tests cover unchanged validation + new history/`updatedCount`. (c) **Component** — `sync-page.test.ts` for prefill, inline validation, busy state, result rendering, history list + empty state; `app-shell.test.ts` extended for the nav link. (d) **Browser evidence** — `browser-tester` agent runs US1's Given/When/Then against the dev server with the fake-mail seeding path used by integration tests, output to `docs/evidence/email-sync-improvements/`.

**Rationale**: Mirrors where every existing email-sync behavior is already tested, keeping TDD slices small and the verifier's evidence map one-to-one with acceptance scenarios.

**Alternatives considered**: End-to-end-only coverage — rejected: constitution demands failing-test-first at the unit the code lives in, and browser tests are evidence, not the TDD loop.
