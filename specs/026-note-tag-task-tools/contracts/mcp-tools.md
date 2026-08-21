# Contracts: MCP Tools

Interface contracts for this feature are MCP tool schemas, registered via `server.registerTool(name, { description, inputSchema, outputSchema }, handler)` in `src/server/mcp/tools.ts`, following the exact conventions already used by every existing tool in that file (Zod shape objects for `inputSchema`/`outputSchema`, `toolError(message)` for failures, `{ content: [{ type: 'text', text }], structuredContent }` for success). All nine tools below are registered on the same `McpServer` instance as every existing tool and are therefore already behind the `mcp-authentik-auth` OAuth gate (FR-021) — no auth-specific contract details are needed per tool.

Every write tool is fully atomic: a validation or not-found failure changes nothing (FR-022), matching the transactional patterns already used by `attachTagToTask`/`attachTagToPerson` (`db.transaction`) and the simple existence-check-then-mutate shape used by `renameCompany`/`deleteCompany`.

---

## 1. `delete-note`

Permanently removes one task note by id (FR-001, FR-002).

**Input**: `{ noteId: number }` (`z.number().int().positive()`)

**Output** (`structuredContent`): `{ deleted: true, taskId: number }`

**Errors**:
| Condition | Message |
|---|---|
| No note with that id | `` Note ${noteId} not found `` |

**Success text**: `` Deleted note ${noteId} from task "${taskTitle}". ``

---

## 2. `update-task`

Renames a task's title (FR-003, FR-004, FR-005). MCP-only — no UI control, by design (spec Assumptions).

**Input**: `{ taskId: number, title: string }` (`taskId: z.number().int().positive()`)

**Output** (`structuredContent`): reuses the existing `taskSummarySchema` shape — `{ id, title, lane, position, createdAt }`.

**Errors**:
| Condition | Message |
|---|---|
| `taskId` matches no task | `` Task ${taskId} not found `` |
| `title` empty or whitespace-only | `Title is required` |

**Success text**: `` Renamed task ${taskId} to "${newTitle}". ``

---

## 3. `create-tag`

Creates a tag with a required name and optional color (FR-006, FR-007, FR-008).

**Input**: `{ name: string, color?: string }`

**Output** (`structuredContent`): `{ id: number, name: string, color: string }`

**Errors**:
| Condition | Message |
|---|---|
| `name` empty/whitespace | `A name is required` |
| `name` matches an existing tag case-insensitively | `That tag name is already in use` |
| `color` given but not valid `#RRGGBB` hex | `A valid color is required` |

**Success text**: `` Created tag "${name}" (${color}). ``

---

## 4. `rename-tag`

Changes an existing tag's name only (FR-009, FR-010). Identified by id or name (case-insensitive).

**Input**: `{ tagId?: number, tagName?: string, name: string }` — exactly one of `tagId`/`tagName` required to identify the tag; `name` is the new name.

**Output** (`structuredContent`): `{ id: number, name: string, color: string }`

**Errors**:
| Condition | Message |
|---|---|
| Neither or both of `tagId`/`tagName` given | `Provide either tagId or tagName, not both` |
| Tag identifier resolves to nothing | `Tag not found` |
| `name` empty/whitespace | `A name is required` |
| `name` matches a *different* existing tag case-insensitively | `That tag name is already in use` |

**Success text**: `` Renamed tag to "${name}". ``

---

## 5. `recolor-tag`

Changes an existing tag's color only (FR-011). Identified by id or name (case-insensitive).

**Input**: `{ tagId?: number, tagName?: string, color: string }`

**Output** (`structuredContent`): `{ id: number, name: string, color: string }`

**Errors**:
| Condition | Message |
|---|---|
| Neither or both of `tagId`/`tagName` given | `Provide either tagId or tagName, not both` |
| Tag identifier resolves to nothing | `Tag not found` |
| `color` not valid `#RRGGBB` hex | `A valid color is required` |

**Success text**: `` Recolored tag "${name}" to ${color}. ``

---

## 6. `delete-tag`

