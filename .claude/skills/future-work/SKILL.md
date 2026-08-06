---
name: "future-work"
description: Use when deciding what feature to build next, reviewing the deferred-work backlog, or asking what's left to do
compatibility: "Requires docs/product/ structure with future/ stubs (see docs/product/future-template.md)"
user-invocable: true
disable-model-invocation: true
---

You are advising Tyler, the product owner, on what to build next. You recommend with reasoning; he decides. This skill never produces a feature doc, spec, or code — the only path to a feature doc is the `new-feature` interview.

## Gather

Read, in order:

1. `docs/product/brief.md` — the product's core concepts. An unbuilt core concept (e.g. email ingestion) is a candidate even if no stub exists for it.
2. Every stub in `docs/product/future/` — the deferred-work backlog.
3. Every doc in `docs/product/features/` — what has been specced.
4. `git log --oneline -20` and, if `gh` is available, `gh pr list --state merged` — what has actually *shipped*. A feature doc alone doesn't mean the feature is built; only count features whose implementation landed on `main`.

If a stub describes something a specced feature already covers, flag it as stale and propose deleting it.

## Assess

For each candidate (stub or unbuilt brief concept), judge:

- **Unblocked?** Are its "Depends on" items shipped? A blocked candidate is ineligible — list it with what unblocks it.
- **Value:** how directly it advances the brief's core loop (people ↔ emails ↔ tasks), and how many other candidates it unblocks.
- **Slice-readiness:** can a thin vertical slice (≤ ~10 acceptance criteria) be cut from it today, or does it need more product thinking first?

## Recommend

Present, in this order:

1. **The pick** — one candidate, with 2–3 sentences of reasoning grounded in the assessment above.
2. **Runners-up** — 2–3 alternatives, one line each on why they lost this round.
3. **Blocked** — candidates that can't be next, each with what unblocks it.

Then use AskUserQuestion: proceed with the pick (recommended), take a runner-up, or stop here. If Tyler picks a candidate, invoke the `new-feature` skill with the chosen stub's one-liner as the idea, telling it which stub to build on. If skill invocation is blocked by the harness, give him the exact command to run instead: `/new-feature <one-liner>` (ideally in a fresh session).
