# work-helper
 
A self-hosted personal CRM: a TypeScript web app that also exposes an MCP server for people, ingested email, tasks, tags, and a Trello-like kanban. See `docs/product/brief.md` for the full product context and architecture constraints, and `CLAUDE.md` for the day-to-day engineering loop.
 
Tyler (product owner) writes specs and reviews evidence. Claude Code does all engineering, spec-driven and TDD, with an automated verification gate and browser-driven acceptance evidence before anything is called done.
 
## How Tyler ships a feature

Features are built in parallel, each in its own Claude worktree (`.claude/worktrees/`) with its own session. The main checkout stays parked on `main` — it's only for writing feature docs and reviewing PRs.

1. **Write the feature doc** — in the main checkout, `/new-feature <one-line idea>`. It interviews you in rounds, writes `docs/product/features/<name>.md`, and after your approval commits it to `main`. *(Or copy `docs/product/feature-template.md` by hand.)*
2. **Open a worktree session** — a new desktop-app session (worktree is automatic) or `claude -w <feature-slug>` from the main checkout. Use a big model (Fable/Opus) for spec + plan. Dependencies install themselves on session start.
3. **Spec it** — `/speckit.specify @docs/product/features/<name>.md`. Numbers the feature (race-free across worktrees), renames the branch to `NNN-<name>`, writes the spec. *(Optional: `/speckit.clarify` if open questions remain.)*
4. **Plan and tasks** — `/speckit.plan`, then `/speckit.tasks`. Skim as product owner: "is the described behavior what I meant." *(Optional: `/speckit.analyze` for contradictions, `/speckit.checklist` when requirements felt mushy.)*
5. **Build** — `/model` down to Sonnet, then `/speckit.implement`. TDD and the Stop-hook gate (lint/typecheck/test/build) run automatically. `npm run dev` picks per-feature ports (feature 006 → UI :5106, API :3006), so parallel dev servers coexist.
6. **Review evidence** — read `docs/evidence/<name>/` (screenshots + `results.md` from the `verifier`/`browser-tester` agents), then click around the app yourself at the feature's UI port.
7. **File feedback as GitHub issues, not chat** *(optional)* — Claude works the list through the same loop; if scope shifted, update the feature doc.
8. **Merge and clean up** — when the CI review (`.github/workflows/claude-review.yml`) is clean and criteria pass: merge the PR, delete the branch, and remove the worktree (the session offers this on exit, or `git worktree remove .claude/worktrees/<name>`).
 
## Setup
 
See `docs/setup/setup-report.md` for how this repo's Claude Code environment (plugins, MCP servers, hooks, agents) was configured, what's still pending on your end, and how to verify it after a restart.

## Deploying

See `docs/deploy.md` for running work-helper on a home server with Docker.