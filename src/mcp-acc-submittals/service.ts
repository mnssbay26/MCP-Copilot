import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_SUBMITTALS_BASE_URL } from "../shared/aps/endpoints.js";
import {
  buildCollectionRetrievalMeta,
  buildSummaryCounts,
  matchesFilterValue,
  matchesSearchTerm
} from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  stripBPrefix,
  toRecord,
  toStringValue
} from "../shared/mcp/listUtils.js";
import {
  createProjectUserEnricher,
  type ProjectUserEnricher
} from "../shared/users/enrichment.js";
import type {
  FindSubmittalsResult,
  RawSubmittalItem,
  RawSubmittalSpec,
  SubmittalLookupItem,
  SubmittalSpecsResponse,
  SubmittalsBreakdownResult,
  SubmittalsFilters,
  SubmittalsReportResult,
  SubmittalsResponse,
  SubmittalsSummaryResult
} from "./models.js";

const SOURCE = "construction/submittals/v2";
const PAGE_LIMIT = 200;
const MAX_PAGE_FETCHES = 10;
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 50;
const DEFAULT_FIND_ROWS = 20;

interface NormalizedSubmittal {
  identifier: string;
  title?: string;
  status: string;
  specSection: string;
  manager?: string;
  response?: string;
  dueDate?: string;
  updatedAt?: string;
}

