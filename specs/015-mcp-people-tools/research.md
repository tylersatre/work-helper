# Research: MCP People Tools

**Feature**: 015-mcp-people-tools | **Date**: 2026-08-11

The Technical Context carried no NEEDS CLARIFICATION markers — every open question was a design decision resolvable by reading the shipped codebase (services, schema, existing MCP tools, auth transport, and test harness). Findings and decisions below; each records what the spec left to planning (spec "Assumptions" section) or what the codebase forced.

## D1. Tool surface and naming

**Decision**: Six new tools, keeping the registry's verb-noun kebab-case convention: `create-person`, `update-person`, `add-contact-entry`, `mark-contact-primary`, `remove-contact-entry`, `list-unlinked-addresses`. `get-person` is expanded in place (D9); `search-people` is untouched. No `edit-entry`-style tool exists, satisfying FR-013 by omission.

**Rationale**: The spec's working names (`create-person`, `unlinked-addresses`, "the edit tool") were explicitly non-final. `update-person` mirrors the `updatePerson` service and is symmetric with `create-person`. The three contact tools take a `type: 'email' | 'phone'` parameter instead of shipping per-type pairs, mirroring how `src/server/services/contact-entries.ts` and the REST routes are already generic over the entry table — "contact entry" is the codebase's own vocabulary (`ContactEntry`, `contact-entries.ts`, `ContactEntryList.vue`). `list-unlinked-addresses` follows the existing `list-board` / `list-conversations` naming.

**Alternatives considered**: Per-type tool pairs (`add-person-email`, `add-person-phone`, `mark-email-primary`, …) — rejected: eight write tools instead of three bloats every agent's tool context for zero disambiguation gain, since the `type` enum is self-describing. A single `manage-person` mega-tool with an `action` parameter — rejected: weak input schemas (everything optional), poor discoverability, no precedent in the registry.

## D2. How mark-primary and remove identify an entry

**Decision**: By `entryId`, exactly as the UI's REST API does (`PUT /api/people/:personId/emails/:entryId/primary`). The expanded `get-person` output and every contact-mutation response carry `id` per entry, so an agent always has ids in hand.

