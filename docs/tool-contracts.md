# Tool Contracts Freeze

This document freezes the current MCP tool contracts as they exist in the repository today. It is a documentation pass, not a redesign. If a contract looks uneven, it is documented here for compatibility unless noted otherwise.

## Conventions

- `user-context` means Autodesk 3-legged OAuth. These tools accept an optional `sessionKey` unless noted otherwise.
- `app-context` means Autodesk 2-legged app auth. These tools do not use `sessionKey`.
- `summary` tools are concise and chat-friendly.
- `report` tools return bounded detail rows plus summary counts, warnings, and retrieval metadata.
- `export_csv` tools generate server-side CSV artifacts and return artifact metadata instead of inline CSV.
- `lookup` tools return direct lists or a specific record for follow-up questions.
- `auth` tools bootstrap or inspect Autodesk authentication state.
- Where present, bounded retrieval metadata uses fields such as `totalFetched`, `pageCount`, `sourceTruncated`, `rowsTruncated`, `truncated`, and `safeLimitReached`.

## Auth

Context: auth/session management helpers for Autodesk 3-legged OAuth  
Session behavior: optional `sessionKey` on all auth tools  
Output intent: backend auth-start URL, auth status, or disconnect confirmation

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_autodesk_auth_url` | auth | none | `sessionKey` | Returns a backend `/auth/start` URL. Visible Copilot text should not expose the raw Autodesk authorization URL. |
| `get_autodesk_auth_status` | auth | none | `sessionKey` | Returns cached auth status for the current process/session. |
| `disconnect_autodesk` | auth | none | `sessionKey` | Clears the cached Autodesk token for the current process/session. |

## Account Admin

Domain: `src/mcp-acc-account-admin`

| Tool | Context | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- | --- |
| `get_projects` | user-context | lookup | none | `limit`, `offset`, `region`, `sessionKey` | Direct paged list. `limit` is `1-50`, `offset` is `>=0`. |
| `get_users` | user-context | lookup | `projectId` | `limit`, `offset`, `region`, `sessionKey` | Direct paged list. `limit` is `1-50`, `offset` is `>=0`. This existing contract still returns email. |
| `get_project_companies` | app-context | report | `projectId` | `limit`, `offset`, `region` | Intentionally 2-legged only. No `sessionKey`. Returns summary, grouped breakdowns, rows, and pagination. |

## Issues

Domain: `src/mcp-acc-issues`  
Context: user-context for all tools  
Bounds: `get_issues` uses direct pagination with `limit 1-50`. Summary/report/export do bounded multi-page retrieval up to `10` pages of `200`. Report rows are capped at `50`.

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_issues` | lookup | `projectId` | `limit`, `offset`, `sessionKey` | Legacy direct list tool preserved for compatibility. |
| `get_issues_summary` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.assigneeNames` | Returns grouped counts by status and assignee plus retrieval metadata. |
| `get_issues_report` | report | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.assigneeNames`, `filters.limit` | Visible rows bounded to `1-50`. User fields are enriched to display names when available. |
| `export_issues_csv` | export_csv | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.assigneeNames` | Best-effort full pull within safe page ceiling. Returns artifact metadata, not CSV content. |

## Assets

Domain: `src/mcp-acc-assets`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `20` pages of `100`; report rows capped at `50`  
Current state note: this domain does not currently expose `export_csv`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_assets_summary` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.categories`, `filters.statuses`, `filters.attributeNames` | Returns grouped counts by category, status, and assignee/company. |
| `get_assets_by_category` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.categories`, `filters.statuses`, `filters.attributeNames` | Breakdown-only summary by category. |
| `get_assets_by_status` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.categories`, `filters.statuses`, `filters.attributeNames` | Breakdown-only summary by status. |
| `get_assets_report` | report | `projectId` | `sessionKey`, `filters.query`, `filters.categories`, `filters.statuses`, `filters.attributeNames`, `filters.limit` | Visible rows bounded to `1-50`. Includes available custom attribute labels and retrieval metadata. |

## Sheets

Domain: `src/mcp-acc-sheets`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `10` pages of `200`; find rows capped at `20`; report rows capped at `50`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `find_sheets` | lookup | `projectId` | `discipline`, `query`, `sessionKey` | Returns bounded visible rows plus retrieval metadata. |
| `get_sheet_summary` | summary | `projectId` | `sessionKey` | Current primary summary name. Must be preserved. |
| `get_sheets_summary` | summary | `projectId` | `sessionKey` | Compatibility alias for `get_sheet_summary`. Must be preserved. |
| `get_sheets_report` | report | `projectId` | `sessionKey`, `filters.discipline`, `filters.query`, `filters.limit` | Visible rows bounded to `1-50`. |
| `get_sheet_link` | lookup | `projectId` and exactly one of `sheetId` or `sheetNumber` | `sessionKey` | Validation rule: provide exactly one selector. Missing both or providing both is rejected. |
| `export_sheets_csv` | export_csv | `projectId` | `sessionKey`, `filters.discipline`, `filters.query` | Returns artifact metadata only. |

## RFIs

Domain: `src/mcp-acc-rfis`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `20` pages; find rows capped at `20`; report rows capped at `50`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_rfis_summary` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.types`, `filters.attributeNames` | Returns grouped counts by status, type, and aging. |
| `get_rfis_by_type` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.types`, `filters.attributeNames` | Breakdown-only summary by type. |
| `get_rfis_report` | report | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.types`, `filters.attributeNames`, `filters.limit` | Visible rows bounded to `1-50`. Includes available custom attribute names. |
| `find_rfis` | lookup | `projectId` | `query`, `sessionKey` | Returns bounded visible rows plus retrieval metadata. |
| `export_rfis_csv` | export_csv | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.types`, `filters.attributeNames` | Returns artifact metadata only. |

