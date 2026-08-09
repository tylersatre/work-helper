# UI Contract: UI Refresh (009)

## API and MCP contracts: unchanged

No HTTP endpoint is added, removed, or modified — the client keeps calling `GET /api/board`, `POST /api/tasks`, `PUT /api/tasks/:id/placement`, the task-notes endpoints, and the people/contact-entry endpoints exactly as today. The MCP server's tools, auth flow, and password page are untouched. FR-011's regression gate (full suite passes) enforces this.

## Stable UI selectors

These are the structural hooks the component tests and the browser-tester rely on. Preserved testids MUST keep their current meaning; new testids are introduced by this feature. Anything not listed is free to change during the restyle.

### Preserved (existing)

| Selector | Surface | Meaning |
|---|---|---|
| `[data-testid="lane"]` | Board | One lane section (drop zone); one per configured lane, in configured order |
| `[data-testid="task-card"]` + `data-task-id` | Board | One draggable card; midpoint math in `Lane.vue` depends on this element's bounding box |
| `[data-testid="drop-indicator"]` | Board | Insertion marker shown during a drag |
| `[data-testid="error-banner"]` | Board | Failed-move reconciliation banner |
| `role="alert"` on validation messages | Forms | Validation text (task title, person fields) — now positioned adjacent to its input |

### New (this feature)

| Selector | Surface | Meaning |
|---|---|---|
| `[data-testid="app-nav"]` | Shell | Top navigation bar; contains the app name and links "Board" and "People"; the active link carries `aria-current="page"` |
| `[data-testid="add-task-toggle"]` | Board (first lane footer) | Collapsed "+ Add task" button; expands the inline form |
| `[data-testid="add-task-form"]` | Board (first lane footer) | The expanded inline form (title input, note textarea, submit, cancel) |
| `[data-testid="confirm-dialog"]` | Task detail | In-app note-deletion dialog (teleported to `document.body`); exposes confirm and cancel buttons |
| `[data-testid="lane-empty"]` | Board | Placeholder inside a lane with zero cards; absent once the lane has a card |
| `[data-testid="people-empty"]` | People page | Empty-state shown when no people exist; replaced by the list when people exist |

### Structural guarantees (browser-tester assertions)

- Every app page renders `[data-testid="app-nav"]` and a dark background: the computed `background-color` of `body` (and page surfaces) is a dark color, text light — no `rgb(255, 255, 255)` page background anywhere.
- At desktop size with an overfull lane: `document.documentElement` has no vertical scroll; the lane's card list scrolls; all lane headers remain in the viewport.
- No flow triggers `window.confirm`/`window.alert` (the browser-tester can override them to throw and walk the flows).
- At 375px width: no horizontal overflow on `body` except the board's own `overflow-x` scroll container; nav links are visible and clickable.
