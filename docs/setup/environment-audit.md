# Environment Audit — work-helper

Generated during Phase 0 setup. Inventories everything in the global Claude Code
environment that could load into sessions run from `/Users/tyler/work-helper`,
and records what was done about it in later phases (see cross-references).

Evidence commands run: `claude --version`, `cat ~/.claude/settings.json`,
`cat ~/.claude/settings.local.json`, `cat ~/.claude/CLAUDE.md`,
`ls ~/.claude/agents ~/.claude/skills`, `claude plugin list`,
`claude plugin marketplace list`, `claude mcp list` (run from this directory),
`claude mcp get <name>`, direct reads of `~/.claude.json`.

Claude Code version at audit time: `2.1.223`.

## Plugins

| Plugin | Marketplace | Scope(s) seen | Enabled globally? | Per-project disable exists? | Action taken |
|---|---|---|---|---|---|
| feature-dev | claude-code-plugins | user, local | **Yes** (`enabledPlugins["feature-dev@claude-code-plugins"]: true` in `~/.claude/settings.json`; also shows enabled at "local" scope) | Yes — `enabledPlugins` key in project `.claude/settings.json` overrides | Set `"feature-dev@claude-code-plugins": false` in project settings (Phase 1) |
| superpowers | superpowers-dev (Tyler's fork, `tylersatre/superpowers`) | user | No (already `false`) | Yes | Pinned explicit `false` for defense-in-depth (Phase 1). **Not** the plugin we want — the approved stack uses `obra/superpowers-marketplace` instead, added as a new marketplace (Phase 1/3). |
| ralph-wiggum | claude-code-plugins | user | No | Yes | Pinned explicit `false` |
| feature-dev | claude-plugins-official | user | No | Yes | Pinned explicit `false` |
| plugin-dev | claude-code-plugins | user | No | Yes | Pinned explicit `false` |
| vue-ts-lsp | vue-ts-lsp | user | No | Yes | Pinned explicit `false` |
| php-lsp | claude-plugins-official | user | No | Yes | Pinned explicit `false` |
| rust-analyzer-lsp | claude-plugins-official | user | No | Yes | Pinned explicit `false` |
| phpstorm-plugin | phpstorm-marketplace | project (some other project) | No | Yes | Pinned explicit `false` |
| planning-with-teams | planning-with-teams | local | No | Yes | Pinned explicit `false` |
| query | contextify | user | No | Yes | Pinned explicit `false` |
| typescript-lsp | claude-plugins-official | project (×3, other projects) | No | Yes | Pinned explicit `false` |

Only `feature-dev@claude-code-plugins` was actually active globally; everything
else was already disabled at the user level. Per the ground rules we still pin
every known plugin to an explicit `false` in this project's `enabledPlugins`
map (alongside `superpowers@superpowers-marketplace: true`) so a future global
enable can't silently light something up here.

**Known gotcha confirmed:** `enabledPlugins` must live in the project's
`settings.json`, not `settings.local.json` — the latter is ignored for this
key. See Phase 1.

## Marketplaces already known globally

`claude plugin marketplace list`: `superpowers-dev` (github `tylersatre/superpowers`),
`claude-code-plugins` (github `anthropics/claude-code`), `planning-with-teams`
(github `OthmanAdi/planning-with-teams`), `claude-plugins-official` (git
`anthropics/claude-plugins-official`), `tylers-other-marketplace` (directory
`/Users/tyler/vue-ts-lsp`), `vue-ts-lsp` (github `tylersatre/vue-ts-lsp`),
`phpstorm-marketplace` (github `jetbrains/phpstorm-claude-marketplace`).

None of these is `obra/superpowers-marketplace`. It was added fresh as
`superpowers-marketplace` in project settings (Phase 1/3) — permitted
exception (b), since it doesn't touch any of Tyler's existing marketplaces.

## MCP servers visible from this directory (`claude mcp list`)

| Server | Scope (`claude mcp get`) | Status at audit time | Per-project disable exists? | Action taken |
|---|---|---|---|---|
| Plans (`api.plan.ref.tools`) | User config (all projects) | Connected | Yes — `projects["/Users/tyler/work-helper"].disabledMcpServers` in `~/.claude.json` | **Already present** in that array before this session started (Tyler appears to have toggled it via `/mcp` before handing off this task — see note below). Left in place. |
| sequential-thinking (`npx @modelcontextprotocol/server-sequential-thinking`) | User config (all projects) | Connected | Yes, same mechanism | **Already present**, same as above. Left in place. |
| claude.ai Trello | claude.ai config | Connected | Unconfirmed — same array accepts the name, but this scope is account-level, not local-CLI-managed | Added to `disabledMcpServers` for this project (Phase 1). See caveat below. |
| claude.ai Outlook | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai Stripe | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai Microsoft 365 | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai Todoist | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai LE Admin | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai Liftosaur | claude.ai config | Connected | Unconfirmed | Added, same caveat |
| claude.ai Google Calendar | claude.ai config | Needs auth (inactive anyway) | Unconfirmed | Added, same caveat |
| claude.ai Google Drive | claude.ai config | Needs auth (inactive anyway) | Unconfirmed | Added, same caveat |
| claude.ai Gmail | claude.ai config | Needs auth (inactive anyway) | Unconfirmed | Added, same caveat |
| claude.ai Ref | claude.ai config | Needs auth (inactive anyway) | Unconfirmed | Added, same caveat |

**Note on Plans/sequential-thinking already being disabled:** the conversation
that opened this session began with a `/mcp` command whose stdout was "MCP
dialog dismissed" before this setup prompt was issued. The project's entry in
`~/.claude.json` already carries `"disabledMcpServers": ["Plans",
"sequential-thinking"]` and has non-zero session history for this path even
though the directory was empty — consistent with Tyler having opened `/mcp`
and toggled those two off first. Nothing to redo there; it's recorded here for
traceability.

**Caveat on `claude.ai *` connectors:** `claude mcp get` reports these at
`Scope: claude.ai config`, distinct from `Scope: User config` for Plans and
sequential-thinking. The `disabledMcpServers` project array is the documented
mechanism (and the CLI has no `claude mcp disable` subcommand — only
`add`/`remove`/`get`/`list`/`login`/`logout`), so the same array is used for
both. Whether the claude.ai-scoped connectors actually honor a *project-local*
disable (versus being pinned on for the whole account) could not be verified
in this session — MCP activation only takes effect on a fresh session per the
restart caveat, and `claude mcp list` has no per-project preview mode. **Needs
Tyler:** after restarting in this directory, run `/mcp` and confirm these are
listed as off; if any still connect, that confirms account-level connectors
sit outside local project control and the recommendation is to disconnect
them from the claude.ai connector settings for any session where they
shouldn't be reachable (accepting that they'd then be off everywhere, not
just here).

