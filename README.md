# Autodesk MCP Server Foundation

This repository contains a smaller, cleaner Autodesk MCP server foundation derived from the authentication flow and ACC endpoint strategy used in `D:\Github\TAD_MCP_ACC`.

## Current Scope

- Autodesk 3-legged OAuth with PKCE
- Replaceable token-cache abstraction with an in-memory implementation
- Shared APS HTTP client with retries, timeouts, and typed errors
- MCP tools:
  - `get_projects`
  - `get_users`
  - `get_issues`
- Streamable HTTP transport for AWS/ECS, plus stdio fallback for local MCP usage

## Auth Flow

1. `GET /auth/url` generates an Autodesk authorization URL and stores temporary PKCE/state data in the configured `OAuthStateStore`.
2. The user authenticates with Autodesk and is redirected back to `APS_CALLBACK_URL`.
3. `GET /auth/callback` exchanges the authorization code for tokens and stores the normalized token in the configured `TokenCache`.
4. MCP tools reuse `getValidAccessToken()` for all APS calls.
5. Expired access tokens are refreshed automatically when a refresh token is available.

## Required Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `APS_CLIENT_ID` | Yes | Autodesk APS OAuth client ID |
| `APS_CLIENT_SECRET` | Yes | Autodesk APS OAuth client secret |
| `APS_CALLBACK_URL` | Yes | Redirect URL registered with Autodesk, usually `/auth/callback` |
| `APS_SCOPES` | Yes | Space-separated Autodesk OAuth scopes |
| `APS_ACCOUNT_ID` | Yes | ACC account ID for account/project endpoints |
| `APS_REGION` | No | Optional ACC region header for admin endpoints |
| `PORT` | No | HTTP port, defaults to `3000` |
| `MCP_TRANSPORT` | No | `http` or `stdio`, defaults to `http` |

See [.env.example](/d:/Github/MCP-Copilot/.env.example) for a minimal template.

## Running Locally

```bash
npm install
npm run build
npm run start:http
```

Useful local routes:

- `GET /health`
- `GET /auth/url`
- `GET /auth/status`
- `GET /auth/callback`
- `ALL /mcp`

For stdio transport:

```bash
npm run start:stdio
```

## Current ECS Limitation

The default cache implementations are intentionally in-memory only. That keeps the initial foundation small and stateless from a code-structure perspective, but it has an important production limitation:

- Tokens are not shared across ECS tasks.
- Pending OAuth PKCE state is not shared across ECS tasks.
- If the authorization callback lands on a different task than the one that created the auth URL, the callback can fail.
- A container restart clears all cached auth state.

This is acceptable for the initial foundation but not sufficient for a durable multi-task ECS deployment.

## Recommended Production Cache Options

Replace the in-memory cache implementations with a shared backend such as:

- Redis / ElastiCache for fast token and OAuth-state storage
- DynamoDB for durable shared token and state records
- Secrets Manager only if paired with a separate coordination strategy

## TODOs For Production Hardening

- Replace the in-memory `TokenCache` and `OAuthStateStore` with a shared backend for ECS.
- Add multi-session or user-aware cache keys instead of the current default process-level session.
- Add distributed refresh coordination if multiple workers can refresh the same token.
- Harden the callback flow behind HTTPS and load balancer routing.
- Expand ACC and Issues tool coverage only after the shared auth/caching foundation is stabilized.
