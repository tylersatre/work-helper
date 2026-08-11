# work-helper Constitution

## Core Principles

### I. Spec Is the Source of Truth
No implementation without a spec'd feature and acceptance criteria. Every feature begins as a PRD (`docs/product/features/<name>.md`) with a Tyler-authored user story and Given/When/Then acceptance criteria, run through `/speckit-specify` before any code is written. Code with no corresponding spec is out of scope and must not be merged.

### II. Test-First (NON-NEGOTIABLE)
TDD is mandatory: a failing test is written before the code that makes it pass (red → green). Any code written before its failing test exists is discarded, not retrofitted with a test after the fact.

### III. Definition of Done: Evidence Over Assertion
A feature is done only when every acceptance criterion in its spec has (a) a passing automated check and (b) evidence matching its surface: browser evidence from the `browser-tester` agent for criteria with a user-facing UI surface, and the recorded output of its automated checks (test runs, command logs) for criteria reachable only through APIs or MCP tools — both independently confirmed by the `verifier` agent. The verifier never trusts a builder's summary — it re-runs checks itself. No feature is reported complete without command output, test results, or screenshots to back the claim.

### IV. Architecture Constraints
work-helper is a TypeScript web app that also exposes an MCP server built on the official `@modelcontextprotocol/sdk`. Email ingestion pulls directly from Microsoft Graph (scheduled/webhook) inside the server — AI agents are consumers of the work-helper MCP (query/link/tag tools), never the ingestion path. Deployment target is self-hosted Docker. Deviating from any of these requires updating this constitution first, not working around it in code.

### V. Small Vertical Slices, Trunk via PR
Features land in small, independently shippable vertical slices. Every change lands via a pull request (CI review runs on the diff) — no direct commits to `main`. Commit messages follow Conventional Commits.

## Additional Constraints

Technology stack: TypeScript throughout (app + MCP server). MCP server built on `@modelcontextprotocol/sdk` — no other MCP framework. Self-hosted via Docker; no dependency on a specific cloud provider for the core app.

Data & migrations (production): real data exists as of 2026-08-11 (home-server deployment in active use), so schema changes must preserve existing data. Every schema change ships as a new numbered drizzle-kit migration file committed alongside the schema edit; migration files already on `main` are immutable — never edited, regenerated, or deleted, because deployed databases have recorded them as applied. Migrations must avoid data loss wherever possible (hand-adjusting generated SQL when drizzle-kit's default would drop data); an unavoidably lossy step must be explicitly flagged in the spec and PR description and approved by Tyler before merge. Resetting or recreating a database is not an acceptable substitute for a working migration.

## Development Workflow

feature spec → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (Superpowers TDD loop) → gate hook (lint/typecheck/test/build) → `verifier` agent → `browser-tester` agent evidence → PR (Claude Code CI review) → Tyler acceptance.

## Governance

This constitution supersedes ad hoc practice. Amendments require updating this file, bumping the version below, and recording the change in the amendment's PR description. The verification gate and `verifier` agent enforce Principles II and III mechanically; violations block the Stop hook and are called out by the verifier agent, not silently waved through.

**Version**: 2.0.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-11