**Rationale**: Mirrors the UI contract precisely (FR-020's parity boundary), reuses `markPrimary`/`removeEntry` untouched, and avoids re-implementing value normalization (case-insensitive email match, exact phone match) in a second lookup path.

**Alternatives considered**: Value-based addressing (`remove-contact-entry` with `value: "jordan@x.com"`) — rejected: friendlier for a single call but duplicates the services' matching rules at the tool layer, and the get-then-act flow is the normal agent pattern anyway (the agent needs `get-person` to see current state before mutating).

## D3. Identifying the holding person on duplicate values (FR-006)

**Decision**: Enrich the services' conflict results with the holder: `createPerson` returns `{ ok: false, error: 'email-conflict' | 'phone-conflict', holder: { id, name } }` and `addEntry` returns `{ ok: false, error: 'conflict', holder: { id, name } }`. The MCP tool layer formats the message: `That email is already in use by Sam Rivera` / `That phone number is already in use by Ana Alvarez`. REST routes in `src/server/routes/people.ts` keep their existing messages ("That email is already in use") and simply ignore the new field — zero UI change.

**Rationale**: The conflict lookups (`findEmailAddressByValue`, `phoneConflictExists`, `conflictExists`) already touch the row that holds the value; extending them to also return `personId` and join the name is one query's worth of change at the place that owns the truth. Doing it in the service keeps the answer consistent for both conflict paths (create and add) and makes it testable at the service seam.

**Alternatives considered**: Tool-layer re-query after a `conflict` result — rejected: duplicates the matching rules (email case-insensitivity vs phone exactness) in a second place and can race a concurrent change between the two queries; service-side is strictly simpler.

## D4. Rejecting unknown extra fields (FR-005) without touching UI semantics

**Decision**: Validate extra-field names at the MCP tool layer, before calling any service: any key of `extraFields` not present in `context.personFields` fails the call with a validation error naming every offending field (e.g. `Unknown field "Favorite Color"`). The services' `normalizeExtraFields` (which silently drops unknown keys — correct for the UI, whose form can only submit configured fields) stays exactly as is.

**Rationale**: The spec requires rejection on the agent surface but forbids UI behavior change; a tool-layer guard achieves both without a service flag. The check is a set-membership test against `context.personFields`, which `McpToolsContext` already carries.

**Alternatives considered**: A `strictExtraFields` option on `createPerson`/`updatePerson` — rejected: threads a mode flag through code the UI shares for a check that needs nothing from the database; the tool layer is the natural owner of tool-surface strictness.

## D5. update-person semantics: partial update

**Decision**: `update-person` takes `personId` plus optional `firstName`, `lastName`, `extraFields`. Provided names replace current ones and must be non-blank — an explicit `""` or whitespace-only name fails with `First and last name are required` (US4-AS2). Omitted names keep their current values. `extraFields` merges over the person's current extra fields: provided keys are set, an empty-string value clears that field, omitted keys are untouched. The tool loads the current person, merges, and calls the unchanged `updatePerson` service (whose `normalizeExtraFields` drops empty values, which is exactly the clear semantics). A call providing nothing is a valid no-op returning the current person.

**Rationale**: An agent correcting one field shouldn't have to echo the person's full state (and risk clobbering fields it didn't fetch). Partial update grants no power the UI lacks — any partial update equals some full-form submit — so FR-020 holds.

**Alternatives considered**: Full-replace mirroring `PUT /api/people/:id` — rejected: forces read-modify-write onto every agent call and makes accidental field-clearing the default failure mode; the merge is trivial at the tool layer with the service untouched.

## D6. Blank-but-present contact values on create are errors, not omissions

**Decision**: `create-person`'s `email` and `phone` inputs are optional, but when present must be non-empty after trimming, failing with `A value is required` (spec edge case). This is stricter than the UI's `createPersonInputSchema`, whose `optionalTrimmedText` folds `""` to `null` (correct for a form whose empty inputs mean "not provided"). The MCP input schema therefore uses its own `z.string().trim().min(1, 'A value is required').optional()` shape at the tool layer; `add-contact-entry` reuses the existing `entryValueSchema` message via the service's ZodError.

**Rationale**: For an agent, an explicitly supplied blank value is a bug in the agent's call, and the spec mandates rejection; silently ignoring it would mask agent errors. The divergence lives only in the tool-layer input schema — the shared service schema is unchanged, so the UI keeps folding empties.

**Alternatives considered**: Reusing `createPersonInputSchema` verbatim — rejected: it cannot distinguish "omitted" from "blank", which the spec's edge case explicitly requires.

## D7. The unlinked-addresses query

**Decision**: New `listUnlinkedAddresses(db)` in `src/server/services/email/queries.ts`: one SQL aggregate over `email_addresses` rows with `person_id IS NULL`, joined through `email_participants` to `email_messages`, returning per address — `address` (stored casing), `messageCount` (`COUNT(DISTINCT message_id)` across all roles, per FR-015), `lastMessageAt` (`MAX(sent_at)`, epoch ms), and `displayName` (the display name of the most recent participant row that carries one, via the `ORDER BY (display_name = '') ASC, sent_at DESC` pick-first pattern already used in `participantsForConversation`; the bare address when every row's name is empty). Ordering: `messageCount DESC`, then `lastMessageAt DESC`, then `address ASC` for determinism. Addresses with zero participant rows (theoretically absent — unlinked rows only persist because mail references them) are naturally excluded by the inner join.

**Rationale**: `sent_at` is the recency axis everywhere else (`latestMessageAt` in `listConversations`, cursor ordering in `emailsForPerson`), and epoch-ms numbers are how every existing tool returns dates. The display-name pick matches the spec's "most recently seen" wording exactly. The query is served by the existing `email_participants_address_id` index.

**Alternatives considered**: `received_at` for recency — rejected for consistency with every shipped surface. Computing in JS from row-level fetches — rejected: one aggregate beats N+1 over the largest table in the schema.

## D8. No pagination on list-unlinked-addresses

**Decision**: The tool takes no arguments and returns the complete list (the spec left limit/pagination to planning).

**Rationale**: The list is the sweep's worklist — SC-003 requires an agent to drain it entirely, so completeness is the point. Cardinality is bounded by distinct correspondent addresses (hundreds to low thousands for a personal mailbox), and each row is four small fields. Keyset paging over a count-descending ordering is also inherently unstable: counts and link-state change between pages as the agent works, which is exactly when pages tear.

**Alternatives considered**: Keyset pagination like `list-conversations` — rejected per above; can be added compatibly later if a real mailbox proves too large, without breaking the no-args call.

## D9. get-person expansion (US5) stays backward compatible

**Decision**: `get-person` keeps its existing scalar `email` / `phone` (primary values, possibly null) and adds `emails` and `phones` arrays of `{ id, value, isPrimary }`. `create-person` and `update-person` return this same person shape. `search-people` result rows are untouched (FR-019). Contact-mutation tools return `{ personId, type, entries }` mirroring the service's `EntryMutationResult`.

**Rationale**: Existing consumers (and `mcp-read-tools.test.ts` assertions) rely on the scalars; the arrays are additive. Entry `id`s in every read/mutation response are what makes D2's id-based addressing workable in one round trip.

**Alternatives considered**: Replacing scalars with arrays only — rejected: a breaking change to a shipped tool for no spec requirement.

## D10. Authorization: nothing new to build (FR-001)

**Decision**: No auth code changes. All tools — new ones included — sit behind the shipped mcp-authentik-auth bearer verification in `src/server/mcp/routes.ts`, which rejects unauthenticated `POST /mcp` with 401 before any tool dispatch or DB read. The new test files assert once that a tokenless call cannot reach the new tools, as recorded evidence for the spec's auth edge case; `mcp-connect` / `mcp-forged-identity` / `mcp-revocation` suites continue to cover the flow itself.

**Rationale**: The transport-level gate is per-request and precedes `createMcpServer`, so every registered tool inherits it by construction — matching the spec's assumption that this feature adds no new auth scheme.

## D11. No schema change, no migration

**Decision**: The feature ships with zero DDL. Person creation/editing, contact entries, linking, and discovery all operate on existing tables; the DB already enforces the invariants the spec leans on (`email_addresses_value_unique` on `lower(value)` product-wide, `person_phones_value_unique` exact, partial one-primary-per-person indexes on both entry tables).

**Rationale**: Verified against `src/server/db/schema.ts` — every field the tools need exists. This trivially satisfies the constitution's production-data rules.

## D12. Test strategy

**Decision**: TDD at two seams. (a) Service seam: failing tests first in `tests/integration/people.test.ts` / `contact-entries.test.ts` for conflict-holder enrichment. (b) MCP seam: new `mcp-people-write-tools.test.ts` (US1 create incl. linking + validation, US3 contact management, US4 edit) and `mcp-unlinked-addresses.test.ts` (US2 content/ordering/reactivity), plus US5 assertions in `mcp-read-tools.test.ts` — all driving the real MCP client over StreamableHTTP with the OAuth stub, seeding synced mail the way `email-person-linking.test.ts` does. UI-visible confirmations (People page listing, person record after reload, conversation detail showing the link) are browser-tester evidence against the dev server, filed under `docs/evidence/mcp-people-tools/`.

**Rationale**: Matches the constitution's evidence rule surface-by-surface: MCP-only criteria → recorded automated output; UI-surface criteria → browser evidence; verifier re-runs both.
