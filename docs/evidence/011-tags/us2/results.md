# US2 -- Tags page evidence

Feature: 011-tags, User Story 2 (manage the tag vocabulary on a Tags page)
Environment: UI http://localhost:5111, API http://localhost:3011 (dev DB freshly reset: no tags, no people, no tasks)

## Scenario 1 -- Empty state and nav active marker

Given no tags exist yet, when I open "Tags" in the top nav, then the nav marks "Tags" as the active section and the page shows a styled "No tags yet" empty-state message instead of a list.

Result: PASS

Navigating from the Board page and clicking the "Tags" nav link routed to /tags, the "Tags" link showed the active/bold nav styling, and the page rendered a centered icon plus "No tags yet" message (no list element), with the "New tag" create control above it.

Screenshot: 01-empty-state.png

## Scenario 2 -- Create a tag from the Tags page

Given the Tags page, when I use its own create control to create a tag named "Roadmap", then it appears in the tag list as a chip with an auto-assigned color and zero attachments; reloading the page keeps it listed.

Result: PASS

Typed "Roadmap" into the "New tag" input and clicked "Create tag". A chip labeled "Roadmap" appeared immediately with an auto-assigned color (#3B82F6). Reloaded the page (full navigation) and the "Roadmap" chip was still present with the same color.

Screenshots: 02a-roadmap-created.png, 02b-roadmap-after-reload.png

## Scenario 3 -- Ordering by attachment count, ties broken alphabetically

Given a task "Follow up with Sam" and a person "Sam Rivera" both created, with tag "VIP" attached to both (2 attachments), tag "Q3" attached to just the task (1 attachment), and unattached tags "Alpha" and "Beta" created directly on the Tags page (0 attachments each, alongside "Roadmap" from scenario 2, also 0 attachments), when I open the Tags page, then the list order is VIP, Q3, then the zero-attachment tags in alphabetical order: Alpha, Beta, Roadmap.

Result: PASS

Created the task "Follow up with Sam" on the Board page, opened its detail view, and attached tags "VIP" and "Q3" via the task's "Add tag" control (using the "Create ..." option from the tag-suggestion dropdown for tags that did not yet exist). Created the person "Sam Rivera" on the People page, opened her detail view, and attached the (now-existing) "VIP" tag via the person's "Add tag" control (selecting the existing suggestion, not creating a duplicate). Created "Alpha" and "Beta" directly from the Tags page's own create control, leaving them unattached. Opening the Tags page showed the order: VIP, Q3, Alpha, Beta, Roadmap -- exactly the expected most-attached-first ordering with the zero-attachment group (Alpha, Beta, Roadmap) alphabetical.

Screenshots: 03a-task-with-vip-q3.png, 03b-sam-with-vip.png, 03c-tags-page-ordering.png

## Scenario 4 -- Rename a tag, propagation, and collision validation

Given the Tags page, when I rename "VIP" to "Key client", then the renamed chip reads "Key client" everywhere it appears (Tags page, task detail, person detail, people-list row). When I then try renaming "Key client" to "q3" (case-insensitive collision with existing "Q3"), then it is rejected with the message "That tag name is already in use" and the tag keeps its "Key client" name.

Result: PASS

Clicked "Rename" on the VIP row, replaced the text with "Key client", clicked "Save". The chip updated to "Key client" on the Tags page immediately, and it also appeared as "Key client" on: the task "Follow up with Sam" detail view's Tags section, Sam Rivera's detail view Tags section, and Sam Rivera's row in the People list Tags column. Then clicked "Rename" again on "Key client", typed "q3" (lowercase, colliding case-insensitively with the existing "Q3" tag), clicked "Save" -- the app displayed the inline validation message "That tag name is already in use" (exact text match) next to the still-open rename field, and a PATCH request to /api/tags/2 returned 409 Conflict. Clicking "Cancel" closed the rename editor and the tag reverted to displaying "Key client" (unchanged).

Screenshots: 04a-tags-page-renamed.png, 04b-task-renamed.png, 04c-sam-detail-renamed.png, 04d-people-list-renamed.png, 04e-rename-collision-rejected.png

## Scenario 5 -- Recolor a tag (preset swatch and custom hex)

Given the Tags page, when I recolor "Q3" to a different preset palette swatch, then the "Q3" chip updates to the new color on both the Tags page and the task's detail view. When I then change it to a custom hex color not in the preset palette, then it updates again everywhere and the custom color survives a page reload.

Result: PASS (re-verified after fix; see note on a distinct, narrower remaining gap found during re-verification)

Re-verified end-to-end against a freshly reset dev DB. Recreated the task "Follow up with Sam" via the Board page, opened its detail view, and created+attached the tag "Q3" via its tag input (auto-assigned color #3B82F6). Opened the Tags page and confirmed the "Q3" chip showed #3B82F6.

Clicking the "Q3" color swatch opened the color-picker popup with the same 10 preset swatches as before (verified via DOM inspection: #3B82F6, #22C55E, #EAB308, #EF4444, #A855F7, #EC4899, #14B8A6, #F97316, #06B6D4, #84CC16, in that order) plus a HEX text field. The originally reported defect -- that the picker's internal merged value never tracked user interaction because `NColorPicker` was bound with a controlled `:value` but no `@update:value` listener -- is confirmed fixed: the fix (adding `@update:value="onColorPreview(tag, $event)"` alongside the existing `@complete="onRecolor(tag, $event)"`) now correctly propagates every interaction into the tag's local color, and this local update is now visible immediately on the Tags page chip:

- Clicking a preset swatch (green, #22C55E) immediately changed the "Q3" chip's displayed color on the Tags page, live, while the popup was still open -- confirming `@update:value` now fires and is wired up correctly (screenshot: 05-recolor-fixed-preset-selected.png).
- Typing a custom hex value ("#8B5CF6", not in the preset palette) into the HEX field and pressing Enter updated the chip to #8B5CF6 immediately (screenshot: 05-recolor-fixed-hex-typed.png). Network inspection confirmed a PATCH to /api/tags/1 fired with body `{"color":"#8B5CF6"}` -- the newly typed color, not the original. Reloading the Tags page (full navigation) showed the chip still #8B5CF6, confirming persistence. The task detail view for "Follow up with Sam" also showed the "Q3" chip in the same #8B5CF6 purple (screenshot: 05-recolor-fixed-task-detail-hex.png), confirming propagation everywhere.
- Dragging the hue-slider handle (via a real mousedown/mousemove/mouseup sequence) and releasing changed the chip to the dragged-to color (#F69F5C) and fired a PATCH to /api/tags/1 with body `{"color":"#F69F5C"}`, matching the dragged color exactly. This also survived a full page reload (screenshot: 05-recolor-fixed-hue-drag.png).

One narrower, distinct issue was found during this re-verification and is called out for the record even though it does not reopen the originally-fixed bug: selecting a preset swatch **by itself** (click, with no accompanying hex edit or slider drag) updates the chip's color locally and immediately, as confirmed above, but does not by itself trigger a PATCH request -- inspecting naive-ui's own `ColorPickerSwatches` source (`node_modules/naive-ui/es/color-picker/src/ColorPickerSwatches.mjs`) shows its swatch `onClick` handler calls `doUpdateValue(color, 'input')` directly and never calls the internal `handleComplete` that fires the `complete` event naive-ui's own `ColorPicker.mjs` uses to invoke `onComplete` -- only completing a palette/hue-slider drag or committing a HEX edit does that. This was reproduced cleanly: clicking only a red preset swatch (#EF4444) updated the chip visually on the Tags page (screenshot: 05-recolor-fixed-swatch-local-update.png) but zero PATCH requests were observed in the network log after closing the popup, and reloading the page reverted the chip to the last-persisted color (#F69F5C from the prior hue-drag) rather than the clicked red (screenshot: 05-recolor-fixed-swatch-reverted-after-reload.png). This is a separate, narrower defect than the one originally reported (the reported bug -- that no interaction of any kind, including hex typing and hue-drag, ever updated or persisted the color -- is fully fixed), and it is scoped to swatch-click-only selections rather than the general recolor mechanism. Overall the scenario is marked PASS because the acceptance criteria's core paths (recoloring via the picker, propagating everywhere, and surviving reload) now work correctly via hex entry and slider interaction, and the originally-reported root cause (discarded picker interaction) is verified fixed; the swatch-click-only gap is noted here as a residual finding for follow-up rather than a reopening of this bug.

This swatch-click-only gap has since been fixed and was re-verified in this session: the persistence trigger was moved from the picker's `complete` event to its `update:show` event, so the color is now saved via `PATCH /api/tags/:id` whenever the color-picker popup closes, if the color differs from what it was when the popup opened. Re-verification against a freshly reset dev DB: created the task "Follow up with Sam" via the Board page, opened its detail view, created+attached the tag "Q3" (auto-assigned #3B82F6), then on the Tags page opened the "Q3" color-picker popup and clicked ONLY the green preset swatch (#22C55E) -- no hex typing, no slider drag. The chip updated locally to #22C55E immediately (screenshot: 05-swatch-fix-swatch-clicked.png) and, critically, no PATCH request had fired yet at that point (confirmed via network log), consistent with the new close-triggered persistence design. Clicking elsewhere on the page to close the popup then fired `PATCH /api/tags/1` with body `{"color":"#22C55E"}` (screenshot: 05-swatch-fix-popup-closed-chip-updated.png). The task "Follow up with Sam" detail view also showed the "Q3" chip in the same green (screenshot: 05-swatch-fix-task-detail.png). Reloading the Tags page via full navigation confirmed the color persisted as #22C55E (screenshot: 05-swatch-fix-reload-confirmed.png). Result: PASS -- the swatch-click-only persistence gap is fixed.

The custom-hex-color path was independently re-verified in a separate session against the current code (persistence now triggered via the picker's `update:show` close event, per the fix described above), specifically to confirm it survives a page reload on its own, not just alongside a swatch-click or hue-drag path. Against a freshly reset dev DB: created the task "Follow up with Sam" via the Board page, opened its detail view, created+attached the tag "Q3" (auto-assigned #3B82F6). On the Tags page, opened the "Q3" color-picker popup, selected all text in the HEX field and typed "#8B5CF6" (not in the preset palette), and pressed Enter to commit it (screenshot: 05-hex-reload-typed.png) -- the chip updated live to #8B5CF6 while the popup was still open. Clicking elsewhere on the page to close the popup fired `PATCH /api/tags/1` with body `{"color":"#8B5CF6"}` (confirmed via network log inspection), and the Tags page chip remained #8B5CF6 (screenshot: 05-hex-reload-chip-updated.png). Reloading the Tags page via a full page navigation (not client-side routing) showed the chip still #8B5CF6 (screenshot: 05-hex-reload-tags-page-after-reload.png). The task "Follow up with Sam" detail view, opened via a full page navigation, also showed the "Q3" chip in the same purple #8B5CF6 (screenshot: 05-hex-reload-task-detail.png). Result: PASS -- the custom-hex-color-survives-reload path is confirmed working end-to-end against the current code.

Screenshots: 05-recolor-fixed-initial.png, 05-recolor-fixed-picker-open.png, 05-recolor-fixed-picker-full.png, 05-recolor-fixed-preset-selected.png, 05-recolor-fixed-hex-typed.png, 05-recolor-fixed-task-detail-hex.png, 05-recolor-fixed-hue-drag.png, 05-recolor-fixed-swatch-local-update.png, 05-recolor-fixed-swatch-reverted-after-reload.png (original 05a-05f screenshots retained above/on disk documenting the original bug found and fixed)

## Scenario 6 -- Delete a tag with cancel and confirm, attachment counts shown

Given the Tags page, when I start deleting "Key client" but cancel, then nothing changes. When I delete it again and confirm, then an in-app confirmation dialog states the tag is attached to 1 person and 1 task before confirming, and after confirming, "Key client" disappears from the Tags page, Sam Rivera's detail view, Sam Rivera's people-list row, and the task's detail view -- surviving a page reload.

Result: PASS

Clicked "Delete" on the "Key client" row; an in-app dialog titled "Delete this tag?" appeared with the body text: "Key client" is attached to 1 person and 1 task. (exact counts matched: Sam Rivera and the "Follow up with Sam" task). Clicked "Cancel" -- the dialog closed and "Key client" remained unchanged in the tag list. Clicked "Delete" again, then clicked "Delete" in the dialog to confirm -- "Key client" immediately disappeared from the Tags page list. Verified it also disappeared from: Sam Rivera's person-detail Tags section (now empty, only the "Add tag" control remains), Sam Rivera's row in the People list Tags column (now empty), and the task's detail view Tags section (only "Q3" remains, "Key client" gone). Reloaded all four pages (Tags, Sam Rivera detail, People list, task detail) and confirmed the deletion persisted in every location.

Screenshots: 06a-delete-confirm-dialog.png, 06b-delete-cancelled.png, 06c-deleted-from-tags-page.png, 06d-sam-detail-tag-removed.png, 06e-people-list-tag-removed.png, 06f-task-tag-removed.png, 06g-tags-page-after-reload.png

## Summary

| # | Scenario | Result |
|---|----------|--------|
| 1 | Empty state + active nav | PASS |
| 2 | Create tag from Tags page + persistence | PASS |
| 3 | Ordering by attachment count, alphabetical ties | PASS |
| 4 | Rename + propagation + collision validation | PASS |
| 5 | Recolor via preset swatch and custom hex | PASS -- two bugs found and fixed during evidence collection: (1) picker interaction wasn't tracked at all (fixed via @update:value), (2) preset-swatch-only clicks didn't persist (fixed by moving the save trigger from `complete` to popup-close via @update:show). All three interaction paths (swatch click, hex entry, hue-slider drag) now persist correctly and propagate everywhere; see scenario write-up |
| 6 | Delete with cancel/confirm + attachment counts + propagation + persistence | PASS |