## Submittals

Domain: `src/mcp-acc-submittals`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `10` pages of `200`; find rows capped at `20`; report rows capped at `50`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_submittals_summary` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.specSections` | Returns grouped counts by status and spec section. |
| `get_submittals_by_spec` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.specSections` | Breakdown-only summary by spec section. |
| `get_submittals_report` | report | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.specSections`, `filters.limit` | Visible rows bounded to `1-50`. |
| `find_submittals` | lookup | `projectId` | `query`, `sessionKey` | Returns bounded visible rows plus retrieval metadata. |
| `export_submittals_csv` | export_csv | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.specSections` | Returns artifact metadata only. |

## Forms

Domain: `src/mcp-acc-forms`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `10` pages of `50`; find rows capped at `20`; report rows capped at `50`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_forms_summary` | summary | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.templateNames`, `filters.templateTypes`, `filters.includeInactiveFormTemplates` | Summary/report/export use `filters.query`. |
| `find_forms` | lookup | `projectId` | `query`, `sessionKey`, `filters.statuses`, `filters.templateNames`, `filters.templateTypes`, `filters.includeInactiveFormTemplates`, `filters.limit` | Compatibility note: search uses top-level `query`, not `filters.query`. |
| `get_forms_report` | report | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.templateNames`, `filters.templateTypes`, `filters.includeInactiveFormTemplates`, `filters.limit` | Visible rows bounded to `1-50`. |
| `export_forms_csv` | export_csv | `projectId` | `sessionKey`, `filters.query`, `filters.statuses`, `filters.templateNames`, `filters.templateTypes`, `filters.includeInactiveFormTemplates` | Returns artifact metadata only. |

## Transmittals

