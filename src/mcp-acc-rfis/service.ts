import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_RFIS_BASE_URL } from "../shared/aps/endpoints.js";
import { buildSummaryCounts, matchesFilterValue, matchesSearchTerm } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  stripBPrefix,
  toNumberValue,
  toRecord,
  toStringArray,
  toStringValue
} from "../shared/mcp/listUtils.js";
import {
  createProjectUserEnricher,
  type ProjectUserEnricher
} from "../shared/users/enrichment.js";
import type {
  FindRfisResult,
  RawRfi,
  RawRfiAttribute,
  RawRfiType,
  RfiAttributesResponse,
  RfiLookupItem,
  RfiTypesResponse,
  RfisBreakdownResult,
  RfisFilters,
  RfisReportResult,
  RfisResponse,
  RfisSummaryResult
} from "./models.js";

const SOURCE = "construction/rfis/v3";
const MAX_RFI_PAGE_FETCHES = 20;
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 50;
const DEFAULT_FIND_ROWS = 20;

interface NormalizedRfi {
  rfiNumber: string;
  title?: string;
  status: string;
  type: string;
  assignedTo?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  customAttributes?: Record<string, string | number | boolean | string[]>;
}

interface RfiContext {
  filtersApplied: RfisFilters;
  rfis: NormalizedRfi[];
  availableCustomAttributes: string[];
  warnings: ToolWarning[];
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

function normalizeFilters(filters?: RfisFilters): RfisFilters {
  const query = filters?.query?.trim();
  const statuses = filters?.statuses
    ?.map((value) => value.trim())
    .filter(Boolean);
  const types = filters?.types
    ?.map((value) => value.trim())
    .filter(Boolean);
  const attributeNames = filters?.attributeNames
    ?.map((value) => value.trim())
    .filter(Boolean);

  return {
    ...(query ? { query } : {}),
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(types && types.length > 0 ? { types: [...new Set(types)] } : {}),
    ...(attributeNames && attributeNames.length > 0
      ? { attributeNames: [...new Set(attributeNames)] }
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

function resolvePrimitiveValue(
  value: unknown
): string | number | boolean | string[] | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const arrayValue = toStringArray(value);
  if (arrayValue && arrayValue.length > 0) {
    return arrayValue;
  }

  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  return (
    toStringValue(record.value, record.displayValue, record.name, record.title, record.label) ??
    toNumberValue(record.value)
  );
}

function buildTypeLabelsById(types: RawRfiType[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const type of types) {
    const id = toStringValue(type.id, type.typeId);
    const label = toStringValue(type.displayName, type.name, type.title);

    if (id && label) {
      map.set(id, label);
    }
  }

  return map;
}

function buildAttributeLabelsByKey(
  attributes: RawRfiAttribute[]
): Map<string, string> {
  const map = new Map<string, string>();

  for (const attribute of attributes) {
    const label = toStringValue(
      attribute.displayName,
      attribute.title,
      attribute.label,
      attribute.name
    );
    const keys = [attribute.id, attribute.name]
      .map((value) => toStringValue(value))
      .filter((value): value is string => Boolean(value));

    for (const key of keys) {
      if (label) {
        map.set(key, label);
      }
    }
  }

  return map;
}

function normalizeCustomAttributes(
  rawAttributes: unknown,
  attributeLabelsByKey: Map<string, string>,
  requestedAttributeNames?: string[]
): Record<string, string | number | boolean | string[]> | undefined {
  const requestedKeys = new Set(
    requestedAttributeNames?.map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
  const entries = new Map<string, string | number | boolean | string[]>();

  if (Array.isArray(rawAttributes)) {
    for (const item of rawAttributes) {
      const record = toRecord(item);
      if (!record) {
        continue;
      }

      const label =
        attributeLabelsByKey.get(toStringValue(record.id, record.name) ?? "") ??
        toStringValue(record.displayName, record.title, record.label, record.name);
      const value = resolvePrimitiveValue(record.value ?? record.values ?? record.displayValue);

      if (!label || value === undefined) {
        continue;
      }

      if (requestedKeys.size > 0 && !requestedKeys.has(label.toLowerCase())) {
        continue;
      }

      entries.set(label, value);
    }
  }

  const recordValue = toRecord(rawAttributes);
  if (recordValue) {
    for (const [key, value] of Object.entries(recordValue)) {
      const label = attributeLabelsByKey.get(key) ?? key;
      const normalizedValue = resolvePrimitiveValue(value);

      if (!label || normalizedValue === undefined) {
        continue;
      }

      if (requestedKeys.size > 0 && !requestedKeys.has(label.toLowerCase())) {
        continue;
      }

      entries.set(label, normalizedValue);
    }
  }

  return entries.size > 0 ? Object.fromEntries(entries) : undefined;
}

async function fetchRfiList(
  projectId: string,
  filters: RfisFilters,
  sessionKey?: string
): Promise<{ records: RawRfi[]; warnings: ToolWarning[] }> {
  const records: RawRfi[] = [];
  const warnings: ToolWarning[] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < MAX_RFI_PAGE_FETCHES; pageIndex += 1) {
    const url = new URL(
      `${APS_CONSTRUCTION_RFIS_BASE_URL}/projects/${encodeURIComponent(projectId)}/search:rfis`
    );
    if (offset > 0) {
      url.searchParams.set("offset", String(offset));
    }

    const body =
      filters.statuses && filters.statuses.length > 0
        ? {
            filter: {
              status: filters.statuses
            }
          }
        : {};

    const rawResponse = await requestApsJson<RfisResponse>(url.toString(), {
      method: "POST",
      body,
      serviceName: "mcpAccRfis.searchRfis",
      sessionKey
    });

    const extracted = extractListRecords<RawRfi>(rawResponse);
    warnings.push(...extracted.warnings);

    if (extracted.records.length === 0) {
      return { records, warnings };
    }

    records.push(...extracted.records);
    const payload = toRecord(rawResponse);
    const pagination = toRecord(payload?.pagination);
    const nextOffset = toNumberValue(pagination?.nextOffset);
    const hasMore =
      typeof pagination?.hasMore === "boolean"
        ? pagination.hasMore
        : extracted.records.length > 0;

    if (!hasMore || extracted.records.length === 0) {
      return { records, warnings };
    }

    const advancedOffset = nextOffset ?? offset + extracted.records.length;
    if (advancedOffset <= offset) {
      warnings.push({
        code: "rfi_pagination_stopped",
        message:
          "Stopped reading additional RFI pages because the offset could not be advanced safely."
      });
      return { records, warnings };
    }

    offset = advancedOffset;
  }

  warnings.push({
    code: "rfi_page_fetch_limit_reached",
    message: `Stopped after ${MAX_RFI_PAGE_FETCHES} RFI pages to keep the response bounded.`
  });
  return { records, warnings };
}

async function fetchRfiTypes(
  projectId: string,
  sessionKey?: string
): Promise<{ records: RawRfiType[]; warnings: ToolWarning[] }> {
  const rawResponse = await requestApsJson<RfiTypesResponse>(
    `${APS_CONSTRUCTION_RFIS_BASE_URL}/projects/${encodeURIComponent(projectId)}/rfi-types`,
    {
      serviceName: "mcpAccRfis.fetchRfiTypes",
      sessionKey
    }
  );

  const extracted = extractListRecords<RawRfiType>(rawResponse);
  return {
    records: extracted.records,
    warnings: extracted.warnings
  };
}

async function fetchRfiAttributes(
  projectId: string,
  sessionKey?: string
): Promise<{ records: RawRfiAttribute[]; warnings: ToolWarning[] }> {
  const rawResponse = await requestApsJson<RfiAttributesResponse>(
    `${APS_CONSTRUCTION_RFIS_BASE_URL}/projects/${encodeURIComponent(projectId)}/attributes`,
    {
      serviceName: "mcpAccRfis.fetchRfiAttributes",
      sessionKey
    }
  );

  const extracted = extractListRecords<RawRfiAttribute>(rawResponse);
  return {
    records: extracted.records,
    warnings: extracted.warnings
  };
}

function resolveTypeLabel(rawRfi: RawRfi, typeLabelsById: Map<string, string>): string {
  const rawType = toRecord(rawRfi.type);
  return (
    typeLabelsById.get(toStringValue(rawRfi.typeId, rawType?.id) ?? "") ??
    toStringValue(rawType?.displayName, rawType?.name, rawType?.title, rawRfi.typeName) ??
    "Unspecified"
  );
}

function normalizeRfi(
  rawRfi: RawRfi,
  typeLabelsById: Map<string, string>,
  attributeLabelsByKey: Map<string, string>,
  userEnricher: ProjectUserEnricher,
  requestedAttributeNames?: string[]
): NormalizedRfi {
  return {
    rfiNumber:
      toStringValue(
        rawRfi.displayId,
        rawRfi.customIdentifier,
        rawRfi.identifier,
        rawRfi.number,
        rawRfi.id
      ) ?? "Unnumbered RFI",
    title: toStringValue(rawRfi.title, rawRfi.subject, rawRfi.name),
    status: toStringValue(rawRfi.status, rawRfi.statusName) ?? "Unspecified",
    type: resolveTypeLabel(rawRfi, typeLabelsById),
    assignedTo:
      userEnricher.resolveDisplayName(rawRfi.assignedTo) ??
      userEnricher.resolveDisplayName(rawRfi.manager) ??
      userEnricher.resolveDisplayName(rawRfi.reviewer),
    dueDate: toStringValue(rawRfi.dueDate),
    createdAt: toStringValue(rawRfi.createdAt),
    updatedAt: toStringValue(rawRfi.updatedAt, rawRfi.modifiedAt),
    customAttributes: normalizeCustomAttributes(
      rawRfi.attributes ?? rawRfi.customAttributes,
      attributeLabelsByKey,
      requestedAttributeNames
    )
  };
}

function filterRfis(rfis: NormalizedRfi[], filters: RfisFilters): NormalizedRfi[] {
  return rfis.filter((rfi) => {
    if (!matchesFilterValue(rfi.type, filters.types)) {
      return false;
    }

    return matchesSearchTerm(
      filters.query,
      rfi.rfiNumber,
      rfi.title,
      rfi.status,
      rfi.type,
      rfi.assignedTo,
      rfi.customAttributes ? Object.entries(rfi.customAttributes) : undefined
    );
  });
}

async function loadRfiContext(input: {
  projectId: string;
  sessionKey?: string;
  filters?: RfisFilters;
  includeCustomAttributes?: boolean;
}): Promise<RfiContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const includeCustomAttributes = Boolean(
    input.includeCustomAttributes || (filters.attributeNames && filters.attributeNames.length > 0)
  );

  const [rfiResult, typesResult, attributesResult] = await Promise.all([
    fetchRfiList(projectId, filters, input.sessionKey),
    fetchRfiTypes(projectId, input.sessionKey),
    includeCustomAttributes
      ? fetchRfiAttributes(projectId, input.sessionKey)
      : Promise.resolve<{ records: RawRfiAttribute[]; warnings: ToolWarning[] }>({
          records: [],
          warnings: []
        })
  ]);

  const warnings = [
    ...rfiResult.warnings,
    ...typesResult.warnings,
    ...attributesResult.warnings
  ];
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(
    rfiResult.records.flatMap((rfi) => [
      rfi.assignedTo,
      rfi.manager,
      rfi.reviewer,
      rfi.createdBy,
      rfi.updatedBy,
      rfi.openedBy,
      rfi.closedBy,
      rfi.deletedBy,
      rfi.watchers
    ])
  );
  const typeLabelsById = buildTypeLabelsById(typesResult.records);
  const attributeLabelsByKey = buildAttributeLabelsByKey(attributesResult.records);
  const normalized = rfiResult.records.map((rfi) =>
    normalizeRfi(
      rfi,
      typeLabelsById,
      attributeLabelsByKey,
      userEnricher,
      filters.attributeNames
    )
  );

  return {
    filtersApplied: filters,
    rfis: filterRfis(normalized, filters),
    availableCustomAttributes: [...new Set(attributeLabelsByKey.values())].sort((a, b) =>
      a.localeCompare(b)
    ),
    warnings: [...warnings, ...userEnricher.warnings],
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    }
  };
}

function getAgingBucket(rfi: NormalizedRfi): string | undefined {
  const referenceDate = rfi.createdAt ?? rfi.updatedAt;
  if (!referenceDate) {
    return undefined;
  }

  const time = Date.parse(referenceDate);
  if (Number.isNaN(time)) {
    return undefined;
  }

  const ageDays = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  if (ageDays <= 7) {
    return "0-7 days";
  }

  if (ageDays <= 30) {
    return "8-30 days";
  }

  if (ageDays <= 60) {
    return "31-60 days";
  }

  return "61+ days";
}

function buildRfiBreakdowns(rfis: NormalizedRfi[]) {
  return {
    byStatus: buildSummaryCounts(rfis.map((rfi) => rfi.status), "Unspecified"),
    byType: buildSummaryCounts(rfis.map((rfi) => rfi.type), "Unspecified"),
    byAging: buildSummaryCounts(rfis.map((rfi) => getAgingBucket(rfi)), "Unknown")
  };
}

export async function getRfisSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: RfisFilters;
}): Promise<RfisSummaryResult> {
  const context = await loadRfiContext(input);
  const breakdowns = buildRfiBreakdowns(context.rfis);

  return {
    summary: {
      totalRfis: context.rfis.length,
      statusesTracked: breakdowns.byStatus.length,
      typesTracked: breakdowns.byType.length,
      agingBucketsTracked: breakdowns.byAging.length
    },
    results: breakdowns,
    filtersApplied: context.filtersApplied,
    meta: {
      ...context.meta,
      tool: "get_rfis_summary"
    },
    warnings: context.warnings
  };
}

