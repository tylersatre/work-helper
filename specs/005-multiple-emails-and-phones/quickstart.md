# Quickstart: Multiple Emails and Phones per Person

Validation/run guide for the feature. Shapes and rules live in [data-model.md](data-model.md) and [contracts/](contracts/); decisions in [research.md](research.md).

## Prerequisites

- Node ≥ 22, `npm install` done.
- Branch `005-multiple-emails-and-phones`.

## Run it

```bash
npm run dev          # server on :3000 (tsx watch) + Vite client
```

Migration 0004 runs automatically at boot (creates `person_emails`/`person_phones`, carries over any existing single email/phone as primary entries, drops the old columns).

## Automated checks (the verification gate runs all of these)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Test surfaces → what they prove

| Surface | Proves |
|---|---|
| `tests/unit/validation.test.ts` | Entry values are trimmed; blank/whitespace rejected ("A value is required"); update-person schema strips email/phone (FR-009, FR-015) |
| `tests/integration/contact-entries.test.ts` | Add/edit/mark-primary/remove for both types via the routes: first entry becomes primary, edit keeps flag, no-op re-mark, lowest-id promotion on primary removal, empty-list validity, 400/404/409 cases with exact messages, lists unchanged after rejection (US1–US3, FR-001–FR-009, SC-003, SC-004) |
| `tests/integration/people.test.ts` | Create person stores provided email/phone as primary entries; duplicate phone now rejected at create with no person row; update ignores contact fields; person payloads carry ordered arrays; person delete cascades entries (FR-011, FR-013 via re-read) |
| `tests/integration/migration-carry-over.test.ts` | Replays migrations 0000–0003 raw, seeds legacy people (values, NULLs, mixed case), applies 0004: every value reappears as exactly one primary entry, nothing lost or altered (FR-014, SC-002 — stands in for production data per the 2026-08-07 clarification) |
| `tests/integration/people-search.test.ts` | Search still matches name + primary email, and only the primary (D6) |
| `tests/integration/mcp-read-tools.test.ts` | `get-person`/`search-people`/`get-task` return primary values, null when none, promoted survivor after removal ([contracts/mcp-tools.md](contracts/mcp-tools.md) assertions, FR-012) |
| `tests/component/contact-entry-list.test.ts` | List renders values + primary marker, add/edit/mark/remove wired to the endpoints, validation message shown on failure |
| `tests/component/person-form.test.ts` | Create mode keeps single email/phone inputs; edit mode renders neither (FR-011, FR-015) |
| `tests/component/people-page.test.ts` | Rows show primary email/phone, empty cells when a person has none (FR-010) |

## Browser evidence (browser-tester agent)

Against `npm run dev`, one evidence run per user story into `docs/evidence/multiple-emails-and-phones/`:

1. **US1 (emails, P1)**: create Sam Rivera with email+phone → record shows both as primary; add second email; edit it; mark it primary (people list follows); remove primary (survivor promoted); remove last (empty cell) — reload after each step (SC-001).
2. **US2 (phones, P2)**: add second phone, mark primary, remove both — people-list row tracks primary, empty at the end, reload-checked.
3. **US3 (validation, P3)**: duplicate email in different case, another person's email, another person's phone, whitespace-only value — each rejected with its exact message, lists unchanged.

## Verifier

The `verifier` agent independently re-runs the gate commands and cross-checks every acceptance scenario against test output + browser evidence before the feature is reported done.

## Expected outcomes

- All four gate commands pass.
- Every FR-001–FR-015 maps to at least one passing automated check above.
- Evidence files exist for all three user stories, including post-reload states.
