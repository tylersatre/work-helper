# Future: email-attachment-files

## One-liner

Download and store the actual attachment files on synced email, not just their metadata, so attachments survive mailbox changes and are available inside work-helper.

## Origin

- **Source:** split from `docs/product/features/email-sync-improvements.md`
- **Deferred because:** Tyler chose metadata-only capture (filename, type, size) for that slice; storing files brings storage, size-limit, and serving questions that didn't fit
- **Recorded:** 2026-08-10

## Depends on

`email-sync-improvements` shipped (attachment metadata exists to hang files off). Viewing/downloading attachments in the app naturally pairs with the `email-ui` feature (specced 2026-08-11, `docs/product/features/email-ui.md`), whose detail view deliberately shows attachment metadata only.

## Notes

- Nothing decided beyond the split itself. Interview questions for later: size caps, which attachment types to fetch (skip inline images?), where files live under the self-hosted Docker deployment, and whether the metadata refresh on re-sync should also fetch files that appeared after first sync.
- The snapshot spirit of email-sync suggests stored files are kept even if the attachment later disappears from the mailbox.
