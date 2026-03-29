# Autodesk ACC/APS MCP Server

## Purpose

This repository hosts an Autodesk Platform Services MCP server used by Microsoft Copilot over MCP HTTP. The server is organized by Autodesk domain, keeps the Autodesk 3-legged OAuth flow working, and exposes read-only ACC/APS tools that favor concise summaries, bounded reports, and CSV artifacts over raw payload dumps.

The existing `/auth/start` redirect pattern is a core part of the current deployment model and must remain intact.

## Current Architecture

- Runtime: Node.js and TypeScript
- Primary transport: HTTP MCP on `POST /mcp`
- Local fallback transport: stdio
- Combined server entrypoint: `src/index.ts`
- Shared infrastructure lives under `src/shared`
- Each APS/ACC service domain lives in its own `src/mcp-*` folder
- Shared helpers currently cover APS HTTP access, auth, user display-name enrichment, bounded retrieval metadata, and CSV artifact creation

## Active MCP Domains

| Domain | Status | Notes |
| --- | --- | --- |
| Auth | Active | Autodesk auth-start URL, auth status, and disconnect tools |
| Account Admin | Active | Projects, project users, and app-context project companies |
| Assets | Active | Summary and report tools |
| Issues | Active | Legacy list plus summary, report, and CSV export |
| Sheets | Active | Lookup, summary, report, and CSV export |
| RFIs | Active | Summary, breakdown, lookup, report, and CSV export |
| Submittals | Active | Summary, breakdown, lookup, report, and CSV export |
| Forms | Active | Summary, lookup, report, and CSV export |
| Transmittals | Active | Summary, lookup, report, detail, and CSV export |
| Data Management | Active | Folder traversal, item lookup, versions, and model-file discovery |
| APS Viewer Payload | Present but non-core | Payload-only helpers; not a supported Copilot viewer experience |

The current tool contracts are frozen in [docs/tool-contracts.md](./docs/tool-contracts.md).

## Auth Model

### User-context auth

Most tools use Autodesk 3-legged OAuth with PKCE and support an optional `sessionKey` so sessions can be isolated per user or workflow.

User-context auth routes:

- `GET /auth/url`
- `GET /auth/status`
- `GET /auth/start`
- `GET /auth/callback`
- `GET /aps/callback`

Important behavior:

- `get_autodesk_auth_url` returns a backend `/auth/start` URL, not a raw Autodesk authorization URL
- `/auth/start` performs the redirect to Autodesk
- tokens and OAuth state are cached in memory today

### App-context auth

`get_project_companies` intentionally uses a separate 2-legged app-context flow and does not accept `sessionKey`.

## Tool Output Pattern

The repository now uses a few stable output styles:

- `summary`: concise counts and grouped breakdowns for Copilot chat
- `report`: bounded detail rows plus summary counts, warnings, and retrieval metadata
- `export_csv`: server-generated CSV artifact metadata, not inline CSV content
- `lookup`: direct list or record retrieval for follow-up questions
- `auth`: auth bootstrap/status/disconnect actions

Where implemented, report-style outputs expose bounded retrieval metadata through a `retrieval` object with fields such as:

- `totalFetched`
- `pageCount`
- `sourceTruncated`
- `rowsTruncated`
- `truncated`
- `safeLimitReached`

Many read domains also enrich user references into display names when possible. By default, report-style domains avoid exposing email addresses. One important existing exception is `get_users`, which still returns email because that is part of its current contract.

## CSV Artifacts

The `export_*_csv` tools are the current "full pull / deeper detail" path when a chat summary is not enough.

- CSV files are generated in backend application code
- tool responses return metadata such as `fileName`, `rowCount`, `truncated`, `downloadPath`, and `expiresAt`
- the CSV body is not returned inline in chat
- artifacts are currently served from `GET /artifacts/:artifactId`

The artifact store is in-memory and process-local. It is useful for the current single-process phase, but it is not a durable multi-instance export system.

## Viewer Scope

APS Viewer embedding inside Microsoft Copilot chat is intentionally out of scope in the current repository.

- viewer payload tools, if present, are exploratory/internal helpers only
- no Teams app viewer integration is being pursued here
- no external HTML viewer hosting pattern is being promoted here
- the repo does not currently treat viewer payloads as a core supported end-user experience

## HTTP Routes

Primary routes:

- `GET /health`
- `GET /auth/url`
- `GET /auth/status`
- `GET /auth/start`
- `GET /auth/callback`
- `GET /aps/callback`
- `POST /mcp`
- `GET /.well-known/mcp.json`
- `GET /artifacts/:artifactId`
- `GET /internal/smoke/projects`

Legacy routes still present from earlier MCP exposure attempts:

- `POST /mcp/tools/list`
- `POST /mcp/resources/list`
- `POST /mcp/tools/execute`
- `POST /` JSON-RPC gateway

These legacy routes remain in the repo, but they are not the recommended primary contract for current Copilot rollout work.

## Local Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

Run over HTTP:

```bash
npm run start:http
```

Run over stdio:

```bash
npm run start:stdio
```

## Testing And Validation

Current validation workflow:

1. Run `npm run typecheck`
2. Run `npm test`
3. Start the server with `npm run start:http`
4. Validate auth through `/auth/start` or `get_autodesk_auth_url`
5. Confirm `/auth/status`
6. Validate selected tools in Postman before broader rollout

Recommended current practice is to use Postman for auth and tool smoke testing before expanding tenant usage inside Copilot.

## Current Limitations

- `TokenCache` is in-memory
- OAuth state storage is in-memory
- CSV/export artifacts are stored in-memory
- artifact download paths are single-process only
- the current server is not yet ready for durable multi-instance production operation
- a restart clears cached auth state and export artifacts
- some legacy MCP manifest/gateway files are still present and do not fully represent the combined server's current tool surface

## Short-Term Engineering Reality

This repository is currently optimized for:

- preserving the working Autodesk auth flow
- read-only ACC/APS retrieval
- bounded Copilot-friendly outputs
- cautious validation in local and Postman flows before broader rollout

It is not yet a hardened distributed production platform for durable auth state, durable artifacts, or a supported Viewer-in-Copilot experience.
