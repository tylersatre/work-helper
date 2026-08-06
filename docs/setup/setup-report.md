# work-helper — Setup Report

Environment setup for the work-helper spec-driven, verification-gated
development harness. Claude Code `2.1.223` (native, darwin-arm64),
`claude doctor` reports no installation issues.

## 1. Configured

**Phase 0 — Audit.** `docs/setup/environment-audit.md`: full inventory of
global plugins, marketplaces, MCP servers, hooks, memory, and personal
agents/skills that could load into this project, with per-item action or
rationale for why none was possible. Commit `bccb1c2`.

**Phase 1 — Repo + isolation.**
- `git init -b main`; `.gitignore` covering Node/TS build artifacts,
  `.env*`, `.claude/settings.local.json`, `docs/evidence/`, Playwright
  output.
- `.claude/settings.json`: `extraKnownMarketplaces` declares
  `superpowers-marketplace` → `obra/superpowers-marketplace`;
  `enabledPlugins` sets `superpowers@superpowers-marketplace: true` and an
  explicit `false` for every other plugin found (enabled or not) in the
  Phase 0 audit; `enabledMcpjsonServers: ["playwright"]`; conservative
  `permissions.allow` (`git`, `npm`, `pnpm`, `npx`).
- `~/.claude.json` → `projects["/Users/tyler/work-helper"].disabledMcpServers`
  extended to cover every non-approved MCP server visible from this
  directory. Verified with a before/after diff that only this project's
  entry changed (all 38 other project entries and all 112 other top-level
  keys byte-identical). Evidence: `docs/setup/environment-audit.md`
  ("MCP servers visible from this directory" table).
- `skillOverrides: {"feature-dev:feature-dev": "off"}` added as
  defense-in-depth (see Deviations — this key's actual effectiveness is
  unverified against a reported bug).
Commit `bccb1c2`.

**Phase 2 — Spec Kit.** `uv tool install specify-cli --from
git+https://github.com/github/spec-kit.git` (already had `uv 0.7.3`);
`specify check` confirmed Claude Code detected; `specify init --here
--integration claude --force` scaffolded `.specify/` (templates, scripts,
workflow) and `.claude/skills/speckit-*/` (see Deviations — this version
installs skills, not `.claude/commands/speckit.*`). Constitution filled in
at `.specify/memory/constitution.md`: spec-is-truth, mandatory TDD,
evidence-over-assertion definition of done, the architecture constraints,
small vertical slices via PR. Commit `bccb1c2`.

**Phase 3 — Superpowers.** `claude plugin marketplace add
obra/superpowers-marketplace` (user scope — permitted exception (b), since
Tyler's existing `superpowers-dev` marketplace points at his own fork, a
different source), then `claude plugin install
superpowers@superpowers-marketplace -s project`. Verified via `claude
plugin list`: `superpowers@superpowers-marketplace` v6.2.0, scope project,
enabled — distinct from and not touching Tyler's `superpowers@superpowers-dev`
(v4.0.3, user scope, stays disabled). Commit `4a3051f`.

**Phase 4 — Verification gate.** `.claude/hooks/gate.sh` (executable):
loop-guards on `stop_hook_active`, no-ops before `package.json` exists,
otherwise runs `npm run {lint,typecheck,test,build} --if-present` and
exits 2 with a truncated failure summary on stderr if any fail. Registered
under `hooks.Stop` in `.claude/settings.json` (`timeout: 600`).
`.claude/agents/verifier.md`: read-only (`Read, Grep, Glob, Bash`),
re-runs checks itself, reports PASS/FAIL per acceptance criterion, never
fixes anything. Evidence — tested directly:
  - `echo '{"stop_hook_active": true}' | gate.sh` → exit `0`
  - `echo '{}' | gate.sh` (no `package.json`) → exit `0`
  - (supplementary, run in an isolated scratch dir, not part of the repo)
    `package.json` with a failing `lint` script → exit `2`, failure
    printed to stderr
Commit `a46f739`.

**Phase 5 — Browser acceptance testing.** `.mcp.json`: project-scoped
`playwright` server (`npx @playwright/mcp@latest`), approved via Phase 1's
`enabledMcpjsonServers`. `.claude/agents/browser-tester.md`:
`tools: Read, mcp__playwright__*` (server-wildcard grant, confirmed
current syntax against `code.claude.com/docs/en/sub-agents.md`),
`isolation: worktree`; drives Given/When/Then criteria against a given
base URL, writes screenshots + `results.md` to
`docs/evidence/<feature>/` (gitignored), never edits application code.
Commit `72cae59`.

