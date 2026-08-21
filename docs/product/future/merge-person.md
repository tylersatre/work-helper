# Future: merge-person

## One-liner

Merge two duplicate person records into one, preserving links, notes, and mail history — the safe resolution for duplicates like the two Michael Johnson records at Fairway, which are currently unresolvable.

## Origin

- **Source:** 2026-08-21 audit of the MCP tool surface, reviewed with Tyler the same day
- **Deferred because:** Tyler chose to stub the audit's recommendations for future work rather than spec immediately; merge also has enough conflict-resolution surface that it needs its own interview
- **Recorded:** 2026-08-21

## Depends on

`track-people`, `multiple-emails-and-phones`, and `mcp-people-tools` shipped (people with multiple addresses/phones, links, tags, and linked mail exist to merge).

## Notes

- delete-person stays declined, per the mcp-people-tools interview (2026-08-11: destructive power in agent hands — revisit deliberately) and reaffirmed in the 2026-08-21 review. Merge is the sanctioned primitive precisely because it preserves rather than destroys.
- Surface (UI, MCP, or both) is undecided — the audit was MCP-motivated, but merge is a work-helper data operation, so the mirror rule's default posture applies unless Tyler sanctions another exception.
- Real product surface for the interview: which record survives (or is it symmetric?); conflicting company assignments; combining email/phone lists and choosing primaries; overlapping tags and extra fields; note histories (interleave by timestamp?); linked tasks, conversations, and calendar events (presumably unioned); whether merge is undoable (probably not — which argues for a confirmation-heavy flow, and is itself a reason to consider keeping it UI-only or confirmation-gated over MCP).
