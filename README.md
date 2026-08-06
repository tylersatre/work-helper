# work-helper
 
A self-hosted personal CRM: a TypeScript web app that also exposes an MCP server for people, ingested email, tasks, tags, and a Trello-like kanban. See `docs/product/brief.md` for the full product context and architecture constraints, and `CLAUDE.md` for the day-to-day engineering loop.
 
Tyler (product owner) writes specs and reviews evidence. Claude Code does all engineering, spec-driven and TDD, with an automated verification gate and browser-driven acceptance evidence before anything is called done.
 
## How Tyler ships a feature
 
1. **Describe the feature in one line.** Run `/new-feature <idea>` (e.g. `/new-feature I want the ability to track 'people'`). It reads the product brief, the existing feature docs, and the constitution, then interviews you in rounds — high-level shaping questions first, detail rounds only after those answers are in, every round through the question tool with tappable defaults. It writes `docs/product/features/<name>.md`, keeps the slice thin (~10 acceptance criteria max, splitting anything bigger), and stops for your approval. Prefer to write it by hand? Copy `docs/product/feature-template.md` instead — the worked example is at the bottom.
2. **Start clean, think big.** Fresh Claude Code session from an up-to-date `main`, on a big model (Fable/Opus) for the spec-and-plan stages — that's where model quality pays.
3. **Spec it.** `/speckit.specify @docs/product/features/<name>.md` cuts the feature branch and generates the spec. Answer its clarifying questions; run `/speckit.clarify` if the doc still has open questions.
4. **Plan and tasks.** `/speckit.plan`, then `/speckit.tasks`. Skim the plan as product owner — you're checking "is the described behavior what I meant," not how it's built.
5. **Sanity-check before spending tokens.** `/speckit.analyze` catches spec/plan/tasks contradictions while they're still words; add `/speckit.checklist` when the requirements felt mushy.
6. **Switch to Sonnet and build.** `/model` down, then `/speckit.implement`. Superpowers runs TDD with subagents, and the Stop hook (`.claude/hooks/gate.sh`) blocks Claude from finishing a turn with failing lint/typecheck/tests/build. Let it run — don't steer mid-build; jot concerns down for step 7.
7. **Review evidence, then use it.** The `verifier` and `browser-tester` agents check the work against your acceptance criteria and leave an evidence bundle in `docs/evidence/<name>/` (screenshots + `results.md`, gitignored — scratch evidence, not repo history). Read the bundle, then click around the running app yourself, or point an agent at the work-helper MCP.
8. **Feedback becomes GitHub issues, not chat.** Bugs, gaps, "passes but not what I meant" — file each one and have Claude work the list through the same TDD-and-gate loop. If feedback shifted the scope, update the feature doc so the spec stays the source of truth.
9. **Merge when it's earned.** The GitHub Actions review (`.github/workflows/claude-review.yml`) checks the PR diff against `CLAUDE.md` and the spec; when it's clean, the criteria pass, and you're satisfied — merge, delete the branch, and run `/new-feature` on the next thinnest slice.
One feature in flight at a time until the loop has earned trust (features landing with under one correction cycle, no fake-passing tests on spot checks) — then consider parallel features or unattended runs.
 
## Setup
 
See `docs/setup/setup-report.md` for how this repo's Claude Code environment (plugins, MCP servers, hooks, agents) was configured, what's still pending on your end, and how to verify it after a restart.