export async function getRfisByType(input: {
  projectId: string;
  sessionKey?: string;
  filters?: RfisFilters;
}): Promise<RfisBreakdownResult> {
  const context = await loadRfiContext(input);
  const results = buildSummaryCounts(context.rfis.map((rfi) => rfi.type), "Unspecified");

  return {
    summary: {
      totalRfis: context.rfis.length,
      distinctGroups: results.length
    },
    results,
    filtersApplied: context.filtersApplied,
    meta: {
      ...context.meta,
      tool: "get_rfis_by_type"
    },
    warnings: context.warnings
  };
}

export async function getRfisReport(input: {
  projectId: string;
  sessionKey?: string;
  filters?: RfisFilters;
}): Promise<RfisReportResult> {
  const context = await loadRfiContext({
    ...input,
    includeCustomAttributes: true
  });
  const breakdowns = buildRfiBreakdowns(context.rfis);
  const limit = clampReportLimit(context.filtersApplied.limit);
  const results: RfiLookupItem[] = context.rfis.slice(0, limit);

  if (context.rfis.length > results.length) {
    context.warnings.push({
      code: "rfi_report_truncated",
      message: `Returned the first ${results.length} matching RFIs to keep the report concise.`
    });
  }

  return {
    summary: {
      totalRfis: context.rfis.length,
      reportRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      typesTracked: breakdowns.byType.length
    },
    results,
    breakdowns,
    availableCustomAttributes: context.availableCustomAttributes,
    filtersApplied: {
      ...context.filtersApplied,
      limit
    },
    meta: {
      ...context.meta,
      tool: "get_rfis_report"
    },
    warnings: context.warnings
  };
}

export async function findRfis(input: {
  projectId: string;
  query?: string;
  sessionKey?: string;
}): Promise<FindRfisResult> {
  const context = await loadRfiContext({
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    filters: {
      query: input.query
    }
  });
  const results: RfiLookupItem[] = context.rfis.slice(0, DEFAULT_FIND_ROWS);

  if (context.rfis.length > results.length) {
    context.warnings.push({
      code: "rfi_results_truncated",
      message: `Returned the first ${results.length} matching RFIs to keep the response concise.`
    });
  }

  const breakdowns = buildRfiBreakdowns(context.rfis);

  return {
    summary: {
      totalMatches: context.rfis.length,
      returnedRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      typesTracked: breakdowns.byType.length
    },
    results,
    filtersApplied: {
      ...(context.filtersApplied.query ? { query: context.filtersApplied.query } : {})
    },
    meta: {
      ...context.meta,
      tool: "find_rfis"
    },
    warnings: context.warnings
  };
}
