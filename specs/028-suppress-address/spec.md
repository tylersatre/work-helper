# Feature Specification: Suppress Address

**Feature Branch**: `028-suppress-address`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "@docs/product/features/suppress-address.md — an agent can flag an unlinked email address as never link / ignore, so list-unlinked-addresses becomes a work queue of real contacts instead of an ever-regrowing list of no-reply senders, marketing mail, and bulk calendar attendees."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent clears noise out of the unlinked-addresses queue (Priority: P1)

Tyler asks an agent to work through `list-unlinked-addresses` and turn real contacts into people. Along the way the agent hits addresses that will never be a person — a no-reply sender, a marketing list, a bulk calendar attendee. Instead of leaving them to clutter the queue forever, the agent flags each one as suppressed, and it drops out of `list-unlinked-addresses` immediately, leaving only addresses still worth a decision.

**Why this priority**: This is the entire point of the feature — without it, `list-unlinked-addresses` keeps regrowing with addresses nobody will ever link, and the queue stops being useful as a work list.

**Independent Test**: Can be fully tested by seeding a synced store with two unlinked addresses, calling `list-unlinked-addresses` to see both, suppressing one, and calling `list-unlinked-addresses` again to confirm only the suppressed one is gone.

**Acceptance Scenarios**:

1. **Given** a synced store where news@example.com is unlinked (1 message, linked to no person) and jordan.smith@example.com is unlinked (3 messages, linked to no person), **When** an authorized agent calls `list-unlinked-addresses`, then calls suppress-address for news@example.com, then calls `list-unlinked-addresses` again, **Then** the first response includes both addresses, and the second no longer includes news@example.com while jordan.smith@example.com still appears.

---

### User Story 2 - Agent reviews and audits what's been suppressed (Priority: P2)

Tyler wants to double-check what an agent has quietly filtered out, or confirm a particular address was suppressed. The agent calls a listing tool that shows every suppressed address, most recently suppressed first, so recent activity is easy to spot.

**Why this priority**: Suppression has no UI surface in this slice, so a listing tool is the only way to see or audit what's been flagged — without it, suppression would be a black box. It matters less than the core suppress action itself (User Story 1), which delivers the primary value even before anyone audits it.

**Independent Test**: Can be fully tested by suppressing two addresses in sequence and calling list-suppressed-addresses to confirm both appear, ordered most-recently-suppressed first.

**Acceptance Scenarios**:

1. **Given** news@example.com is suppressed, **When** an authorized agent calls list-suppressed-addresses, **Then** the response includes news@example.com.
2. **Given** news@example.com is suppressed, and ads@example.com is suppressed afterward, **When** an authorized agent calls list-suppressed-addresses, **Then** ads@example.com appears before news@example.com — ordered by suppression time, most recently suppressed first.

---

### User Story 3 - Agent reverses a suppression that shouldn't have happened (Priority: P2)

An address gets suppressed by mistake, or circumstances change and it turns out to be worth linking after all. The agent unsuppresses it, and it reappears in `list-unlinked-addresses` as a normal candidate again, with no trace of having been suppressed in the listing tool.

**Why this priority**: A one-way suppression with no undo would make agents (and Tyler) overly cautious about suppressing anything, undermining User Story 1. It's still secondary to the core suppress/queue behavior because it's a correction path, not the everyday action.

**Independent Test**: Can be fully tested by suppressing an address, unsuppressing it, and confirming it reappears in `list-unlinked-addresses` and drops out of list-suppressed-addresses.

**Acceptance Scenarios**:

1. **Given** news@example.com is suppressed, **When** an authorized agent calls unsuppress-address for it, **Then** `list-unlinked-addresses` includes news@example.com again (it is still linked to no person) and list-suppressed-addresses no longer includes it.

---

### User Story 4 - Suppression respects and defers to real linking (Priority: P2)

Suppression only ever applies to addresses that aren't linked to anyone, and it never blocks or survives a real link. An agent can't suppress an address that's already a known contact, and if a suppressed address is later linked to a person, the suppression clears itself automatically — no manual unsuppress step, and no zombie flag that reactivates if the address is unlinked again down the line.

**Why this priority**: This is what makes suppression safe to use liberally — without these guardrails, suppression could silently hide a real contact's address or leave a stale flag that causes confusing behavior after the address becomes legitimate. It's a correctness/safety layer on top of the core behavior in User Story 1 rather than a standalone workflow.

