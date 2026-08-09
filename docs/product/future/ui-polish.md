# Future: ui-polish

## One-liner

The finishing layer on top of the ui-refresh: toast notifications after actions, loading indicators/skeletons while data fetches, and a deliberate accessibility pass (keyboard focus states, ARIA review).

## Origin

- **Source:** split from `docs/product/features/ui-refresh.md`
- **Deferred because:** Tyler's acceptance bar for the refresh slice was "cohesive at a glance"; toasts and loading indicators were offered in the interview and explicitly not chosen, and the full-polish tier (focus states, hover feedback everywhere) was declined as the done-bar
- **Recorded:** 2026-08-08

## Depends on

`ui-refresh` shipped (the component library and dark theme this polish layer builds on).

## Notes

- Candidate contents, from the ui-refresh interview options Tyler passed on: toast confirmations after actions like creating a task or saving a person; spinners/skeletons while the board or people list loads; visible keyboard-focus states and hover feedback everywhere; an ARIA/accessibility audit beyond the component library's defaults.
- None of these were rejected on the merits — they were cut purely to keep the refresh slice thin. No decisions exist about toast placement/duration, skeleton vs. spinner style, or accessibility depth; all are interview questions when picked up.
- The component library chosen in ui-refresh's plan likely ships toast and skeleton components, so this slice may be mostly wiring, not new design.