interface SubmittalContext {
  filtersApplied: SubmittalsFilters;
  items: NormalizedSubmittal[];
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

function clampReportLimit(limit?: number): number {
  return Math.max(1, Math.min(MAX_REPORT_LIMIT, Math.trunc(limit ?? DEFAULT_REPORT_LIMIT)));
}

function createMeta(tool: string, projectId: string) {
  return {
    tool,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    projectId
  };
}

function normalizeFilters(filters?: SubmittalsFilters): SubmittalsFilters {
  const query = filters?.query?.trim();
  const statuses = filters?.statuses
    ?.map((value) => value.trim())
    .filter(Boolean);
  const specSections = filters?.specSections
    ?.map((value) => value.trim())
    .filter(Boolean);

  return {
    ...(query ? { query } : {}),
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(specSections && specSections.length > 0
      ? { specSections: [...new Set(specSections)] }
      : {}),
    ...(filters?.limit !== undefined ? { limit: clampReportLimit(filters.limit) } : {})
  };
}

function resolveSafeDisplayValue(value: unknown): string | undefined {
  const record = toRecord(value);
  if (record) {
    return toStringValue(record.displayName, record.name, record.title, record.label);
  }

  return toStringValue(value);
}

function formatSpecSection(identifier?: string, title?: string): string | undefined {
  if (identifier && title) {
    return `${identifier} - ${title}`;
  }

  return identifier ?? title;
}

function buildSpecLabelsById(specs: RawSubmittalSpec[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const spec of specs) {
    const id = toStringValue(spec.id, spec.specId);
    const label = formatSpecSection(
      toStringValue(spec.identifier, spec.specIdentifier),
      toStringValue(spec.title, spec.specTitle)
    );

    if (id && label) {
      map.set(id, label);
    }
  }

  return map;
}

async function fetchPagedList<TRecord extends Record<string, unknown>>(
  urlFactory: (offset: number) => string,
  serviceName: string,
  sessionKey?: string
): Promise<{
  records: TRecord[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  const records: TRecord[] = [];
  const warnings: ToolWarning[] = [];
  let pageCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_PAGE_FETCHES; pageIndex += 1) {
    pageCount += 1;
    const offset = pageIndex * PAGE_LIMIT;
    const rawResponse = await requestApsJson<
      SubmittalsResponse | SubmittalSpecsResponse
    >(urlFactory(offset), {
      serviceName,
      sessionKey
    });

    const extracted = extractListRecords<TRecord>(rawResponse);
    warnings.push(...extracted.warnings);
    records.push(...extracted.records);

    if (extracted.records.length < PAGE_LIMIT) {
      return { records, warnings, pageCount, sourceTruncated: false };
    }
  }

  warnings.push({
    code: "submittal_page_fetch_limit_reached",
    message: `Stopped after ${MAX_PAGE_FETCHES} pages to keep the response bounded.`
  });
  return { records, warnings, pageCount, sourceTruncated: true };
}

async function fetchSubmittalItems(
  projectId: string,
  sessionKey?: string,
  query?: string
): Promise<{
  records: RawSubmittalItem[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  return fetchPagedList<RawSubmittalItem>(
    (offset) => {
      const url = new URL(
        `${APS_CONSTRUCTION_SUBMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/items`
      );
      url.searchParams.set("limit", String(PAGE_LIMIT));
      url.searchParams.set("offset", String(offset));
      if (query) {
        url.searchParams.set("search", query);
      }
      return url.toString();
    },
    "mcpAccSubmittals.fetchItems",
    sessionKey
  );
}

async function fetchSpecs(
  projectId: string,
  sessionKey?: string
): Promise<{
  records: RawSubmittalSpec[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  return fetchPagedList<RawSubmittalSpec>(
    (offset) => {
      const url = new URL(
        `${APS_CONSTRUCTION_SUBMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/specs`
      );
      url.searchParams.set("limit", String(PAGE_LIMIT));
      url.searchParams.set("offset", String(offset));
      return url.toString();
    },
    "mcpAccSubmittals.fetchSpecs",
    sessionKey
  );
}

function resolveStatus(rawItem: RawSubmittalItem): string {
  const status = toRecord(rawItem.status);
  return (
    toStringValue(
      status?.label,
      status?.value,
      status?.name,
      rawItem.statusName,
      rawItem.status,
      rawItem.stateId,
      rawItem.statusId
    ) ?? "Unspecified"
  );
}

function resolveSpecSection(
  rawItem: RawSubmittalItem,
  specLabelsById: Map<string, string>
): string {
  const spec = toRecord(rawItem.spec);
  const packageRecord = toRecord(rawItem.package);
  const packageSpecRecord = toRecord(packageRecord?.spec);
  return (
    specLabelsById.get(toStringValue(rawItem.specId, spec?.id) ?? "") ??
    formatSpecSection(
      toStringValue(
        spec?.identifier,
        rawItem.specIdentifier,
        rawItem.packageSpecIdentifier,
        packageSpecRecord?.identifier
      ),
      toStringValue(spec?.title, rawItem.specTitle, rawItem.packageSpecTitle)
    ) ??
    "Unspecified"
  );
}

function normalizeSubmittal(
  rawItem: RawSubmittalItem,
  specLabelsById: Map<string, string>,
  userEnricher: ProjectUserEnricher
): NormalizedSubmittal {
  return {
    identifier:
      toStringValue(
        rawItem.customIdentifierHumanReadable,
        rawItem.customIdentifier,
        rawItem.identifier,
        rawItem.id
      ) ?? "Unnumbered Submittal",
    title: toStringValue(rawItem.title, rawItem.name),
    status: resolveStatus(rawItem),
    specSection: resolveSpecSection(rawItem, specLabelsById),
    manager:
      userEnricher.resolveDisplayName(rawItem.manager) ??
      userEnricher.resolveDisplayName(rawItem.submittedBy) ??
      resolveSafeDisplayValue(rawItem.subcontractor),
    response:
      toStringValue(
        toRecord(rawItem.response)?.value,
        rawItem.responseValue,
        rawItem.responseComment
      ) ?? undefined,
    dueDate: toStringValue(
      rawItem.dueDate,
      rawItem.requiredDate,
      rawItem.requiredApprovalDate
    ),
    updatedAt: toStringValue(rawItem.updatedAt, rawItem.modifiedAt)
  };
}

function filterSubmittals(
  items: NormalizedSubmittal[],
  filters: SubmittalsFilters
): NormalizedSubmittal[] {
  return items.filter((item) => {
    if (!matchesFilterValue(item.status, filters.statuses)) {
      return false;
    }

    if (!matchesFilterValue(item.specSection, filters.specSections)) {
      return false;
    }

    return matchesSearchTerm(
      filters.query,
      item.identifier,
      item.title,
      item.status,
      item.specSection,
      item.manager,
      item.response
    );
  });
}

async function loadSubmittalContext(input: {
  projectId: string;
  sessionKey?: string;
  filters?: SubmittalsFilters;
}): Promise<SubmittalContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const [itemsResult, specsResult] = await Promise.all([
    fetchSubmittalItems(projectId, input.sessionKey, filters.query),
    fetchSpecs(projectId, input.sessionKey)
  ]);
  const warnings = [...itemsResult.warnings, ...specsResult.warnings];
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(
    itemsResult.records.flatMap((item) => [
      item.manager,
      item.submittedBy,
      item.createdBy,
      item.updatedBy
    ])
  );
  const specLabelsById = buildSpecLabelsById(specsResult.records);
  const normalized = itemsResult.records.map((item) =>
    normalizeSubmittal(item, specLabelsById, userEnricher)
  );

  return {
    filtersApplied: filters,
    items: filterSubmittals(normalized, filters),
    warnings: [...warnings, ...userEnricher.warnings],
    retrieval: {
      totalFetched: itemsResult.records.length,
      pageCount: itemsResult.pageCount,
      sourceTruncated: itemsResult.sourceTruncated
    },
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    }
  };
}

function buildBreakdowns(items: NormalizedSubmittal[]) {
  return {
    byStatus: buildSummaryCounts(items.map((item) => item.status), "Unspecified"),
    bySpecSection: buildSummaryCounts(items.map((item) => item.specSection), "Unspecified")
  };
}

export async function getSubmittalsSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: SubmittalsFilters;
}): Promise<SubmittalsSummaryResult> {
  const context = await loadSubmittalContext(input);
  const breakdowns = buildBreakdowns(context.items);

  return {
    summary: {
      totalSubmittals: context.items.length,
      statusesTracked: breakdowns.byStatus.length,
      specSectionsTracked: breakdowns.bySpecSection.length
    },
    results: breakdowns,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated
    }),
    filtersApplied: context.filtersApplied,
    meta: {
      ...context.meta,
      tool: "get_submittals_summary"
    },
    warnings: context.warnings
  };
}