Domain: `src/mcp-acc-transmittals`  
Context: user-context for all tools  
Bounds: bounded multi-page retrieval up to `10` pages of `200`; lookup rows capped at `20`; report rows capped at `50`; detail-related rows default to `25` and cap at `50`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_transmittals_summary` | summary | `projectId` | `sessionKey`, `filters.statuses`, `filters.senderNames`, `filters.dateFrom`, `filters.dateTo`, `filters.limit` | Returns grouped counts by status and sender. |
| `find_transmittals` | lookup | `projectId` | `query`, `sessionKey`, `filters.statuses`, `filters.senderNames`, `filters.dateFrom`, `filters.dateTo`, `filters.limit` | Bounded visible rows plus retrieval metadata. |
| `get_transmittals_report` | report | `projectId` | `query`, `sessionKey`, `filters.statuses`, `filters.senderNames`, `filters.dateFrom`, `filters.dateTo`, `filters.limit` | Visible rows bounded to `1-50`. |
| `get_transmittal_details` | lookup | `projectId`, `transmittalId` | `sessionKey` | Returns one transmittal with bounded recipient/folder/document detail rows and warnings if related lists are truncated or unavailable. |
| `export_transmittals_csv` | export_csv | `projectId` | `query`, `sessionKey`, `filters.statuses`, `filters.senderNames`, `filters.dateFrom`, `filters.dateTo` | Returns artifact metadata only. |

## Data Management

Domain: `src/mcp-data-management`  
Context: user-context for all tools  
Bounds: page-based tools use `page[number] >= 0` and `page[limit] 1-200`. Recursive search is intentionally bounded by traversal options.

Default traversal behavior for `find_model_files`:

- `maxDepth = 4`
- `maxFoldersVisited = 40`
- `maxResults = 50`
- `pageLimit = 200`
- `maxPagesPerFolder = 3`

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `get_top_folders` | lookup | `projectId` | `sessionKey` | Lists highest-level accessible Docs folders. |
| `get_folder_contents` | lookup | `projectId`, `folderId` | `sessionKey`, `pagination.pageNumber`, `pagination.pageLimit`, `includeHidden` | Returns one requested page plus pagination info. |
| `get_item` | lookup | `projectId`, `itemId` | `sessionKey` | Returns one file item and its latest version summary if present. |
| `get_item_versions` | lookup | `projectId`, `itemId` | `sessionKey`, `pagination.pageNumber`, `pagination.pageLimit` | Returns one versions page plus pagination info. |
| `find_model_files` | lookup | `projectId`, `extensions` | `sessionKey`, `traversalOptions.maxDepth`, `traversalOptions.maxFoldersVisited`, `traversalOptions.maxResults`, `traversalOptions.pageLimit`, `traversalOptions.maxPagesPerFolder`, `traversalOptions.includeHidden` | Traverses folders safely, returns matching files plus retrieval metadata and warnings when traversal is truncated. |

## APS Viewer Payload

Domain: `src/mcp-aps-viewer`  
Context: user-context for all tools  
Status: exploratory/internal only  
Support position: not a core supported user experience in this repository today

Important scope note:

- Viewer payload tools may remain in code, but APS Viewer embedding in Microsoft Copilot chat is out of scope.
- No Teams app viewer, hosted HTML viewer, or promoted embedded viewer workflow is being pursued here.
- These tools return payloads only. They do not create or imply a supported in-chat Viewer UI.

| Tool | Kind | Required inputs | Optional inputs | Notes |
| --- | --- | --- | --- | --- |
| `build_viewer_payload_from_version` | lookup | `projectId` and exactly one of `versionId` or `versionUrn` | `sessionKey` | Validation rule: provide exactly one version selector. Returns a viewer-ready payload or not-found result. |
| `build_viewer_payload_from_item` | lookup | `projectId`, `itemId` | `sessionKey` | Resolves the latest version from a Docs item and builds a payload. |
| `build_viewer_payload_from_search` | lookup | `projectId` and at least one of `query` or `extensions` | `sessionKey`, `traversalOptions.*` | Validation rule: search requires `query`, `extensions`, or both. Uses bounded Data Management traversal. |

## Known Inconsistencies Intentionally Preserved

- `get_sheet_summary` and `get_sheets_summary` both exist. The latter is a compatibility alias and should not be removed casually.
- `get_issues` remains a legacy direct list tool even though Issues also supports `summary`, `report`, and `export_csv`.
- Assets currently support `summary` and `report` patterns, but not `export_csv`.
- `get_users` still includes email because that is part of its existing contract.
- Legacy HTTP manifest/gateway files and routes remain in the repository from earlier MCP exposure attempts and do not fully describe the combined server's current tool surface.
