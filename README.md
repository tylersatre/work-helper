# work-helper

A self-hosted personal CRM: a TypeScript web app that also exposes an MCP
server for people, ingested email, tasks, tags, and a Trello-like kanban.
See `docs/product/brief.md` for the full product context and architecture
constraints, and `CLAUDE.md` for the day-to-day engineering loop.

Tyler (product owner) writes specs and reviews evidence. Claude Code does
all engineering, spec-driven and TDD, with an automated verification gate
and browser-driven acceptance evidence before anything is called done.

## How Tyler ships a feature

1. Copy `docs/product/feature-template.md` to
   `docs/product/features/<name>.md` and fill it out — a user story and
   Given/When/Then acceptance criteria. The template has a worked example
   at the bottom.
2. Run `/speckit-specify @docs/product/features/<name>.md`, then
   `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`. Claude Code
   builds the feature under TDD (Superpowers), and the Stop hook
   (`.claude/hooks/gate.sh`) blocks it from finishing a turn with a
   failing lint/typecheck/test/build.
3. The `verifier` and `browser-tester` agents independently check the work
   against your acceptance criteria and leave an evidence bundle in
   `docs/evidence/<name>/` (screenshots + `results.md`, gitignored — it's
   scratch evidence, not repo history).
4. Review the evidence bundle, and click around the running app yourself
   (or point an agent at the work-helper MCP) to confirm it does what you
   asked.
5. The feature lands via a PR; Claude Code's GitHub Actions review
   (`.github/workflows/claude-review.yml`) checks the diff against
   `CLAUDE.md` and the spec before you merge.
6. If something's off, file it as a GitHub issue and iterate — same loop.

## Setup

See `docs/setup/setup-report.md` for how this repo's Claude Code
environment (plugins, MCP servers, hooks, agents) was configured, what's
still pending on your end, and how to verify it after a restart.