**Phase 6 — CI review.** `.github/workflows/claude-review.yml`: triggers
on `pull_request` (`opened`, `synchronize`); `anthropics/claude-code-action@v1`;
prompt reviews the diff against `CLAUDE.md` and the feature's spec/
acceptance criteria, explicitly flagging skipped TDD, hollow tests, and
unverified "done" claims; references `secrets.ANTHROPIC_API_KEY` (not
hardcoded). Shape verified live against the action's own README and
`docs/solutions.md` via `gh api repos/anthropics/claude-code-action/contents/...`
(current pattern uses `actions/checkout@v6` and the `prompt`/`claude_args`
inputs — see Deviations). Commit `72cae59`.

**Phase 7 — Operating docs.** `CLAUDE.md` (lean: what/who, the loop,
definition of done, architecture constraints, conventions);
`docs/product/brief.md` (full product context); `docs/product/feature-template.md`
(Given/When/Then PRD template with a filled-in `link-email-to-contact`
example); `README.md` (what this repo is + the 6-step "how Tyler ships a
feature" loop, using this install's actual `/speckit-*` command names).
Commit `792b0ec`.

**Phase 8 — Final verification.** `claude doctor`: no installation
issues. This report. All work committed; `git status` clean at time of
writing.

## 2. Disabled at project level

| Mechanism | Keys/entries written |
|---|---|
| `.claude/settings.json` → `enabledPlugins` | `feature-dev@claude-code-plugins`, `superpowers@superpowers-dev`, `ralph-wiggum@claude-code-plugins`, `feature-dev@claude-plugins-official`, `plugin-dev@claude-code-plugins`, `vue-ts-lsp@vue-ts-lsp`, `php-lsp@claude-plugins-official`, `rust-analyzer-lsp@claude-plugins-official`, `phpstorm-plugin@phpstorm-marketplace`, `planning-with-teams@planning-with-teams`, `query@contextify`, `typescript-lsp@claude-plugins-official` — all explicit `false` |
| `.claude/settings.json` → `skillOverrides` | `"feature-dev:feature-dev": "off"` (defense-in-depth; see Deviations) |
| `~/.claude.json` → `projects["/Users/tyler/work-helper"].disabledMcpServers` | `Plans`, `sequential-thinking` (already present — see audit note on the `/mcp` dismissal at session start), plus newly added: `claude.ai Trello`, `claude.ai Outlook`, `claude.ai Stripe`, `claude.ai Microsoft 365`, `claude.ai Todoist`, `claude.ai LE Admin`, `claude.ai Liftosaur`, `claude.ai Google Calendar`, `claude.ai Google Drive`, `claude.ai Gmail`, `claude.ai Ref` |

Intended active set once a fresh session picks this up: **plugins** =
`superpowers@superpowers-marketplace` only; **MCP** = `playwright` only;
**agents** = `verifier` + `browser-tester`; **hooks** = the gate (plus the
two global hooks below, which have no kill switch).

## 3. Could not be disabled per-project

| Item | Impact | Recommendation |
|---|---|---|
| Global `SessionStart` hook `~/.ref/session-start-hook.sh` | Injects an `additionalContext` nudge on every session start pointing at a "planning-guidance Manual" tool on the (now project-disabled) Plans MCP server. Inert here — the tool it points to won't be reachable — but adds noise to every session's opening context. | No action needed; harmless. If it bothers Tyler he'd remove/edit it in `~/.claude/settings.json`, outside this project's scope. |
| Global `Stop` hook `node ~/.ref/stop-contract-hook.mjs` | **Flagged per the ground rules.** A second Stop hook (a "terminal contract" gate for a separate Ref/Plans-based agent loop) runs alongside this project's own `gate.sh` on every turn-end. By its own documented allowlist it should exit 0 silently here (planning-guidance is never read in this project once Plans is disabled), but it's still an extra process on every Stop event that this project doesn't control. | Low risk, but worth Tyler knowing it's there. If it ever nudges/blocks unexpectedly in this project, the fix is in `~/.ref/`, not in work-helper. |
| Personal commands `~/.claude/commands/requirements-*.md` (6 files) | Surfaced to every project as invocable `/requirements-*` skills. Low impact — user-invoked only, doesn't auto-run, doesn't collide with `speckit-*` names. | No action; document only, per the "no per-project mechanism → document" rule. |
| `claude.ai`-scoped MCP connectors (Trello, Outlook, Stripe, M365, Todoist, LE Admin, Liftosaur, Google Calendar/Drive/Gmail, Ref) | Added to this project's `disabledMcpServers`, but `claude mcp get` reports these at `Scope: claude.ai config` — distinct from the `User config` scope that `Plans`/`sequential-thinking` sit at, which is the scope the per-project array is documented against. Whether the array actually suppresses account-level connectors, versus them being pinned on everywhere, is **unverified** — MCP activation only takes effect on a fresh session, and there's no local preview. | **Needs Tyler**: after restart, run `/mcp` in this directory and confirm these show disabled. If any still connect, that confirms account-level connectors sit outside local project control, and disabling them for real means disconnecting them from claude.ai's connector settings (which would turn them off everywhere, not just here). |

## 4. Deviations

| Instruction said | Actual current behavior | What was done instead |
|---|---|---|
| `.claude/commands/` would contain `speckit.*` commands | This Spec Kit build (HEAD of `github/spec-kit`, `specify-cli` 0.16.1.dev0) installs `.claude/skills/speckit-*/SKILL.md` — skills, not commands — invoked as `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-constitution`, plus optional `/speckit-clarify`, `/speckit-analyze`, `/speckit-checklist`, `/speckit-converge`, `/speckit-taskstoissues` (hyphen, not dot). | Used the real install location and command names throughout `CLAUDE.md`, `README.md`, and this report. Verified with `ls .claude/skills/`. |
| `skillOverrides` key exact shape unverified in the instructions | Confirmed real (`"skill-name": "on"\|"off"\|"name-only"\|"user-invocable-only"`) via live research, but documented as designed for user-vs-repo skill precedence rather than plugin-skill suppression, and a reported GitHub issue (#54996) says `"off"` may not actually block invocation in some versions. | Set it anyway as a harmless defense-in-depth entry; the reliable mechanism for the one plugin skill in scope (`feature-dev:feature-dev`) is disabling its plugin via `enabledPlugins`, which was also done. Flagged in the audit and above — don't treat `skillOverrides` alone as proof it's off. |
| CI workflow shape given from memory/pattern | Verified live against `anthropics/claude-code-action`'s current README and `docs/solutions.md` via `gh api`. Current pattern uses `actions/checkout@v6` (not v4) and the unified `prompt`/`claude_args` inputs (v1.0 shape). | Used the verified-current shape in `.github/workflows/claude-review.yml`. |
| Subagent `tools:` frontmatter for "the Playwright MCP tools" | Individual tool names weren't enumerated in the instructions, and hardcoding them would go stale across `@playwright/mcp` versions. Confirmed via live docs (`code.claude.com/docs/en/sub-agents.md`) that `mcp__<server>__*` is a supported wildcard grant. | `browser-tester.md` uses `tools: Read, mcp__playwright__*`. |
| SessionStart hook additional context instructed reading a "Plans MCP Manual tool, topic planning-guidance" before the first command | No such tool exists in this session's toolset — searched directly (`ToolSearch` for "Manual", "Plans", "planning-guidance") and via the `Plans` MCP server's resource listing; nothing matched. This instruction originates from Tyler's own global `~/.ref/session-start-hook.sh` (a personal automation unrelated to this task), not from the work-helper setup instructions. | Proceeded without it; documented here rather than blocking. Now moot anyway, since `Plans` is disabled for this project. |

## 5. Needs Tyler

- **Restart Claude Code in this directory** and accept the workspace trust
  prompt (this session ran in an already-trusted state; a fresh session
  is what actually activates the project's plugin/MCP/skill config).
- Then run, in order:
  - `/plugin` — confirm `superpowers` is the only enabled plugin for this
    project.
  - `/mcp` — confirm `playwright` connects, and that `Plans`,
    `sequential-thinking`, and every `claude.ai *` connector show as
    disabled (this is the check that resolves the "unconfirmed" row in
    section 3 above).
  - `/agents` — confirm `verifier` and `browser-tester` are listed.
  - `/hooks` — confirm the gate is registered under Stop (alongside the
    global one from `~/.ref/`).
  - `/context` — confirm nothing unexpected loaded.
- First Playwright run downloads browsers (via `npx @playwright/mcp@latest`) —
  expect a delay on the first `browser-tester` invocation.
- GitHub: create the repo, push this branch, run `/install-github-app` (or
  add `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` manually per
  `anthropics/claude-code-action`'s setup docs), then confirm
  `claude-review.yml` actually runs on a test PR.
- Decide whether the "could not verify claude.ai connector disable"
  situation (section 3) is acceptable, or whether those connectors should
  be disconnected from claude.ai's connector settings for real isolation.
- Optional cleanup: the personal `~/.claude/commands/requirements-*.md`
  commands and the two global `~/.ref/` hooks are outside this project's
  control; only touch them if they turn out to be a real nuisance while
  working in work-helper.
