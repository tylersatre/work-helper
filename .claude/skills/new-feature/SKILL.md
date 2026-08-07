---
name: "new-feature"
description: Turn a one-line feature idea into a finished feature doc via a product-owner interview
argument-hint: <one-line feature idea>
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/analyze.md"
user-invocable: true
disable-model-invocation: true
---
 
You are helping Tyler, the product owner, turn a rough feature idea into a finished feature document. Tyler does not write these docs or any code — you write the doc; he answers questions and approves.
 
Feature idea: $ARGUMENTS
 
## Before asking anything
 
Read, in order:
 
1. `docs/product/feature-template.md` — the exact structure the output must follow
2. `docs/product/brief.md` — the product context
3. Every existing doc in `docs/product/features/` — so this feature is consistent with, builds on, and doesn't overlap what's already specced
4. Every stub in `docs/product/future/` — the deferred-work backlog. If the idea in $ARGUMENTS matches a stub, say so and use the stub's Origin and Notes as interview input — its recorded decisions are answers you don't need to re-ask. Delete the stub in Finish once the feature doc is approved.
5. The project constitution (`.specify/memory/constitution.md`, or wherever `specify init` placed it) — the definition of done and constraints the criteria must respect
If the idea in $ARGUMENTS is already fully or partly covered by an existing feature doc, say so before interviewing and ask whether to extend that doc or write a new one.
 
## Interview rules
 
- Ask product-owner questions only: user-visible behavior, workflows, edge cases, what "done" looks like. Never ask about implementation, stack, schema, or architecture — those get decided in `/speckit.plan`, not here.
- Before asking anything, think through the feature and build a question plan: list everything you need to know, mark which answers would change other questions, and group into rounds so that (a) every question lands after the answers it depends on, and (b) each round is thematically coherent — a logical decomposition of the feature, not a grab bag.
- Round 1 is always high level: the shaping questions that capture the important information — the problem this solves, the core objects and how they relate to existing ones, the essential workflow, and what makes this feature "done" for Tyler. No detail questions until these answers are in.
- Later rounds drill into whatever the earlier answers opened up. Questions in the same round must be independent of each other; any question whose phrasing or relevance depends on an unanswered question waits for a later round.
- Every round goes through the AskUserQuestion tool — one call per round, 3–5 questions, each with concrete options and a recommended default so Tyler can move fast (he can always type his own answer instead).
- Stop as soon as every acceptance criterion can be written concretely — typically 2–4 rounds. Don't interrogate past that point.
## Scope rules
 
- The doc must describe the thinnest vertical slice that delivers the idea end to end. If the idea is bigger than one slice, propose a split (this slice now, named follow-ups later), confirm it with Tyler, and put everything else under Out of scope. Every named follow-up gets recorded as a stub in Finish — a follow-up that exists only in conversation is lost work.
- Hard cap: ~10 acceptance criteria. More than that means the slice is too fat — split it.
## Writing rules
 
- Follow `docs/product/feature-template.md` exactly: user story, acceptance criteria, out of scope, open questions.
- Acceptance criteria are Given/When/Then and must be executable by the browser-tester against the UI (or, where relevant, by an agent against the work-helper MCP): concrete example data, observable outcomes, no vague words. Quantify anything fuzzy ("recently" becomes a number, "fast" becomes a threshold).
- Anything Tyler answers with "not sure yet" goes in Open questions — never into a guessed criterion.
- Filename: kebab-case slug of the feature, e.g. `docs/product/features/track-people.md`.
## Finish
 
0. Determine where this session is running — it changes where files go and what the last step is. Run `git rev-parse --show-toplevel` and check whether the path is under `.claude/worktrees/` (a native worktree session, the usual case when Tyler starts the idea from a fresh desktop-app session) or is the main checkout itself. In a worktree, the main checkout's path is the first entry of `git worktree list`. Either way the docs land on `main`, and the main checkout is where that commit happens.
1. Write the file — always under the **main checkout's** `docs/product/features/`, even when running in a worktree (the doc must be on `main` before any feature branch can include it).
2. Record deferred work (REQUIRED — do this while the interview context is fresh): for every named follow-up from the scope split, and every Out of scope item that is a real future feature rather than a permanent non-goal, write a stub in `docs/product/future/<name>.md` (again under the main checkout) following `docs/product/future-template.md`. Capture why it was deferred and any decisions the interview already made about it. If a matching stub already exists, update it instead of duplicating. If this feature itself came from a stub, delete that stub.
3. Show Tyler the full doc, a two-line summary of the scope decisions (what's in, what got split out), and the list of stubs created, updated, or deleted.
4. Revise per his feedback until he approves.
5. Once approved, commit the feature doc and any created/updated/deleted stubs directly to `main` from the main checkout and push (verify the main checkout is parked on `main` and up to date first). Product docs are the one exception to the no-direct-commits rule: worktrees branch from `main`, so the doc must be on `main` before the feature session starts. Commit nothing else. Tyler's approval in step 4 is the confirmation for this step — do not ask again before committing.
6. If running in a worktree (step 0): bring the docs into this session's branch with `git merge --ff-only main` (fall back to a plain merge of `main` if it can't fast-forward), then tell Tyler this session doubles as the feature session and the next step is `/speckit.specify @docs/product/features/<file>.md` right here — no new session needed.
7. If running in the main checkout: remind him the next step is a worktree session on a big model — a new desktop-app session (worktree is automatic) or `claude -w <feature-slug>` from the main checkout — then `/speckit.specify @docs/product/features/<file>.md` inside it.
8. Stop. Do not run any speckit commands, do not write code, do not create branches.