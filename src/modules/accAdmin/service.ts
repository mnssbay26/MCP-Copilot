import { APS_CONSTRUCTION_ADMIN_BASE_URL } from "../../aps/endpoints.js";
import { requestApsJson } from "../../aps/client.js";
import { getConfig, type RegionValue } from "../../config/env.js";
import type { ListToolResult, ToolWarning } from "../../mcp/toolResult.js";
import {
  extractListRecords,
  normalizeListPagination,
  stripBPrefix,
  toStringArray,
  toStringValue
} from "../shared/listUtils.js";
import type {
  AccProjectsResponse,
  AccProjectUsersResponse,
  ProjectSummary,
  ProjectUserSummary,
  RawAccProject,
  RawAccProjectUser
} from "./models.js";

function clampLimit(limit = 10): number {
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

function clampOffset(offset = 0): number {
  return Math.max(0, Math.trunc(offset));
}

function buildRegionHeaders(region?: RegionValue): Record<string, string> | undefined {
  return region ? { Region: region } : undefined;
}

function normalizeProject(rawProject: RawAccProject): ProjectSummary | null {
  const id = toStringValue(rawProject.id, rawProject.projectId);
  if (!id) {
    return null;
  }

  return {
    id,
    name: toStringValue(rawProject.name, rawProject.title),
    status: toStringValue(rawProject.status),
    platform: toStringValue(rawProject.platform),
    type: toStringValue(rawProject.projectType)
  };
}

function normalizeProjectUser(rawUser: RawAccProjectUser): ProjectUserSummary | null {
  const id = toStringValue(rawUser.id, rawUser.autodeskId, rawUser.email);
  if (!id) {
    return null;
  }

  return {
    id,
    name: toStringValue(rawUser.name, rawUser.displayName),
    email: toStringValue(rawUser.email),
    status: toStringValue(rawUser.status),
    companyId: toStringValue(rawUser.companyId),
    companyName: toStringValue(rawUser.companyName),
    accessLevels: toStringArray(rawUser.accessLevels)
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
      message: `Dropped ${filteredCount} ACC records that did not contain a stable identifier.`
    }
  ];
}

export async function getProjects(input: {
  limit?: number;
  offset?: number;
  region?: RegionValue;
} = {}): Promise<ListToolResult<ProjectSummary>> {
  const config = getConfig();
  const accountId = stripBPrefix(config.apsAccountId);
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const region = input.region ?? config.apsRegion;

  const url = new URL(
    `${APS_CONSTRUCTION_ADMIN_BASE_URL}/accounts/${encodeURIComponent(accountId)}/projects`
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const rawResponse = await requestApsJson<AccProjectsResponse>(url.toString(), {
    headers: buildRegionHeaders(region),
    serviceName: "accAdmin.getProjects"
  });

  const extracted = extractListRecords<RawAccProject>(rawResponse);
  const normalized = extracted.records
    .map(normalizeProject)
    .filter((project): project is ProjectSummary => project !== null);

  return {
    results: normalized,
    pagination: normalizeListPagination(
      extracted.pagination,
      limit,
      offset,
      normalized.length
    ),
    meta: {
      tool: "get_projects",
      source: "construction/admin/v1/accounts/:accountId/projects",
      generatedAt: new Date().toISOString(),
      accountId
    },
    warnings: buildWarnings(extracted.warnings, extracted.records.length - normalized.length)
  };
}

export async function getUsers(input: {
  projectId: string;
  limit?: number;
  offset?: number;
  region?: RegionValue;
}): Promise<ListToolResult<ProjectUserSummary>> {
  const config = getConfig();
  const projectId = stripBPrefix(input.projectId);
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const region = input.region ?? config.apsRegion;

  const url = new URL(
    `${APS_CONSTRUCTION_ADMIN_BASE_URL}/projects/${encodeURIComponent(projectId)}/users`
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const rawResponse = await requestApsJson<AccProjectUsersResponse>(url.toString(), {
    headers: buildRegionHeaders(region),
    serviceName: "accAdmin.getUsers"
  });

  const extracted = extractListRecords<RawAccProjectUser>(rawResponse);
  const normalized = extracted.records
    .map(normalizeProjectUser)
    .filter((user): user is ProjectUserSummary => user !== null);

  return {
    results: normalized,
    pagination: normalizeListPagination(
      extracted.pagination,
      limit,
      offset,
      normalized.length
    ),
    meta: {
      tool: "get_users",
      source: "construction/admin/v1/projects/:projectId/users",
      generatedAt: new Date().toISOString(),
      projectId
    },
    warnings: buildWarnings(extracted.warnings, extracted.records.length - normalized.length)
  };
}
