# AGENTS.md

## Purpose

This repository hosts an Autodesk Platform Services MCP server deployed on AWS and consumed by Microsoft Copilot through the Model Context Protocol (MCP).

The current system already has a working Autodesk 3-legged OAuth flow, a working `/auth/start` redirect pattern, a working callback flow, and working read tools such as project and user retrieval. Do not break this authentication flow.

This codebase is being organized by Autodesk Platform Services domain/service. Each APS service should live in its own MCP folder and expose narrowly scoped tools.

Current and planned MCP folders follow this pattern:

- `src/mcp-auth`
- `src/mcp-acc-account-admin`
- `src/mcp-acc-issues`
- `src/mcp-acc-assets`
- `src/mcp-acc-sheets`
- `src/mcp-acc-rfis`
- `src/mcp-acc-submittals`

## Non-negotiable rules

1. Do not break Autodesk authentication.
2. Do not remove or bypass `/auth/start`.
3. Do not expose the raw Autodesk authorization URL in visible tool text returned to Copilot.
4. Do not log OAuth codes, access tokens, refresh tokens, PKCE verifier values, or callback query values.
5. Do not broaden data exposure. Prefer summary outputs over raw payload dumps.
6. Do not create generic “fetch everything” tools.
7. For now, all new tools must be read-only.
8. Keep the existing repository structure style and TypeScript conventions.
9. One MCP folder per APS service/domain.
10. Every tool must have a very clear business purpose understandable by non-technical users.

## Deployment context

- Runtime: Node.js / TypeScript
- Deployed on AWS
- Consumed by Microsoft Copilot through MCP over HTTP
- Autodesk authentication uses 3-legged OAuth with PKCE
- Copilot may re-encode long direct authorization URLs, so visible tool output must prefer backend redirect URLs such as `/auth/start`

## Product context

The intended audience is a small engineering group with limited technical fluency. The tools must feel simple and practical. Avoid technical wording in user-facing output whenever possible.

The users mainly treat Autodesk Construction Cloud / Autodesk Forma as a file repository, with selected projects using more advanced modules such as Assets, Sheets, RFIs, Submittals, and Issues.

Therefore:
- prefer report-oriented tools
- prefer summaries, counts, grouped results, and direct ACC links
- avoid returning raw JSON unless debugging
- avoid exposing sensitive fields unless explicitly required

## Security and privacy policy

Default stance: least privilege, least data, least surprise.

### Do not expose by default
- access tokens
- refresh tokens
- auth codes
- PKCE internal values
- raw user IDs unless needed for follow-up logic
- email addresses unless the tool is explicitly approved to return them
- full raw API payloads
- internal debug URLs
- account-wide sensitive metadata not needed by the business flow

### Prefer returning
- counts
- grouped summaries
- filtered lists
- project-level snapshots
- category/status distributions
- deep links to ACC when useful
- safe display fields such as names/titles when business-appropriate

## Tool design rules

Every new tool must satisfy all of the following:

1. Narrow scope
   - A tool should answer one business question, not expose a whole module.

2. Safe output
   - Return a curated payload.
   - Do not dump raw APS responses unless explicitly asked in a debug-only task.

3. Predictable shape
   - Use structured content consistently.
   - Use stable field names.
   - Include summary metadata where appropriate.

4. Read-only for now
   - No create/update/delete actions in this phase.

5. User-context aware
   - Use the existing Autodesk token flow.
   - Preserve session-aware behavior.
   - Do not hardcode assumptions that collapse future multi-user support.

6. Copilot-friendly
   - Tool descriptions must be simple and practical.
   - Outputs should support summary/report experiences inside Copilot.

## Approved first-wave MCP domains

### 1. Assets
Folder: `src/mcp-acc-assets`

Goal:
Provide safe project-level asset reporting.

Examples:
- assets summary by category
- assets summary by status
- assets with selected custom attributes
- assets grouped by assignee/company if available
- project asset dashboard payload

Do not:
- expose raw full asset payloads by default
- create or update assets in this phase

### 2. Sheets
Folder: `src/mcp-acc-sheets`

Goal:
Help PMs find sheets and recover control over documentation.

Examples:
- find sheets by discipline
- find sheet by number
- summarize sheet counts by discipline
- return ACC view link for a selected sheet when possible

Do not:
- return huge raw lists with all fields unless filtered
- implement write flows

### 3. RFIs
Folder: `src/mcp-acc-rfis`

Goal:
Provide project RFI summaries and filtered retrieval.

Examples:
- RFI summary by status
- RFI summary by type
- RFI aging summary
- RFI filtered list for a project
- RFI report enriched with type definitions and selected attributes

Do not:
- expose every field by default
- create/update RFIs in this phase

### 4. Submittals
Folder: `src/mcp-acc-submittals`

Goal:
Provide project submittal reporting.

Examples:
- submittal summary by status
- submittal summary by spec section
- filtered submittal lookup
- submittal report payload for Copilot charts

Do not:
- implement write operations in this phase

### 5. Issues
Folder: `src/mcp-acc-issues`

Goal:
Preserve existing functionality and evolve toward report-oriented outputs.

Examples:
- issue summary by status
- issue summary by type
- issue aging report
- filtered issue report

## Data enrichment rules

Enrichment is encouraged only when it improves clarity for non-technical users.

Allowed enrichment patterns:
- Assets + categories + statuses + custom attribute definitions + selected user display info
- RFIs + RFI types + selected attributes + safe user display info
- Submittals + spec sections + safe summary fields
- Sheets + discipline inference / safe ACC links
- Issues + issue types + custom attribute definitions when relevant

Avoid enrichment that creates massive joins or leaks unnecessary detail.

## Authentication rules

Authentication is already working. Preserve these behaviors:

- backend-generated auth URL
- backend redirect via `/auth/start`
- callback handling via `/auth/callback` and `/aps/callback`
- Autodesk token caching flow
- current working `get_autodesk_auth_status`
- no visible raw Autodesk auth URL in normal Copilot text

Any auth-related refactor must be minimal and must preserve working behavior.

## Legacy HTTP routes

There are legacy HTTP route patterns in the repository from earlier MCP exposure attempts.
Do not expand legacy paths unless explicitly instructed.
Prefer the current active MCP runtime path and working auth flow.

If cleanup is proposed:
- isolate cleanup from behavior changes
- confirm no active route is removed accidentally
- keep changes small and testable

## Required engineering practices

Before finishing work:
- run typecheck
- run tests
- note any gaps in tests
- summarize exactly which files changed
- summarize risks and follow-up items

## Required test coverage for new work

For each new MCP domain/tool set, add tests for:
- input validation
- safe output shape
- no sensitive raw fields in summary tools
- auth flow not broken by the change
- service-level transformation logic

## Output style expected from Codex

When completing a task, report:
1. what changed
2. files changed
3. why the implementation is safe
4. any remaining risks
5. suggested next step

Keep changes surgical. Do not refactor unrelated parts of the codebase.