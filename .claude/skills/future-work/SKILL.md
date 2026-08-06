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
4. `git log --oneline -20` and, if `gh` is available, `gh pr list --state merged` — what has actually *shipped*. A feature doc alone doesn't mean the feature is built: "shipped" means the implementation landed on `main`. Judge that from merged PRs and implementation artifacts (schema, `specs/`, `src/`), never from a doc's presence in git — a staged or committed doc proves nothing about the code.

After reading all of the above: if a stub describes something a specced feature already covers, flag it as stale and propose deleting it.

## Assess

Candidates come in three classes, each with a different next action:

- **a. Stubs** in `docs/product/future/` → next action is the `new-feature` interview.
- **b. Unbuilt brief concepts with no stub** — anything the brief names as part of the product (core concepts and the MCP server alike) that has no feature doc and no stub → next action is the `new-feature` interview. With no stub there is no Depends on section: infer dependencies from the brief and the feature docs' Out of scope lists. If a specced feature partially covers the concept, the candidate is the uncovered remainder.
- **c. Specced but unshipped** — a `docs/product/features/` doc whose implementation never landed on `main` → next action is `/speckit-specify @docs/product/features/<file>.md` in a fresh session from clean `main`. Never send these through `new-feature`; the interview already happened and the doc is finished.

For each candidate, judge:

- **Unblocked?** Are its "Depends on" items shipped (by the definition above)? A blocked candidate is ineligible — list it with what unblocks it.
- **Value:** how directly it advances the brief's core loop (people ↔ emails ↔ tasks), and how many other candidates it unblocks.
- **Slice-readiness:** judged by open product questions, not a criteria count (stubs carry no acceptance criteria by design): are the unknowns in its Notes few and answerable in one `new-feature` interview, or does it need more product thinking first? Class-c candidates skip this test — their slice is already cut and approved.

## Recommend

Present, in this order:

1. **The pick** — one candidate, with 2–3 sentences of reasoning grounded in the assessment above, plus its class-determined next action.
2. **Runners-up** — 2–3 alternatives, one line each on why they lost this round.
3. **Blocked** — candidates that can't be next, each with what unblocks it.
4. **Stale** — only if the Gather step flagged any: stubs already covered by a specced feature, each with a proposal to delete.

Then use AskUserQuestion: proceed with the pick (recommended), take a runner-up, or stop here. When Tyler picks a candidate, the handoff follows its class:

- **Class a or b** (stub / no-stub concept): `new-feature` is user-invocable only — the Skill tool cannot launch it. Give him the exact command to run, ideally in a fresh session: `/new-feature <one-liner>` — and for a stub, name the stub file so the interview builds on its Notes.
- **Class c** (specced but unshipped): do not invoke anything — give him the exact command to run in a fresh session from clean `main`, big model: `/speckit-specify @docs/product/features/<file>.md`.
