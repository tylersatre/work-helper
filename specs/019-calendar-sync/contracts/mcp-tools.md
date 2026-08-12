# MCP Tool Contract: Calendar Sync

Four new tools plus one extended tool, registered in `createMcpServer` (`src/server/mcp/tools.ts`) alongside the existing fifteen. Authorization is inherited: every tool call requires the bearer token minted by the OAuth+Authentik flow (FR-017) — tools do no auth of their own. Conventions match the existing surface: input/output schemas are plain objects of zod v4 shapes; errors are `toolError(message)` (`{ content: [{ type: 'text', text }], isError: true }`); successes carry `structuredContent` plus a human-readable text summary; timestamps are epoch-ms numbers; date inputs are `YYYY-MM-DD` strings interpreted as inclusive server-local days.

## Shared shapes

```ts
// A participant as seen on an event (get-event)
Participant = {
  address: string;
  displayName: string;                                   // '' when the source event had none
  role: 'organizer' | 'required' | 'optional' | 'resource';
  responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
  person: { id: number; name: string } | null;           // linked person, else null (FR-020)
}

// An event summary row (list-events, events-for-person)
EventSummary = {
  id: number;
  subject: string;
  startAt: number;            // epoch ms
  endAt: number;              // epoch ms
  isAllDay: boolean;
  isCancelled: boolean;       // cancelled events included and flagged (FR-019, FR-021)
  location: string;
  seriesId: string | null;    // shared series identifier; null for one-off events (FR-009)
}
```

## sync-calendar (new)

Runs a calendar sync exactly as a web-triggered run does, recorded with source `'mcp'` (FR-018). Mirrors `sync-emails`' handler-level validation so failures are friendly tool errors, not schema rejections.

- **Input**: `{ startDate?: string, endDate?: string }` — optional in schema, required by the handler.
- **Tool errors** (nothing synced, no history row):
  - `'A start date and end date are required'` — either date missing.
  - `'startDate and endDate must be valid YYYY-MM-DD dates, with endDate not before startDate'` — malformed or inverted range.
  - `'A sync is already running'` — global single-flight collision, either sync kind (FR-006).
- **Output** (`structuredContent`): `{ status: 'complete' | 'interrupted', newCount: number, updatedCount: number, error?: string }`. A run that fails entirely (e.g. disconnected mailbox) returns a tool error whose text ends with "connect the mailbox on the Sync page." and records a `failure` history row — matching `sync-emails`' behavior and FR-013. Note the deliberate naming: `newCount`/`updatedCount` (the run-history vocabulary), not `sync-emails`' legacy `syncedCount`.

## list-events (new)

Stored events overlapping an inclusive date range, ascending by `startAt` (ties by `id`), cancelled events included and flagged (FR-019). No pagination — the range bounds the result (research R12, deliberate deferral).

- **Input**: `{ startDate: string, endDate: string }` (required by the handler; same validation messages as sync-calendar).
- **Output**: `{ events: EventSummary[] }`.

## get-event (new)

One stored event with the full FR-008 detail set; each participant shows its linked person when one exists (FR-020).

- **Input**: `{ eventId: z.number().int().positive() }`.
- **Tool error**: `` `Event ${eventId} not found` `` — unknown id.
- **Output**:

```ts
{
  id: number;
  subject: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
  isCancelled: boolean;
  location: string;
  bodyText: string;
  categories: string[];        // stored as Graph's array; the spec's singular "category" renders from it
  onlineMeetingUrl: string;    // '' when the event has no online meeting
  webLink: string;             // opens the event in Outlook
  seriesId: string | null;
  participants: Participant[]; // organizer first, then attendees in stored order
}
```

## events-for-person (new)

Events where any of the person's linked email addresses appears as organizer or attendee, newest-first by `startAt` (ties by `id` desc), cancelled events included and flagged (FR-021). Pagination mirrors `emails-for-person`.

- **Input**: `{ personId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(50), cursor: z.string().optional() }`.
- **Tool errors**: `` `Person ${personId} not found` ``; `'Invalid cursor'`.
- **Output**:

```ts
{
  person: { id: number; name: string };
  events: Array<EventSummary & {
    addresses: Array<{                     // the person's own matching addresses on this event
      address: string;
      role: 'organizer' | 'required' | 'optional' | 'resource';
      displayName: string;
      responseStatus: 'none' | 'accepted' | 'declined' | 'tentative';
    }>;
  }>;
  nextCursor: string | null;               // opaque keyset cursor
}
```

## list-unlinked-addresses (extended)

Existing tool (`tools.ts:610-633`); the query and output schema change per FR-022. Zero-argument input is unchanged.

- **Output** (`structuredContent`):

```ts
{
  addresses: Array<{
    address: string;
    messageCount: number;          // 0 for calendar-only addresses
    eventCount: number;            // NEW — distinct events where the address appears in a non-resource role; 0 for mail-only
    displayName: string;           // most recent non-empty name across mail and events; falls back to the address
    lastMessageAt: number | null;  // CHANGED — null for calendar-only addresses
  }>;
}
```

- **Semantics**: rows are unlinked addresses (`person_id IS NULL`) seen in mail or as non-`resource` event participants; addresses seen only in the `resource` role are excluded; ordering unchanged — `messageCount DESC`, then `lastMessageAt DESC` (nulls last), then `address ASC`.

## Unchanged tools

All fifteen existing tools keep their contracts byte-for-byte; `sync-emails` still reports `syncedCount` and still shares the single-flight guard, so a calendar sync in flight makes `sync-emails` return `'A sync is already running'` and vice versa (FR-006).
