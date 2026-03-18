import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_ISSUES_BASE_URL } from "../shared/aps/endpoints.js";
import type { ListToolResult, ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  normalizeListPagination,
  stripBPrefix,
  toRecord,
  toStringValue
} from "../shared/mcp/listUtils.js";
import type { IssueSummary, IssuesResponse, RawIssue } from "./models.js";

function clampLimit(limit = 10): number {
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

function clampOffset(offset = 0): number {
  return Math.max(0, Math.trunc(offset));
}

function resolveAssignedTo(value: RawIssue["assignedTo"]): string | undefined {
  const entity = toRecord(value);
  if (entity) {
    return toStringValue(entity.name, entity.displayName, entity.email, entity.id);
  }

  return toStringValue(value);
}

function normalizeIssue(rawIssue: RawIssue): IssueSummary | null {
  const rawId = toStringValue(rawIssue.id);
  const displayId = toStringValue(rawIssue.displayId);
  const id = rawId ?? displayId;

  if (!id) {
    return null;
  }

  return {
    id,
    displayId,
    title: toStringValue(rawIssue.title),
    status: toStringValue(rawIssue.status),
    assignedTo: resolveAssignedTo(rawIssue.assignedTo),
    dueDate: toStringValue(rawIssue.dueDate),
    createdAt: toStringValue(rawIssue.createdAt)
  };
}

function buildWarnings(
  warnings: ToolWarning[],
  filteredCount: number
): ToolWarning[] {
  if (filteredCount <= 0) {
    return warnings;
  }

  return [
    ...warnings,
    {
      code: "dropped_invalid_records",
      message: `Dropped ${filteredCount} issue records that did not contain a stable identifier.`
    }
  ];
}

export async function getIssues(input: {
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<ListToolResult<IssueSummary>> {
  const projectId = stripBPrefix(input.projectId);
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  const url = new URL(
    `${APS_CONSTRUCTION_ISSUES_BASE_URL}/projects/${encodeURIComponent(projectId)}/issues`
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const rawResponse = await requestApsJson<IssuesResponse>(url.toString(), {
    serviceName: "mcpAccIssues.getIssues"
  });

  const extracted = extractListRecords<RawIssue>(rawResponse);
  const normalized = extracted.records
    .map(normalizeIssue)
    .filter((issue): issue is IssueSummary => issue !== null);

  return {
    results: normalized,
    pagination: normalizeListPagination(
      extracted.pagination,
      limit,
      offset,
      normalized.length
    ),
    meta: {
      tool: "get_issues",
      source: "construction/issues/v1/projects/:projectId/issues",
      generatedAt: new Date().toISOString(),
      projectId
    },
    warnings: buildWarnings(extracted.warnings, extracted.records.length - normalized.length)
  };
}
