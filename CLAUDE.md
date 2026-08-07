# work-helper

A self-hosted personal CRM: a TypeScript web app that also exposes an MCP server (the "work-helper" MCP) for people, emails, tasks, tags, and a Trello-like kanban. Tyler is the product owner — he writes specs and acceptance criteria, never code. Claude Code does all engineering.

## The loop

feature spec (`docs/product/features/<name>.md`) → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (under Superpowers' TDD workflow) → verification gate hook (lint/typecheck/test/build on Stop) → `verifier` agent → `browser-tester` agent evidence (`docs/evidence/<feature>/`) → PR → Claude Code CI review → Tyler acceptance.

Each feature runs in its own native Claude worktree (`.claude/worktrees/`, one session per worktree) branched from `main`; the main checkout stays parked on `main` and is used only for `/new-feature` docs and PR review. A SessionStart hook installs dependencies in fresh worktrees; `npm run dev` derives per-feature ports from the branch's `NNN-` prefix (feature 006 → API 3006, UI 5106) so parallel dev servers never collide; `scripts/next-feature-number.sh` makes feature numbering race-free across worktrees. After a PR merges, remove the feature's worktree and branch (the session's exit prompt offers this, or `git worktree remove`).

## Definition of done

Every acceptance criterion has a passing automated check **and** browser evidence, both independently confirmed by the `verifier` agent. Evidence over assertion — no criterion is done because it was asserted to be done. See `.specify/memory/constitution.md` for the full principles.

## Architecture constraints

- TypeScript throughout (app + MCP server).
- MCP server built on the official `@modelcontextprotocol/sdk` — no other MCP framework.
- Email ingestion pulls directly from Microsoft Graph (scheduled/webhook) inside the server. AI agents are consumers of the work-helper MCP (query/link/tag tools), never the ingestion path.
- Deployment target: self-hosted Docker.

## Conventions

- Conventional Commits.
- Small vertical slices; one feature per branch; every feature lands via PR (no direct commits to `main`). One exception: approved product docs written by `/new-feature` commit straight to `main`, so worktrees branch with them included.
- TDD is mandatory: failing test first, then code. Code written before its failing test is discarded, not retrofitted.
- Markdown files: never hard-wrap lines. Write each paragraph/sentence as one long line and let the editor soft-wrap; line breaks only where they're semantic (headings, list items, code blocks).
