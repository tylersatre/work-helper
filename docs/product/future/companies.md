# Future: companies

## One-liner

Track companies as CRM entities — the other half of Tyler's original "people AND companies" idea for the relationship-management portion of work-helper.

## Origin

- **Source:** split from `docs/product/features/track-people.md`
- **Deferred because:** the first slice was deliberately cut down to "People + task linking only" to stay thin; companies were split out as a named follow-up, and Tyler explicitly approved the split. track-people's Out of scope records it: "Companies — a separate follow-up feature. No 'employer' field on a person in this slice."
- **Recorded:** 2026-08-06

## Depends on

`track-people` shipped (people exist and can be linked to tasks; companies were split from that slice and are expected to relate to people).

## Notes

Re-flagged by Tyler on 2026-08-07 during the `multiple-emails-and-phones` interview as part of the broader "what should be a model" effort — a priority signal, but no new decisions were made.

Nothing about companies was decided in the interview where it was deferred — the split itself is the only decision. Open questions for the future `/new-feature` interview:

- What fields does a company have? (Undiscussed. If person fields are any guide, the config-driven core-plus-extras pattern from track-people may be worth considering, but that was never proposed for companies.)
- How do people relate to companies — an "employer" field on a person, a many-to-many link, something else? track-people deliberately shipped with no employer field on a person.
- Do companies link to tasks the way people do? (Undiscussed.)
- The brief's core concepts (`docs/product/brief.md`) list people as "the central entity everything else links to" and do not mention companies — picking this up may mean deciding whether companies become a core concept and updating the brief accordingly.