Permanently deletes a tag and detaches it from everything it was attached to, no confirmation step (FR-012, FR-013, FR-014). Identified by id or name (case-insensitive).

**Input**: `{ tagId?: number, tagName?: string }`

**Output** (`structuredContent`): `{ deleted: true, peopleDetached: number, tasksDetached: number }`

**Errors**:
| Condition | Message |
|---|---|
| Neither or both of `tagId`/`tagName` given | `Provide either tagId or tagName, not both` |
| Tag identifier resolves to nothing | `Tag not found` |

**Success text**: `` Deleted tag "${name}" — detached from ${peopleDetached} person(s) and ${tasksDetached} task(s). ``

---

## 7. `attach-tag`

Links an existing tag to a task or a person; never creates a tag; no-op if already attached (FR-015, FR-016, FR-017, FR-018). Identified by id or name (case-insensitive); target is a task or a person.

**Input**: `{ tagId?: number, tagName?: string, taskId?: number, personId?: number }`

**Output** (`structuredContent`): `{ tags: string[] }` — the full current list of tag names on the target record after the attach, mirroring the array-of-tag-names shape already used by `get-task`/`get-person`/`get-company`.

**Errors**:
| Condition | Message |
|---|---|
| Neither or both of `tagId`/`tagName` given | `Provide either tagId or tagName, not both` |
| Neither or both of `taskId`/`personId` given | `Provide either taskId or personId, not both` |
| Tag identifier resolves to nothing | `No such tag exists — call create-tag first` |
| `taskId` matches no task | `` Task ${taskId} not found `` |
| `personId` matches no person | `` Person ${personId} not found `` |

**Success text**: `` Attached tag "${name}" to ${targetLabel}. `` (target label = task title or person's full name)

---

## 8. `detach-tag`

Removes the link between an existing tag and a task or a person; never deletes the tag or touches its other attachments (FR-019). Identified by id or name (case-insensitive); target is a task or a person.

**Input**: `{ tagId?: number, tagName?: string, taskId?: number, personId?: number }`

**Output** (`structuredContent`): `{ tags: string[] }` — the target's remaining tag names after the detach.

**Errors**:
| Condition | Message |
|---|---|
| Neither or both of `tagId`/`tagName` given | `Provide either tagId or tagName, not both` |
| Neither or both of `taskId`/`personId` given | `Provide either taskId or personId, not both` |
| Tag identifier resolves to nothing | `Tag not found` |
| `taskId` matches no task | `` Task ${taskId} not found `` |
| `personId` matches no person | `` Person ${personId} not found `` |

**Success text**: `` Detached tag "${name}" from ${targetLabel}. `` (detaching a tag that wasn't attached is a harmless no-op, same message)

---

## 9. `list-tags` (read tool — supporting infrastructure, see research.md R7)

Lists every tag alphabetically by name, mirroring the Tags page.

**Input**: none

**Output** (`structuredContent`): `{ tags: Array<{ id: number, name: string, color: string, peopleCount: number, tasksCount: number }> }` (same shape `listTags(db)` already returns for the Tags page — reused as-is, no new sort/filter behavior).

**Errors**: none — always succeeds (possibly with an empty list).

**Success text**: `` ${count} tag(s). ``

---

## Cross-cutting notes

- **"Provide either X or Y, not both" validation always runs before any lookup** — a call with both `tagId` and `tagName` (or both `taskId` and `personId`, or neither pair member) fails fast with a validation error, never a not-found error, so a malformed call can't be misread as "that record doesn't exist."
- **Case-insensitive name matching** for tags reuses the exact `sql\`lower(${tags.name}) = lower(${name})\`` comparison already used by `findTagByNameCaseInsensitive` in `src/server/services/tags.ts` — no new comparison logic.
- **No tool in this contract has a confirmation, dry-run, or `force` parameter** — every call is the deliberate act (spec Assumptions), matching `delete-company`/`move-task`/every other destructive tool already in `tools.ts`.
- **No tool writes an audit note** as a side effect (spec Assumptions) — unlike `add-note`, which explicitly sources the note `'mcp'`, these tools leave no trace beyond their direct field/row effect.
