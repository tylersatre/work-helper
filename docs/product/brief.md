# Product Brief — work-helper

## What it is

work-helper is a self-hosted personal CRM. It's a TypeScript web app that also exposes an MCP server (the "work-helper" MCP), so both Tyler and AI agents can query and act on the same data.

Core concepts:

- **People / contacts** — the central entity everything else links to.
- **Emails** — ingested from Outlook and linked to people.
- **Tasks** — can link to emails and to people.
- **Tags and custom fields** — flexible metadata across people, emails, and tasks.
- **Kanban** — Trello-like lanes, dragging cards between lanes, sorting
  and filtering.

## Roles

- **Tyler (product owner)** writes end-user requirements as user stories
  with Given/When/Then acceptance criteria, and writes acceptance-test
  results after reviewing a feature. He does not write code.
- **Claude Code** does all engineering: turns specs into plans, tasks, and
  implementation, under TDD, with automated and browser-driven
  verification before anything is called done.

## Architecture constraints (decided, not open questions)

- **Language:** TypeScript, for both the web app and the MCP server.
- **MCP server:** built on the official `@modelcontextprotocol/sdk`. No other MCP framework.
- **Email ingestion:** the work-helper server pulls directly from Microsoft Graph (scheduled polling and/or webhook) — ingestion is a server-side concern, not something an AI agent does. AI agents interact with work-helper only as **consumers** of the work-helper MCP's tools (query people/emails/tasks, link records together, manage tags).
- **Deployment:** self-hosted, via Docker.

These constraints are binding. A feature spec that conflicts with one of them needs the constraint changed first (in the constitution), not a workaround built around it.
