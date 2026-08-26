# Future: custom-fields

## One-liner

The custom-fields half of the brief's "tags and custom fields" core concept — flexible per-entity fields beyond the config-file person fields that exist today.

## Origin

- **Source:** `docs/product/brief.md` — "tags and custom fields" are a core concept; explicitly kept out of the tags feature (2026-08-10), which was framed as tags only
- **Deferred because:** tags stood alone as a first-class model with its own UI and rules; custom fields are a different mechanism, and person extra fields already partially exist via the track-people field config
- **Recorded:** 2026-08-10

## Depends on

None strictly — the track-people field config (extra optional free-text person fields, file-edited) is the existing foundation this would build on.

## Notes

Nothing product-level has been decided. Open questions for the future `/new-feature` interview: an in-app UI for managing the field config (track-people deliberately left it file-edit-only); field types beyond free text (dropdowns, dates, checkboxes — deferred in track-people); custom fields on tasks (nothing exists today); whether custom fields ever appear in list views (track-people kept them off the people list). Tyler may also decide the config-file approach already covers the need and delete this stub.

The 2026-08-21 MCP audit split semantics-bearing native fields into their own stubs — `task-fields` (due date/priority/effort/description on tasks) and `company-metadata` (a company domain field). `task-fields` shipped 2026-08-26, so this stub now narrows further: it covers the truly flexible per-entity field mechanism only, not any of the four fields that now exist natively on tasks.
