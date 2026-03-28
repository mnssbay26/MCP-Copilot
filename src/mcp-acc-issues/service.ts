import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_ISSUES_BASE_URL } from "../shared/aps/endpoints.js";
import { createCsvArtifactResult } from "../shared/mcp/csv.js";
import {
  buildCollectionRetrievalMeta,
  buildSummaryCounts,
  matchesFilterValue,
  matchesSearchTerm
} from "../shared/mcp/reporting.js";
import type { ListToolResult, ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  normalizeListPagination,
  stripBPrefix,
  toStringArray,
  toStringValue
} from "../shared/mcp/listUtils.js";
import { createProjectUserEnricher, type ProjectUserEnricher } from "../shared/users/enrichment.js";
import type {
  IssueReportItem,
  IssueSummary,
  IssuesCsvExportResult,
  IssuesFilters,
  IssuesReportResult,
  IssuesResponse,
  IssuesSummaryResult,
  RawIssue
} from "./models.js";

const SOURCE = "construction/issues/v1";
const PAGE_LIMIT = 200;
const MAX_PAGE_FETCHES = 10;
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 50;

interface NormalizedIssueReport extends IssueReportItem {}

interface IssuesContext {
  filtersApplied: IssuesFilters;
  issues: NormalizedIssueReport[];
  warnings: ToolWarning[];
  retrieval: {
    totalFetched: number;
    pageCount: number;
    sourceTruncated: boolean;
  };
  meta: {
    source: string;
    generatedAt: string;
    projectId: string;
  };
}