## Global hooks

| Hook | Event | Source | Per-project disable? | Conflict with this project's verification gate? | Action |
|---|---|---|---|---|---|
| `/Users/tyler/.ref/session-start-hook.sh` | SessionStart (`startup\|resume\|clear\|compact`) | `~/.claude/settings.json` | **No** — hooks from user settings merge with project hooks; there is no per-project suppression of a specific global hook | No — informational only, injects a prompt nudge (`additionalContext`) pointing at a "planning-guidance Manual" tool on the **Plans** MCP server. Since Plans is disabled for this project, that tool won't be reachable here; the nudge will just be inert extra context on every session start. | None available; documented here. Low impact. |
| `node "/Users/tyler/.ref/stop-contract-hook.mjs"` | Stop (no matcher) | `~/.claude/settings.json` | **No** | **Yes — flagged.** This is a "terminal contract" gate for a separate local-agent loop tied to the same Plans/Ref system. It reads stdin JSON, and by its own documented allowlist it exits 0 (allow, silent) when `stop_hook_active` is true, when fewer than its configured minimum tool calls happened, or **when "planning-guidance was never read"** — which will be every session here, since the Plans MCP server is disabled for this project. So in practice it should stay silent in this project. But it is still a **second Stop hook** that will run alongside this project's own `.claude/hooks/gate.sh` (Phase 4) on every turn-end, adding latency and a second point of failure outside this project's control. | No per-project kill switch exists. Documented; flagged as a known interaction for Tyler to be aware of. If it ever nudges/blocks unexpectedly in this project, the fix is on Tyler's side (in `~/.ref/`), not in work-helper. |

