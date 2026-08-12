# Feature: dark-mode-readability

> **Provenance / sign-off status:** Tyler directed this feature in chat on 2026-08-11 (screenshots of an unreadable email view and hard-to-see people-list links, plus follow-up feedback during the session) rather than authoring this PRD up front; the constitution's PRD step was back-filled from his verbatim directives during PR review of #18. The user story and criteria below therefore need Tyler's explicit sign-off at PR acceptance — per Principle I they are his acceptance contract, not the implementing agent's.

## User story

As Tyler, I want the app's dark mode overhauled per dark-mode UI best practices — no harsh pure-black background, readable email bodies, clearly visible links, and tables/lists that render as visually distinct contained surfaces — so that every screen is comfortable to read and rows of data stop blending into the page.

Tyler's directives, verbatim from chat: viewing an email is "nearly impossible to read"; on the people list "links are hard to see"; "the straight black for the background may be a little too much"; "do research on dark mode UI best practices and figure out how to make things easier to read"; "there are likely other problem screens as well, those two just popped out to me"; "I want background on the emails to separate them out.... card like maybe? some sort of outline"; "something is jacked up on the tags columns"; "I still also don't like our tables, I want it more visually distinct... right now it feels like stuff blends together too much"; "from/to/(others that don't show here) should have the box around them with one email per line. The link/create should be to the right (smaller field for search is probably fine)"; "the info for the email should be displayed more nicely (sent/received/flagged (show that better than just `notFlagged`)) - maybe a table or something? Better separated out from the body of the email".

## Acceptance criteria

- **Given** any page in the app
  **When** it loads
  **Then** the page background is a dark gray — not pure or near black — and every text tier, link, and error color meets WCAG AA contrast (≥ 4.5:1) on every surface it sits on

- **Given** the People list
  **When** it renders
  **Then** person-name links are clearly visible in a light accent color at AA contrast, not the browser-default dark blue

- **Given** an email conversation containing an HTML email
  **When** the conversation view renders
  **Then** the email body displays on a light card (white background, dark text) so the email's own author-set colors remain readable, and each message in the conversation renders as a distinct outlined card separated from its neighbors

- **Given** the People table with people who have tags
  **When** rows render
  **Then** tag chips appear inside the Tags column and every row's separator line runs continuously and aligned across all columns — no floating or misaligned fragments

- **Given** the People table and the Emails conversation list
  **When** they render
  **Then** each is a visually contained surface — background, outline, rounded corners — with rows separated by dividers (and hover feedback) so entries read as distinct records instead of blending into the page

- **Given** a message in the conversation view with from/to/cc/bcc participants
  **When** the header renders
  **Then** each participant appears on its own line inside a contained, boxed list — role label, then the person link or display name and address — and for unlinked addresses the search-to-link field (compact) and Create person button sit to the right on that same line

- **Given** a message's metadata
  **When** the header renders
  **Then** Sent, Received, and Folder display as labeled pairs in a tidy grid; flag state and importance render as human-readable badges (e.g. "Flagged", "High importance") only when set — never raw API values like `notFlagged` or `normal` — with categories and the Open in Outlook link alongside; and the whole header is visually separated from the email body

- **Given** any other screen (board, tags, sync, person detail, task detail)
  **When** it loads
  **Then** no surface uses a hardcoded near-black color and no text or link falls below AA contrast, with both properties enforced by automated style-gate tests so regressions fail the suite