export async function getSubmittalsBySpec(input: {
  projectId: string;
  sessionKey?: string;
  filters?: SubmittalsFilters;
}): Promise<SubmittalsBreakdownResult> {
  const context = await loadSubmittalContext(input);
  const results = buildSummaryCounts(
    context.items.map((item) => item.specSection),
    "Unspecified"
  );

  return {
    summary: {
      totalSubmittals: context.items.length,
      distinctGroups: results.length
    },
    results,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated
    }),
    filtersApplied: context.filtersApplied,
    meta: {
      ...context.meta,
      tool: "get_submittals_by_spec"
    },
    warnings: context.warnings
  };
}

export async function getSubmittalsReport(input: {
  projectId: string;
  sessionKey?: string;
  filters?: SubmittalsFilters;
}): Promise<SubmittalsReportResult> {
  const context = await loadSubmittalContext(input);
  const breakdowns = buildBreakdowns(context.items);
  const limit = clampReportLimit(context.filtersApplied.limit);
  const results: SubmittalLookupItem[] = context.items.slice(0, limit);

  if (context.items.length > results.length) {
    context.warnings.push({
      code: "submittal_report_truncated",
      message:
        `Returned the first ${results.length} matching submittals to keep the report concise.`
    });
  }

  return {
    summary: {
      totalSubmittals: context.items.length,
      reportRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      specSectionsTracked: breakdowns.bySpecSection.length
    },
    results,
    breakdowns,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.items.length,
      rowsReturned: results.length
    }),
    filtersApplied: {
      ...context.filtersApplied,
      limit
    },
    meta: {
      ...context.meta,
      tool: "get_submittals_report"
    },
    warnings: context.warnings
  };
}

export async function findSubmittals(input: {
  projectId: string;
  query?: string;
  sessionKey?: string;
}): Promise<FindSubmittalsResult> {
  const context = await loadSubmittalContext({
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    filters: {
      query: input.query
    }
  });
  const results: SubmittalLookupItem[] = context.items.slice(0, DEFAULT_FIND_ROWS);

  if (context.items.length > results.length) {
    context.warnings.push({
      code: "submittal_results_truncated",
      message:
        `Returned the first ${results.length} matching submittals to keep the response concise.`
    });
  }

  const breakdowns = buildBreakdowns(context.items);

  return {
    summary: {
      totalMatches: context.items.length,
      returnedRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      specSectionsTracked: breakdowns.bySpecSection.length
    },
    results,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.items.length,
      rowsReturned: results.length
    }),
    filtersApplied: {
      ...(context.filtersApplied.query ? { query: context.filtersApplied.query } : {})
    },
    meta: {
      ...context.meta,
      tool: "find_submittals"
    },
    warnings: context.warnings
  };
}