function clampLimit(limit = 10): number {
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

function clampReportLimit(limit?: number): number {
  return Math.max(1, Math.min(MAX_REPORT_LIMIT, Math.trunc(limit ?? DEFAULT_REPORT_LIMIT)));
}

function clampOffset(offset = 0): number {
  return Math.max(0, Math.trunc(offset));
}

function createMeta(tool: string, projectId: string) {
  return {
    tool,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    projectId
  };
}

function normalizeFilters(filters?: IssuesFilters): IssuesFilters {
  const query = filters?.query?.trim();
  const statuses = filters?.statuses?.map((value) => value.trim()).filter(Boolean);
  const assigneeNames = filters?.assigneeNames?.map((value) => value.trim()).filter(Boolean);

  return {
    ...(query ? { query } : {}),
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(assigneeNames && assigneeNames.length > 0
      ? { assigneeNames: [...new Set(assigneeNames)] }
      : {}),
    ...(filters?.limit !== undefined ? { limit: clampReportLimit(filters.limit) } : {})
  };
}

function resolveAssignedTo(
  value: RawIssue["assignedTo"],
  userEnricher: ProjectUserEnricher
): string | undefined {
  return userEnricher.resolveDisplayName(value);
}

function resolveStatus(rawIssue: RawIssue): string {
  return toStringValue(rawIssue.status, rawIssue.statusName) ?? "Unspecified";
}

function resolveIssueNumber(rawIssue: RawIssue): string {
  return toStringValue(rawIssue.displayId, rawIssue.issueNumber, rawIssue.id) ?? "Unnumbered Issue";
}

function normalizeIssueReport(
  rawIssue: RawIssue,
  userEnricher: ProjectUserEnricher
): NormalizedIssueReport | null {
  const issueNumber = resolveIssueNumber(rawIssue);
  if (!issueNumber) {
    return null;
  }

  return {
    issueNumber,
    title: toStringValue(rawIssue.title, rawIssue.subject, rawIssue.name),
    status: resolveStatus(rawIssue),
    assignedTo: userEnricher.resolveDisplayName(rawIssue.assignedTo),
    createdBy: userEnricher.resolveDisplayName(rawIssue.createdBy),
    updatedBy: userEnricher.resolveDisplayName(rawIssue.updatedBy),
    openedBy: userEnricher.resolveDisplayName(rawIssue.openedBy),
    closedBy: userEnricher.resolveDisplayName(rawIssue.closedBy),
    deletedBy: userEnricher.resolveDisplayName(rawIssue.deletedBy),
    watchers: userEnricher.resolveDisplayNames(rawIssue.watchers),
    dueDate: toStringValue(rawIssue.dueDate),
    createdAt: toStringValue(rawIssue.createdAt),
    updatedAt: toStringValue(rawIssue.updatedAt, rawIssue.modifiedAt)
  };
}

function filterIssues(
  issues: NormalizedIssueReport[],
  filters: IssuesFilters
): NormalizedIssueReport[] {
  return issues.filter((issue) => {
    if (!matchesFilterValue(issue.status, filters.statuses)) {
      return false;
    }

    if (!matchesFilterValue(issue.assignedTo, filters.assigneeNames)) {
      return false;
    }

    return matchesSearchTerm(
      filters.query,
      issue.issueNumber,
      issue.title,
      issue.status,
      issue.assignedTo,
      issue.createdBy,
      issue.updatedBy,
      issue.openedBy,
      issue.closedBy,
      issue.deletedBy,
      issue.watchers
    );
  });
}

async function fetchPagedIssues(
  projectId: string,
  sessionKey?: string
): Promise<{
  records: RawIssue[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  const records: RawIssue[] = [];
  const warnings: ToolWarning[] = [];
  let offset = 0;
  let pageCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_PAGE_FETCHES; pageIndex += 1) {
    pageCount += 1;
    const url = new URL(
      `${APS_CONSTRUCTION_ISSUES_BASE_URL}/projects/${encodeURIComponent(projectId)}/issues`
    );
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const rawResponse = await requestApsJson<IssuesResponse>(url.toString(), {
      serviceName: "mcpAccIssues.fetchIssues",
      sessionKey
    });

    const extracted = extractListRecords<RawIssue>(rawResponse);
    warnings.push(...extracted.warnings);
    records.push(...extracted.records);

    const pagination = extracted.pagination;
    const hasMore =
      typeof pagination?.hasMore === "boolean"
        ? pagination.hasMore
        : extracted.records.length >= PAGE_LIMIT;

    if (!hasMore || extracted.records.length === 0) {
      return { records, warnings, pageCount, sourceTruncated: false };
    }

    const nextOffset = Number(pagination?.nextOffset);
    const advancedOffset =
      Number.isFinite(nextOffset) && nextOffset > offset
        ? Math.trunc(nextOffset)
        : offset + extracted.records.length;

    if (advancedOffset <= offset) {
      warnings.push({
        code: "issues_pagination_stopped",
        message:
          "Stopped reading additional issue pages because the offset could not be advanced safely."
      });
      return { records, warnings, pageCount, sourceTruncated: true };
    }

    offset = advancedOffset;
  }

  warnings.push({
    code: "issues_page_fetch_limit_reached",
    message: `Stopped after ${MAX_PAGE_FETCHES} issue pages to keep the response bounded.`
  });
  return { records, warnings, pageCount, sourceTruncated: true };
}

async function loadIssuesContext(input: {
  projectId: string;
  sessionKey?: string;
  filters?: IssuesFilters;
}): Promise<IssuesContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const issueResult = await fetchPagedIssues(projectId, input.sessionKey);
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(
    issueResult.records.flatMap((issue) => [
      issue.assignedTo,
      issue.createdBy,
      issue.updatedBy,
      issue.openedBy,
      issue.closedBy,
      issue.deletedBy,
      issue.watchers
    ])
  );
  const normalized = issueResult.records
    .map((issue) => normalizeIssueReport(issue, userEnricher))
    .filter((issue): issue is NormalizedIssueReport => issue !== null);

  return {
    filtersApplied: filters,
    issues: filterIssues(normalized, filters),
    warnings: [...issueResult.warnings, ...userEnricher.warnings],
    retrieval: {
      totalFetched: issueResult.records.length,
      pageCount: issueResult.pageCount,
      sourceTruncated: issueResult.sourceTruncated
    },
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    }
  };
}

