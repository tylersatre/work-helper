# HTTP API Contract: Create Task

**Feature**: `001-create-task` | **Date**: 2026-08-06

All endpoints are JSON over HTTP, served by the Fastify app that also serves the built client. No authentication (single-user, per spec assumptions).

## Shared shape

```ts
// src/shared/types.ts
interface Task {
  id: number;
  title: string;      // trimmed
  lane: string;       // lane name from configuration
  createdAt: number;  // unix epoch ms
}
```

## GET `/api/board`

Returns the full board: every configured lane, in configured order, each with its tasks in creation order. Lanes with no tasks are included with an empty `tasks` array (acceptance scenario US1-1: empty lanes are shown).

**Response `200 application/json`**:

```json
{
  "lanes": [
    { "name": "To Do", "tasks": [ { "id": 1, "title": "Follow up with Sam", "lane": "To Do", "createdAt": 1754500000000 } ] },
    { "name": "In Progress", "tasks": [] },
    { "name": "Waiting", "tasks": [] },
    { "name": "Done", "tasks": [] }
  ]
}
```

Guarantees:

- `lanes[]` order === order in `config/lanes.json` (FR-001).
- `tasks[]` order === ascending `id` (creation order, FR-006).
- Every configured lane appears exactly once, even when empty.

## POST `/api/tasks`

Creates a task. The server assigns the lane (first configured lane, FR-003) and `createdAt`; the client sends only the title (spec: title is the only field captured at creation).

**Request `application/json`**:

```json
{ "title": "Follow up with Sam" }
```

**Response `201 application/json`** — the created task:

```json
{ "id": 1, "title": "Follow up with Sam", "lane": "To Do", "createdAt": 1754500000000 }
```

**Response `400 application/json`** — title missing, empty, or whitespace-only after trimming (FR-005); nothing is persisted (SC-003):

```json
{ "error": { "message": "Title is required" } }
```

Notes:

- `title` is trimmed server-side before validation and storage; the `201` body returns the trimmed value.
- Duplicate titles are allowed and create distinct tasks (spec edge case).
- Any client-supplied `lane` or `id` field is ignored — not an error, but never honored (no lane picker in this feature).

## Explicitly absent

No `PATCH`/`PUT`/`DELETE` on tasks, no lane endpoints of any kind (FR-007, FR-008). Their absence is part of this contract — adding them belongs to a future feature spec.
