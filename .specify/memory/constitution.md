# work-helper Constitution

## Core Principles

### I. Spec Is the Source of Truth
No implementation without a spec'd feature and acceptance criteria. Every feature begins as a PRD (`docs/product/features/<name>.md`) with a Tyler-authored user story and Given/When/Then acceptance criteria, run through `/speckit-specify` before any code is written. Code with no corresponding spec is out of scope and must not be merged.

### II. Test-First (NON-NEGOTIABLE)
TDD is mandatory: a failing test is written before the code that makes it pass (red → green). Any code written before its failing test exists is discarded, not retrofitted with a test after the fact.

### III. Definition of Done: Evidence Over Assertion
A feature is done only when every acceptance criterion in its spec has (a) a passing automated check and (b) browser evidence from the `browser-tester` agent, both independently confirmed by the `verifier` agent. The verifier never trusts a builder's summary — it re-runs checks itself. No feature is reported complete without command output, test results, or screenshots to back the claim.

### IV. Architecture Constraints
work-helper is a TypeScript web app that also exposes an MCP server built on the official `@modelcontextprotocol/sdk`. Email ingestion pulls directly from Microsoft Graph (scheduled/webhook) inside the server — AI agents are consumers of the work-helper MCP (query/link/tag tools), never the ingestion path. Deployment target is self-hosted Docker. Deviating from any of these requires updating this constitution first, not working around it in code.

### V. Small Vertical Slices, Trunk via PR
Features land in small, independently shippable vertical slices. Every change lands via a pull request (CI review runs on the diff) — no direct commits to `main`. Commit messages follow Conventional Commits.

## Additional Constraints

Technology stack: TypeScript throughout (app + MCP server). MCP server built on `@modelcontextprotocol/sdk` — no other MCP framework. Self-hosted via Docker; no dependency on a specific cloud provider for the core app.

Data & migrations (development phase): the project holds no real data yet, so data loss is not a concern. Schema changes are made by editing the base schema in place and resetting/recreating the dev database — do not accumulate migration files or build data-preserving migration paths, backfills, or backups. This constraint expires once real data exists (first production deployment or real email ingestion begins); at that point this constitution must be amended to require migrations that avoid data loss where possible and explicitly flag any unavoidably lossy step.

## Development Workflow

feature spec → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (Superpowers TDD loop) → gate hook (lint/typecheck/test/build) → `verifier` agent → `browser-tester` agent evidence → PR (Claude Code CI review) → Tyler acceptance.

## Governance

This constitution supersedes ad hoc practice. Amendments require updating this file, bumping the version below, and recording the change in the amendment's PR description. The verification gate and `verifier` agent enforce Principles II and III mechanically; violations block the Stop hook and are called out by the verifier agent, not silently waved through.

**Version**: 1.1.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-07