function normalizeIssue(
  rawIssue: RawIssue,
  userEnricher: ProjectUserEnricher
): IssueSummary | null {
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
    assignedTo: resolveAssignedTo(rawIssue.assignedTo, userEnricher),
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
  sessionKey?: string;
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
    serviceName: "mcpAccIssues.getIssues",
    sessionKey: input.sessionKey
  });

  const extracted = extractListRecords<RawIssue>(rawResponse);
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(extracted.records.map((issue) => issue.assignedTo));
  const normalized = extracted.records
    .map((issue) => normalizeIssue(issue, userEnricher))
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
    warnings: buildWarnings(
      [...extracted.warnings, ...userEnricher.warnings],
      extracted.records.length - normalized.length
    )
  };
}

export async function getIssuesSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: IssuesFilters;
}): Promise<IssuesSummaryResult> {
  const context = await loadIssuesContext(input);
  const byStatus = buildSummaryCounts(context.issues.map((issue) => issue.status), "Unspecified");
  const byAssignedTo = buildSummaryCounts(
    context.issues.map((issue) => issue.assignedTo),
    "Unassigned"
  );

  return {
    summary: {
      totalIssues: context.issues.length,
      statusesTracked: byStatus.length,
      assigneeGroupsTracked: byAssignedTo.length
    },
    results: {
      byStatus,
      byAssignedTo
    },
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated
    }),
    filtersApplied: context.filtersApplied,
    meta: createMeta("get_issues_summary", context.meta.projectId),
    warnings: context.warnings
  };
}

export async function getIssuesReport(input: {
  projectId: string;
  sessionKey?: string;
  filters?: IssuesFilters;
}): Promise<IssuesReportResult> {
  const context = await loadIssuesContext(input);
  const limit = clampReportLimit(context.filtersApplied.limit);
  const results = context.issues.slice(0, limit);
  const breakdowns = {
    byStatus: buildSummaryCounts(context.issues.map((issue) => issue.status), "Unspecified"),
    byAssignedTo: buildSummaryCounts(
      context.issues.map((issue) => issue.assignedTo),
      "Unassigned"
    )
  };

  if (context.issues.length > results.length) {
    context.warnings.push({
      code: "issues_report_truncated",
      message: `Returned the first ${results.length} matching issues to keep the report concise.`
    });
  }

  return {
    summary: {
      totalIssues: context.issues.length,
      reportRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      assigneeGroupsTracked: breakdowns.byAssignedTo.length
    },
    results,
    breakdowns,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.issues.length,
      rowsReturned: results.length
    }),
    filtersApplied: {
      ...context.filtersApplied,
      limit
    },
    meta: createMeta("get_issues_report", context.meta.projectId),
    warnings: context.warnings
  };
}

export async function exportIssuesCsv(input: {
  projectId: string;
  sessionKey?: string;
  filters?: Omit<IssuesFilters, "limit">;
}): Promise<IssuesCsvExportResult> {
  const context = await loadIssuesContext(input);

  return createCsvArtifactResult({
    fileName: `issues-${context.meta.projectId}.csv`,
    rows: context.issues,
    columns: [
      { header: "Issue Number", value: (issue) => issue.issueNumber },
      { header: "Title", value: (issue) => issue.title },
      { header: "Status", value: (issue) => issue.status },
      { header: "Assigned To", value: (issue) => issue.assignedTo },
      { header: "Created By", value: (issue) => issue.createdBy },
      { header: "Updated By", value: (issue) => issue.updatedBy },
      { header: "Opened By", value: (issue) => issue.openedBy },
      { header: "Closed By", value: (issue) => issue.closedBy },
      { header: "Deleted By", value: (issue) => issue.deletedBy },
      { header: "Watchers", value: (issue) => issue.watchers },
      { header: "Due Date", value: (issue) => issue.dueDate },
      { header: "Created At", value: (issue) => issue.createdAt },
      { header: "Updated At", value: (issue) => issue.updatedAt }
    ],
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.issues.length,
      rowsReturned: context.issues.length
    }),
    warnings: context.warnings,
    meta: createMeta("export_issues_csv", context.meta.projectId)
  });
}
