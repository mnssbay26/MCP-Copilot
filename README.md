# Autodesk MCP Server

## Project Overview

This repository contains an Autodesk MCP server foundation built in TypeScript for AWS deployment and future multi-MCP expansion. It preserves the current working Autodesk 3-legged OAuth flow, shared APS client, and initial ACC tools while reorganizing the codebase into clearer reusable and domain-specific boundaries.

The current implementation supports:

- Shared Autodesk 3-legged OAuth with PKCE
- Shared Autodesk 2-legged app-context auth for selected account-admin read endpoints
- Replaceable token and OAuth-state cache abstractions
- A reusable APS HTTP client
- Account admin / project-related MCP logic
- Assets reporting MCP logic
- Forms reporting MCP logic
- Issues summary, report, and CSV export MCP logic
- Sheets lookup, summary, report, and CSV export MCP logic
- RFIs reporting MCP logic
- Submittals reporting MCP logic
- Transmittals summary, report, detail, and CSV export MCP logic
- HTTP transport for ECS and stdio fallback for local MCP usage

## Architecture Overview

The repository is organized around reusable infrastructure and domain-specific MCP surfaces:

- `src/shared` contains reusable auth, config, APS client, tool output helpers, and transport bootstrapping.
- `src/mcp-acc-account-admin` contains project, project-user, and project-company logic.
- `src/mcp-acc-assets` contains read-only asset summaries and report logic.
- `src/mcp-acc-forms` contains read-only forms summaries, lookup, and report logic.
- `src/mcp-acc-issues` contains issues-specific logic.
- `src/mcp-acc-rfis` contains read-only RFI summaries, filtered lookup, and report logic.
- `src/mcp-acc-sheets` contains read-only sheet lookup, summary, and ACC-link logic.
- `src/mcp-acc-submittals` contains read-only submittal summaries, filtered lookup, and report logic.
- `src/index.ts` creates the combined server used by the current root runtime while preserving separation between MCP domains.

## Folder Structure

```text
src/
  shared/
    aps/
    auth/
    bootstrap/
    config/
    mcp/
    utils/
  mcp-acc-account-admin/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-assets/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-forms/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-issues/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-rfis/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-sheets/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  mcp-acc-submittals/
    index.ts
    models.ts
    server.ts
    service.ts
    tools.ts
  index.ts
test/
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `APS_CLIENT_ID` | Yes | Autodesk APS OAuth client ID |
| `APS_CLIENT_SECRET` | Yes | Autodesk APS OAuth client secret |
| `APS_CALLBACK_URL` | Yes | Redirect URL registered with Autodesk for the 3-legged OAuth callback |
| `APS_SCOPES` | Yes | Space-separated Autodesk OAuth scopes |
| `APS_ACCOUNT_ID` | Yes | ACC account identifier used for account admin endpoints |
| `APS_REGION` | No | Optional ACC region header override |
| `PORT` | No | Optional HTTP port; defaults internally to `3000` |
| `MCP_TRANSPORT` | No | Optional runtime transport override: `http` or `stdio` |

Example values are in [`./.env.example`](./.env.example).

## Autodesk 3-Legged OAuth Flow

1. `GET /auth/url` creates an Autodesk authorization URL and stores temporary PKCE and OAuth state in the configured `OAuthStateStore`.
2. The user authenticates with Autodesk and Autodesk redirects back to `APS_CALLBACK_URL`.
3. `GET /auth/callback` exchanges the authorization code for Autodesk tokens.
4. Tokens are normalized and cached through the shared `TokenCache`.
5. MCP tools call `getValidAccessToken()` before APS API requests.
6. If the access token is expired and a refresh token is available, the shared auth layer refreshes it automatically.

## App-Context Auth

The `get_project_companies` tool uses a separate shared 2-legged app-context token path under `src/shared/auth`. This flow is isolated from the existing 3-legged user/session token cache and requests only the minimal `account:read` scope needed for the current companies read endpoint.

## Current Tools

The server keeps the existing project and user tools and now standardizes these read-only ACC/Forma domains around a consistent `summary`, `report`, and `export_csv` pattern:

- Issues: `get_issues_summary`, `get_issues_report`, `export_issues_csv`
- RFIs: `get_rfis_summary`, `get_rfis_report`, `export_rfis_csv`
- Submittals: `get_submittals_summary`, `get_submittals_report`, `export_submittals_csv`
- Transmittals: `get_transmittals_summary`, `get_transmittals_report`, `export_transmittals_csv`
- Sheets: `get_sheet_summary`, `get_sheets_summary`, `get_sheets_report`, `export_sheets_csv`
- Forms: `get_forms_summary`, `get_forms_report`, `export_forms_csv`

The earlier lookup tools such as `get_issues`, `find_forms`, `find_sheets`, `find_rfis`, `find_submittals`, `find_transmittals`, and `get_transmittal_details` remain available for narrower follow-up questions.

These tools are read-only and return curated summary/report payloads instead of raw APS module dumps. The existing auth, projects, users, and issues behavior remains in place.

## CSV Exports

Use the `export_*_csv` tools when a chat summary or bounded report is not enough and you need the deeper-detail path.

- Export tools fetch all relevant pages up to explicit safe limits.
- They generate CSV files in backend application code.
- They return artifact metadata such as `fileName`, `rowCount`, `truncated`, `downloadPath`, and `expiresAt` instead of sending CSV bodies inline in chat.
- The current artifact implementation is an in-memory backend route intended for safe single-process use during this phase.

## First Deployment Scope

The first AWS deployment is intentionally limited:

- One ECS task only
- In-memory token cache and OAuth-state cache
- Initial validation target: Autodesk auth flow and `get_projects`

`get_users` and `get_issues` remain implemented and testable, but they are not the primary focus of the first deployment validation cycle.

## First Validation Flow

Use this sequence for the first deployment validation pass:

1. `npm run build`
2. `npm test`
3. `npm run start:http`
4. Open `GET /auth/url`
5. Complete the Autodesk login flow
6. Open `GET /auth/status` and confirm `loggedIn=true`
7. Run `npm run smoke:projects`

The first validation target is auth plus `get_projects` only. `get_users` and `get_issues` remain implemented, but they are not required for the initial deployment validation.

Because the current token cache is in-memory, keep the HTTP server process running while you complete the auth flow and run `npm run smoke:projects`. The smoke script validates against the live server so it can reuse the same cached Autodesk session.

## Current Limitations

- The in-memory `TokenCache` is not safe for multi-task ECS deployments.
- The in-memory `OAuthStateStore` is not safe for distributed callback handling.
- If the auth callback is routed to a different ECS task than the one that generated the auth URL, the OAuth flow can fail.
- Restarting the ECS task clears cached tokens and pending OAuth state.
- The current implementation assumes a single logical in-process session keyed as `default`.

## Future Hardening Recommendations

- Replace the in-memory token and OAuth-state caches with a shared backend such as Redis or DynamoDB.
- Add multi-session handling instead of a single process-level session key.
- Add distributed token refresh coordination for multi-instance deployments.
- Prepare the callback flow and routing assumptions for multi-task ECS behind a load balancer.
- Split deployments by MCP surface when the operational model requires separate account-admin and issues runtimes.

## Local Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

Run the combined server over HTTP:

```bash
npm run start:http
```

Run the combined server over stdio:

```bash
npm run start:stdio
```

Useful HTTP routes:

- `GET /health`
- `GET /auth/url`
- `GET /auth/status`
- `GET /auth/callback`
- `GET /artifacts/:artifactId`
- `ALL /mcp`