## `skillOverrides` research (Phase 1 step 4)

Researched via a fresh `claude-code-guide` agent (own web search, not
memory) since this key isn't documented in anything read so far this
session: `skillOverrides` is a real `settings.json` key (`"skill-name":
"off"|"on"|"name-only"|"user-invocable-only"`), but per its GitHub issue
history it is designed for user-vs-repo skill precedence, not specifically
for suppressing plugin-provided skills, and a reported bug (issue #54996)
says `"off"` may not actually prevent invocation in some versions. The
reliable mechanism for the one plugin-provided skill in scope here
(`feature-dev:feature-dev`, from the `feature-dev` plugin) is disabling the
plugin itself via `enabledPlugins` (done above). `skillOverrides` was still
added to `.claude/settings.json` as a defense-in-depth `"off"` entry for
that same skill, but it should **not** be treated as the thing actually
doing the work — verify post-restart via `/context` or by checking that
`/speckit-specify`-style feature-dev commands don't appear.

## Global memory (`~/.claude/CLAUDE.md`)

File exists but is **empty** (0 bytes, last modified 2026-03-24). Nothing to
document or reconcile with this project's `CLAUDE.md` (Phase 7).

## Global personal agents/skills

- `~/.claude/agents/` — empty directory. No personal agents to disable.
- `~/.claude/skills/` — empty directory. No personal skill-dir skills to
  disable.
- `~/.claude/commands/requirements-*.md` (6 files: `requirements-start`,
  `requirements-current`, `requirements-status`, `requirements-list`,
  `requirements-remind`, `requirements-end`) — personal user-level slash
  commands, surfaced to every project (including this one) as invocable
  skills. **No per-project mechanism exists to hide an individual personal
  command.** Impact is low: they only run when explicitly invoked
  (`/requirements-*`), they don't auto-inject behavior, and they don't
  conflict with Spec Kit's `speckit.*` commands (different names). Documented
  here per the "no per-project mechanism → document with impact" rule;
  no action taken. Recommendation: ignore unless Tyler wants a fully sterile
  command palette, in which case move them out of `~/.claude/commands/`
  globally (outside this project's control either way).
- Built-in/product skills (`dataviz`, `artifact-design`, `artifact-diagramming`,
  `artifact-capabilities`, `update-config`, `keybindings-help`, `simplify`,
  `fewer-permission-prompts`, `loop`, `schedule`, `claude-api`, `run`, `init`,
  `security-review`) are bundled with Claude Code itself (no `plugin:` prefix,
  no marketplace source) — out of scope for "global config" disabling; they
  ship with every install and aren't part of Tyler's personal customization.
  `feature-dev:feature-dev` **is** plugin-provided (from the `feature-dev`
  plugin) and is covered by the plugin disable above.

## Env vars

`~/.claude/settings.json` sets `REF_API_KEY` globally — feeds the (now
project-disabled) Plans MCP server's auth header. Harmless with Plans off;
no action needed.

## Summary of what's left after Phase 1

Intended active set for this project once `.claude/settings.json` is in place
and a fresh session picks it up: plugins = `superpowers@superpowers-marketplace`
only; MCP = `playwright` only (project `.mcp.json`, approved via
`enabledMcpjsonServers`); all other plugins pinned `false`; all other
MCP servers (that can be) listed in `disabledMcpServers` for this project path.
Un-disable-able residue: the two global hooks above, and the personal
`requirements-*` commands. See `docs/setup/setup-report.md` for the final,
consolidated version of this table after all phases ran.
