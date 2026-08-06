# work-helper

A self-hosted personal CRM: a TypeScript web app that also exposes an MCP
server (the "work-helper" MCP) for people, emails, tasks, tags, and a
Trello-like kanban. Tyler is the product owner — he writes specs and
acceptance criteria, never code. Claude Code does all engineering.

## The loop

feature spec (`docs/product/features/<name>.md`) → `/speckit-specify` →
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (under
Superpowers' TDD workflow) → verification gate hook (lint/typecheck/test/
build on Stop) → `verifier` agent → `browser-tester` agent evidence
(`docs/evidence/<feature>/`) → PR → Claude Code CI review → Tyler
acceptance.

## Definition of done

Every acceptance criterion has a passing automated check **and** browser
evidence, both independently confirmed by the `verifier` agent. Evidence
over assertion — no criterion is done because it was asserted to be done.
See `.specify/memory/constitution.md` for the full principles.

## Architecture constraints

- TypeScript throughout (app + MCP server).
- MCP server built on the official `@modelcontextprotocol/sdk` — no other
  MCP framework.
- Email ingestion pulls directly from Microsoft Graph (scheduled/webhook)
  inside the server. AI agents are consumers of the work-helper MCP
  (query/link/tag tools), never the ingestion path.
- Deployment target: self-hosted Docker.

## Conventions

- Conventional Commits.
- Small vertical slices; one feature per branch; every feature lands via
  PR (no direct commits to `main`).
- TDD is mandatory: failing test first, then code. Code written before its
  failing test is discarded, not retrofitted.
