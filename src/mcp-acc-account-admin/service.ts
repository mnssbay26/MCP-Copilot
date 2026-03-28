import { requestApsJson } from "../shared/aps/client.js";
import { getValidAppContextAccessToken } from "../shared/auth/apsAppAuth.js";
import {
  APS_CONSTRUCTION_ACCOUNT_ADMIN_HQ_BASE_URL,
  APS_CONSTRUCTION_ADMIN_BASE_URL
} from "../shared/aps/endpoints.js";
import { getConfig, type RegionValue } from "../shared/config/env.js";
import { buildSummaryCounts } from "../shared/mcp/reporting.js";
import type { ListToolResult, ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  normalizeListPagination,
  stripBPrefix,
  toRecord,
  toStringArray,
  toStringValue
} from "../shared/mcp/listUtils.js";
import type {
  AccProjectCompaniesResponse,
  AccProjectsResponse,
  AccProjectUsersResponse,
  ProjectCompaniesResult,
  ProjectCompanySummary,
  ProjectSummary,
  ProjectUserSummary,
  RawAccProjectCompany,
  RawAccProject,
  RawAccProjectUser
} from "./models.js";

const PROJECT_COMPANIES_APP_SCOPES = ["account:read"];

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

function normalizeProjectCompany(
  rawCompany: RawAccProjectCompany
): ProjectCompanySummary | null {
  const tradeRecord = toRecord(rawCompany.trade);
  const typeRecord = toRecord(rawCompany.type) ?? toRecord(rawCompany.companyType);
  const categoryRecord = toRecord(rawCompany.category) ?? toRecord(rawCompany.companyCategory);
  const statusRecord = toRecord(rawCompany.status);
  const companyName = toStringValue(rawCompany.name);

  if (!companyName) {
    return null;
  }

  return {
    companyName,
    trade: toStringValue(
      rawCompany.trade,
      tradeRecord?.name,
      tradeRecord?.displayName,
      tradeRecord?.title,
      tradeRecord?.label
    ),
    companyType: toStringValue(
      rawCompany.companyType,
      rawCompany.type,
      categoryRecord?.name,
      categoryRecord?.displayName,
      categoryRecord?.title,
      categoryRecord?.label,
      typeRecord?.name,
      typeRecord?.displayName,
      typeRecord?.title,
      typeRecord?.label
    ),
    status: toStringValue(
      rawCompany.status,
      statusRecord?.name,
      statusRecord?.displayName,
      statusRecord?.title,
      statusRecord?.label
    )
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
      message: `Dropped ${filteredCount} ACC records that did not contain the fields needed for a safe summary.`
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
    serviceName: "mcpAccAccountAdmin.getProjects"
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
    serviceName: "mcpAccAccountAdmin.getUsers"
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

export async function getProjectCompanies(input: {
  projectId: string;
  limit?: number;
  offset?: number;
  region?: RegionValue;
}): Promise<ProjectCompaniesResult> {
  const config = getConfig();
  const accountId = stripBPrefix(config.apsAccountId);
  const projectId = stripBPrefix(input.projectId);
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const region = input.region ?? config.apsRegion;
  const token = await getValidAppContextAccessToken(PROJECT_COMPANIES_APP_SCOPES);

  const url = new URL(
    `${APS_CONSTRUCTION_ACCOUNT_ADMIN_HQ_BASE_URL}/accounts/${encodeURIComponent(
      accountId
    )}/projects/${encodeURIComponent(projectId)}/companies`
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const rawResponse = await requestApsJson<AccProjectCompaniesResponse>(url.toString(), {
    headers: buildRegionHeaders(region),
    token,
    serviceName: "mcpAccAccountAdmin.getProjectCompanies"
  });

  const extracted = extractListRecords<RawAccProjectCompany>(rawResponse);
  const normalized = extracted.records
    .map(normalizeProjectCompany)
    .filter((company): company is ProjectCompanySummary => company !== null);
  const pagination = normalizeListPagination(
    extracted.pagination,
    limit,
    offset,
    normalized.length
  );
  const breakdowns = {
    byTrade: buildSummaryCounts(normalized.map((company) => company.trade), "Unspecified"),
    byStatus: buildSummaryCounts(normalized.map((company) => company.status), "Unspecified"),
    byCompanyType: buildSummaryCounts(
      normalized.map((company) => company.companyType),
      "Unspecified"
    )
  };

  return {
    summary: {
      totalCompanies: pagination.totalResults ?? normalized.length,
      returnedRows: normalized.length,
      tradeGroups: breakdowns.byTrade.length,
      statusGroups: breakdowns.byStatus.length,
      companyTypeGroups: breakdowns.byCompanyType.length
    },
    results: normalized,
    breakdowns,
    pagination,
    meta: {
      tool: "get_project_companies",
      source: "hq/v1/accounts/:accountId/projects/:projectId/companies",
      generatedAt: new Date().toISOString(),
      accountId,
      projectId
    },
    warnings: buildWarnings(extracted.warnings, extracted.records.length - normalized.length)
  };
}
