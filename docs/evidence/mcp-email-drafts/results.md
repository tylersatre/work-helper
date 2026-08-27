# MCP Email Drafts — Browser Evidence

Feature: 031-mcp-email-drafts
UI: http://localhost:5131
API: http://localhost:3031 (MAIL_PROVIDER=fake)
Date: 2026-08-27

## Scenario 1 — US4 AC1: Signature panel persists across reload

**Given** the Sync page's Signature panel with no signature saved yet
**When** the user enters HTML signature text, clicks Save, and reloads the page
**Then** the textarea still shows the saved signature after reload

### Steps taken
1. Navigated to http://localhost:5131/sync.
2. Located the Signature panel (heading "Signature"). It showed "No signature saved yet." above an empty textarea labeled "Paste or write your HTML signature block here" — screenshot: signature-panel-empty.png.
3. Typed `<p>Tyler Satre</p><p>Example Corp</p>` into the textarea.
4. Clicked the panel's "Save" button.
5. Reloaded the page (full navigation to http://localhost:5131/sync).
6. Re-inspected the Signature panel: the textarea showed `<p>Tyler Satre</p><p>Example Corp</p>` — the exact value entered before reload, confirming persistence — screenshot: signature-panel-persisted.png.

### Result: PASS

Screenshots: signature-panel-empty.png, signature-panel-persisted.png.

Screenshots re-captured on 2026-08-27 after a CSS fix to `src/client/components/SignaturePanel.vue` (signature textarea now uses the app's dark-mode palette tokens `--wh-surface-raised`, `--wh-border`, `--wh-text-primary` instead of rendering as an unstyled white box). Re-verified both the empty state (signature-panel-empty.png) and the persisted-after-reload state (signature-panel-persisted.png) — the textarea now renders with a dark background matching the rest of the UI, not a stark white box.

## Scenario 2 — US1 AC2 / FR-013: Draft markers on the Emails page and conversation detail page

**Given** a conversation titled "Follow-up notes" with a draft message, already synced into the store
**When** the user views the Emails list and then opens the conversation detail page
**Then** the Emails list row shows a "Draft" chip, and the conversation detail page shows a "Draft" badge on the draft message

### Steps taken
1. Confirmed via the Sync page that an email sync had already run (2026-07-01 – 2026-08-10, success, 31 new / 0 updated), so the seeded "Follow-up notes" draft conversation was already present in the store — no additional sync was needed.
2. Navigated to http://localhost:5131/emails.
3. Found the "Follow-up notes" row at the top of the list (Sam Rivera, Tyler Satre; Aug 7, 2026, 5:00 AM) with a yellow "Draft" chip (data-testid="draft-indicator") next to the timestamp — screenshot: emails-page-draft-chip.png.
4. Clicked into the "Follow-up notes" conversation (navigated to /emails/30).
5. On the conversation detail page, the single message's metadata badges row (below Sent/Received/Folder) showed a "Draft" badge (data-testid="message-draft") alongside the "Open in Outlook" link — screenshot: conversation-page-draft-badge.png.

### Result: PASS

Screenshots: emails-page-draft-chip.png, conversation-page-draft-badge.png.

## Summary

| Scenario | Result |
| --- | --- |
| US4 AC1 — Signature panel persists across reload | PASS |
| US1 AC2 / FR-013 — Draft markers on Emails page and conversation detail page | PASS |