**Independent Test**: Can be fully tested by attempting to suppress an address already linked to a person (expect failure), and separately by suppressing an unlinked address, linking it to a new person, unlinking it again, and confirming it comes back as a normal (non-suppressed) unlinked address.

**Acceptance Scenarios**:

1. **Given** never-seen@example.com has never appeared in any synced message, **When** an authorized agent calls suppress-address for never-seen@example.com, **Then** the call fails with a validation error, and it does not appear in list-suppressed-addresses.
2. **Given** sam.rivera@example.com is linked to person "Sam Rivera", **When** an authorized agent calls suppress-address for sam.rivera@example.com, **Then** the call fails with a validation error identifying that the address is linked to "Sam Rivera", and it does not appear in list-suppressed-addresses.
3. **Given** jordan.smith@example.com is suppressed and linked to no person, **When** an authorized agent calls create-person with email jordan.smith@example.com, linking it to a new person "Jordan Smith", **Then** the address becomes linked to "Jordan Smith" as normal, and list-suppressed-addresses no longer includes it.
4. **Given** jordan.smith@example.com was suppressed, then linked to "Jordan Smith" (per the previous scenario, clearing the flag), and is then removed from Jordan Smith's addresses so it is unlinked again, **When** an authorized agent calls `list-unlinked-addresses`, **Then** jordan.smith@example.com appears as a normal, non-suppressed unlinked address, proving the cleared flag does not reactivate.

---

### Edge Cases

- Suppressing an address that has never appeared in any synced message: rejected with a validation error; nothing is added to list-suppressed-addresses (User Story 4, scenario 1).
- Suppressing an address already linked to a person: rejected with a validation error that names the linked person; nothing is added to list-suppressed-addresses (User Story 4, scenario 2).
- Suppressing an address that is already suppressed: succeeds as a no-op, leaving its original suppression time unchanged (idempotent — see Assumptions).
- Linking a suppressed, unlinked address to a person via create-person (or any existing linking path): the link proceeds normally and the suppression flag clears as a side effect (User Story 4, scenario 3).
- An address that was suppressed, then linked (clearing the flag), then later unlinked again: reappears in `list-unlinked-addresses` as an ordinary unsuppressed entry — the cleared flag never reactivates (User Story 4, scenario 4).
- Unsuppressing an address that isn't currently suppressed: treated as a no-op / not-found condition; does not affect `list-unlinked-addresses` or list-suppressed-addresses beyond confirming the address isn't suppressed.
- Address matching for suppress/unsuppress is case-insensitive, consistent with address matching elsewhere in `mcp-people-tools`.
- Suppression has no effect on how the address appears in synced mail, conversations, or message participant data — it only affects `list-unlinked-addresses` and list-suppressed-addresses.
- Unauthenticated or unauthorized MCP calls: rejected by the existing mcp-authentik-auth flow before reaching any of these tools; no data changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The work-helper MCP MUST offer a suppress-address tool that an authorized agent can call to flag a currently-unlinked email address so it no longer appears in `list-unlinked-addresses`.
- **FR-002**: suppress-address MUST reject an address that has never appeared in any synced message with a validation error, and MUST NOT add it to the suppressed set.
- **FR-003**: suppress-address MUST reject an address that is currently linked to a person with a validation error that identifies the linked person by name, and MUST NOT add it to the suppressed set.
- **FR-004**: suppress-address called for an address that is already suppressed MUST succeed as a no-op, leaving that address's original suppression time unchanged.
- **FR-005**: The work-helper MCP MUST offer a list-suppressed-addresses tool that returns every currently-suppressed address, ordered by suppression time with the most recently suppressed first.
- **FR-006**: The work-helper MCP MUST offer an unsuppress-address tool that clears the suppression flag on an address, after which the address reappears in `list-unlinked-addresses` (if still unlinked) and no longer appears in list-suppressed-addresses.
- **FR-007**: unsuppress-address called for an address that is not currently suppressed MUST NOT error destructively — it MUST leave the system in the same state (address not suppressed) without side effects.
- **FR-008**: `list-unlinked-addresses` MUST exclude any address that is currently suppressed, in addition to its existing exclusion of linked addresses.
- **FR-009**: When a suppressed address becomes linked to a person through any existing linking path (e.g. create-person, adding an address to an existing person), the suppression flag on that address MUST clear automatically as part of the same operation — no separate unsuppress call is required.
- **FR-010**: A suppression flag that was cleared by linking (per FR-009) MUST NOT reactivate if the address is later unlinked from that person — it returns to `list-unlinked-addresses` as an ordinary unsuppressed address.
- **FR-011**: Address matching for suppress-address, unsuppress-address, and list-suppressed-addresses MUST be case-insensitive, consistent with address matching used elsewhere in `mcp-people-tools`.
- **FR-012**: Suppressing or unsuppressing an address MUST have no effect on how that address appears in synced mail, conversations, or message participant data — those surfaces are unchanged by this feature.
- **FR-013**: suppress-address, unsuppress-address, and list-suppressed-addresses MUST be available only to authorized agents — MCP clients authenticated per the existing mcp-authentik-auth flow.
- **FR-014**: A failed call to suppress-address (validation error) MUST have no partial effect — the address is not added to the suppressed set and any existing suppression state for it is unchanged.

