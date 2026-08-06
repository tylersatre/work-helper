# Configuration Contract: Lane Configuration File

**Feature**: `001-create-task` | **Date**: 2026-08-06

The one interface Tyler operates directly: the lane configuration file. This is the sole source of lane names and order (FR-001, FR-007).

## Location

- Default: `config/lanes.json` (repo/app working directory).
- Override: `LANES_CONFIG_PATH` environment variable (absolute or cwd-relative path). Exists for Docker deployments that mount the file elsewhere.

## Format

A JSON array of lane-name strings. Array order is display order, left to right. The deployment configuration for work-helper:

```json
["To Do", "In Progress", "Waiting", "Done"]
```

## Validity rules (enforced at server startup via zod)

- Must be a JSON array of strings — no other top-level shape.
- At least one entry.
- Every entry non-empty after trimming.
- Entries unique (lane names identify lanes; `Task.lane` stores the name).

A file that violates these rules fails server startup with a message naming the file path and the rule violated. Per the spec, graceful runtime *behavior* for missing/empty config is out of scope — fail-fast at startup is engineering hardening, not spec'd product behavior.

## Read semantics

- Read once at server startup. Editing the file requires a server restart to take effect (consistent with SC-004: "no manual setup steps beyond editing the configuration file" — restart is deployment lifecycle, not setup).
- The server never writes this file (FR-007 — no lane management in the app).