### Key Entities

- **Suppression flag**: A marker on one email address recording that it has been deliberately excluded from `list-unlinked-addresses`; carries only the address and the time it was suppressed (no reason/note field). Applies only while the address is unlinked to any person; cleared automatically the moment the address becomes linked, and does not reactivate on a later unlink.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can remove any unlinked, previously-seen address from `list-unlinked-addresses` in a single suppress-address call, with the change visible on the very next `list-unlinked-addresses` call.
- **SC-002**: An agent can retrieve the complete set of currently-suppressed addresses in one call, correctly ordered with the most recently suppressed first, regardless of how many addresses have been suppressed.
- **SC-003**: An agent can reverse any suppression in a single unsuppress-address call, with the address reappearing in `list-unlinked-addresses` on the very next call.
- **SC-004**: 100% of attempts to suppress a never-seen or already-linked address fail with a validation error and leave list-suppressed-addresses unchanged.
- **SC-005**: 100% of addresses that become linked while suppressed have their suppression flag cleared automatically, with zero manual unsuppress calls needed, and the flag never reactivates on a subsequent unlink.
- **SC-006**: Over time, working through `list-unlinked-addresses` with suppress-address available results in the queue shrinking toward a stable set of addresses genuinely awaiting a linking decision, rather than growing indefinitely with permanent noise.

## Assumptions

- "An authorized agent" means an MCP client authenticated per the existing mcp-authentik-auth flow; no new authorization model is introduced.
- Calling suppress-address on an address that's already suppressed is idempotent — it succeeds, raises no error, and does not change the address's original suppression timestamp (confirmed default per the source feature doc's flagged assumption).
- Calling unsuppress-address on an address that isn't currently suppressed is treated as a harmless no-op rather than a hard error, matching the no-confirmation, forgiving-idempotency precedent set by other MCP write tools (e.g. attach-tag) in `mcp-note-tag-task-tools`.
- All addresses and person names used in acceptance scenarios (e.g. news@example.com, jordan.smith@example.com, "Sam Rivera") are illustrative concrete test data, not fixed product content.
- Domain-pattern suppression (suppressing an entire sender domain at once) is out of scope — this feature is per-address only.
- A reason or note field on suppression is out of scope — the flag carries no metadata beyond the address and suppression time.
- No web UI surface is introduced or changed by this feature — suppression is MCP-only; the existing per-address link control in the conversation detail view (`email-ui`) is unchanged.
- No change is made to how suppressed addresses appear in synced mail, conversations, or message participant data — suppression only affects `list-unlinked-addresses` and list-suppressed-addresses.
- Auto-suppression heuristics (automatically detecting no-reply/bulk/marketing senders) are out of scope — suppression is always a deliberate per-address MCP call, never automatic.
- Suppressing an address never blocks or restricts linking it to a person — linking is always allowed and clears the flag as a side effect, per FR-009.
- Pagination on list-suppressed-addresses is not required for this slice; the tool returns the full set. If suppressed-address volume grows large enough to warrant pagination, that is deferred future work.
- This supersedes the "no built-in suppression" decision recorded in `mcp-people-tools` (2026-08-11) — Tyler's own address is a normal suppression candidate like any other, with no special-casing.
