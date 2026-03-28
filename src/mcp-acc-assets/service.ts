import {
  APS_BIM360_ASSETS_V1_BASE_URL,
  APS_BIM360_ASSETS_V2_BASE_URL
} from "../shared/aps/endpoints.js";
import { requestApsJson } from "../shared/aps/client.js";
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
  AssetCategoriesResponse,
  AssetCustomAttributesResponse,
  AssetReportItem,
  AssetsBreakdownResult,
  AssetsFilters,
  AssetsReportResult,
  AssetsResponse,
  AssetsSummaryResult,
  AssetStatusesResponse,
  RawAsset,
  RawAssetCategory,
  RawAssetCustomAttribute,
  RawAssetStatus
} from "./models.js";

const SOURCE = "bim360/assets";
const ASSET_PAGE_LIMIT = 100;
const MAX_ASSET_PAGE_FETCHES = 20;
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 50;

interface AssetMetadataMaps {
  categoryLabelsById: Map<string, string>;
  statusLabelsById: Map<string, string>;
  customAttributeLabelsByKey: Map<string, string>;
}

interface NormalizedAsset {
  assetName: string;
  category: string;
  status: string;
  assignedTo?: string;
  company?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
  customAttributes?: Record<string, string | number | boolean | string[]>;
}

interface AssetContext {
  filtersApplied: AssetsFilters;
  assets: NormalizedAsset[];
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
  availableCustomAttributes: string[];
}

function clampReportLimit(limit?: number): number {
  return Math.max(1, Math.min(MAX_REPORT_LIMIT, Math.trunc(limit ?? DEFAULT_REPORT_LIMIT)));
}

function normalizeFilters(filters?: AssetsFilters): AssetsFilters {
  const categories = filters?.categories
    ?.map((value) => value.trim())
    .filter(Boolean);
  const statuses = filters?.statuses
    ?.map((value) => value.trim())
    .filter(Boolean);
  const attributeNames = filters?.attributeNames
    ?.map((value) => value.trim())
    .filter(Boolean);
  const query = filters?.query?.trim();

  return {
    ...(query ? { query } : {}),
    ...(categories && categories.length > 0 ? { categories: [...new Set(categories)] } : {}),
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(attributeNames && attributeNames.length > 0
      ? { attributeNames: [...new Set(attributeNames)] }
      : {}),
    ...(filters?.limit !== undefined ? { limit: clampReportLimit(filters.limit) } : {})
  };
}

function createMeta(tool: string, projectId: string) {
  return {
    tool,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    projectId
  };
}

function toBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function resolveSafeDisplayValue(value: unknown): string | undefined {
  const record = toRecord(value);
  if (record) {
    return toStringValue(record.displayName, record.name, record.title, record.label);
  }

  return toStringValue(value);
}

function resolveCategoryId(rawAsset: RawAsset): string | undefined {
  const category = toRecord(rawAsset.category);
  return toStringValue(rawAsset.categoryId, category?.id, category?.categoryId);
}

function resolveStatusId(rawAsset: RawAsset): string | undefined {
  const status = toRecord(rawAsset.status);
  return toStringValue(rawAsset.statusId, status?.id, status?.statusId);
}

function resolveCategoryLabel(
  rawAsset: RawAsset,
  categoryLabelsById: Map<string, string>
): string {
  const rawCategory = toRecord(rawAsset.category);
  return (
    categoryLabelsById.get(resolveCategoryId(rawAsset) ?? "") ??
    toStringValue(
      rawCategory?.name,
      rawCategory?.title,
      rawCategory?.displayName,
      rawAsset.categoryName,
      rawAsset.categoryLabel
    ) ??
    "Uncategorized"
  );
}

function resolveStatusLabel(
  rawAsset: RawAsset,
  statusLabelsById: Map<string, string>
): string {
  const rawStatus = toRecord(rawAsset.status);
  return (
    statusLabelsById.get(resolveStatusId(rawAsset) ?? "") ??
    toStringValue(
      rawStatus?.label,
      rawStatus?.name,
      rawStatus?.title,
      rawAsset.statusLabel,
      rawAsset.statusName
    ) ??
    "Unspecified"
  );
}

function resolveAssignedTo(
  rawAsset: RawAsset,
  userEnricher: ProjectUserEnricher
): string | undefined {
  return (
    userEnricher.resolveDisplayName(rawAsset.assignedTo) ??
    userEnricher.resolveDisplayName(rawAsset.assignee) ??
    userEnricher.resolveDisplayName(rawAsset.owner) ??
    userEnricher.resolveDisplayName(rawAsset.responsibleUser) ??
    userEnricher.resolveDisplayName(rawAsset.createdBy)
  );
}

function resolveCompany(rawAsset: RawAsset): string | undefined {
  const rawCompany =
    toRecord(rawAsset.company) ??
    toRecord(rawAsset.assignedCompany) ??
    toRecord(rawAsset.responsibleCompany);

  return (
    toStringValue(
      rawCompany?.name,
      rawCompany?.title,
      rawCompany?.displayName,
      rawAsset.companyName,
      rawAsset.assignedCompanyName
    ) ?? undefined
  );
}

function resolveLocation(rawAsset: RawAsset): string | undefined {
  return (
    resolveSafeDisplayValue(rawAsset.locationPath) ??
    resolveSafeDisplayValue(rawAsset.location) ??
    resolveSafeDisplayValue(rawAsset.locationName) ??
    resolveSafeDisplayValue(rawAsset.locationDisplayName)
  );
}

function resolvePrimitiveCustomAttributeValue(
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
    toStringValue(record.value, record.displayValue, record.displayName, record.name, record.title) ??
    toNumberValue(record.value) ??
    toBooleanValue(record.value)
  );
}

function normalizeCustomAttributes(
  rawCustomAttributes: unknown,
  customAttributeLabelsByKey: Map<string, string>,
  requestedAttributeNames?: string[]
): Record<string, string | number | boolean | string[]> | undefined {
  const requestedKeys = new Set(
    requestedAttributeNames?.map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
  const entries = new Map<string, string | number | boolean | string[]>();

  if (Array.isArray(rawCustomAttributes)) {
    for (const item of rawCustomAttributes) {
      const record = toRecord(item);
      if (!record) {
        continue;
      }

      const rawKey = toStringValue(record.id, record.name);
      const label =
        customAttributeLabelsByKey.get(rawKey ?? "") ??
        toStringValue(record.displayName, record.title, record.label, record.name);
      const value = resolvePrimitiveCustomAttributeValue(
        record.value ?? record.values ?? record.displayValue
      );

      if (!label || value === undefined) {
        continue;
      }

      if (requestedKeys.size > 0 && !requestedKeys.has(label.toLowerCase())) {
        continue;
      }

      entries.set(label, value);
    }
  }

  const recordValue = toRecord(rawCustomAttributes);
  if (recordValue) {
    for (const [key, value] of Object.entries(recordValue)) {
      const label = customAttributeLabelsByKey.get(key) ?? key;
      const normalizedValue = resolvePrimitiveCustomAttributeValue(value);

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

function normalizeAsset(
  rawAsset: RawAsset,
  metadata: AssetMetadataMaps,
  userEnricher: ProjectUserEnricher,
  requestedAttributeNames?: string[]
): NormalizedAsset {
  return {
    assetName:
      toStringValue(
        rawAsset.name,
        rawAsset.title,
        rawAsset.displayName,
        rawAsset.identifier,
        rawAsset.assetNumber
    ) ?? "Untitled Asset",
    category: resolveCategoryLabel(rawAsset, metadata.categoryLabelsById),
    status: resolveStatusLabel(rawAsset, metadata.statusLabelsById),
    assignedTo: resolveAssignedTo(rawAsset, userEnricher),
    company: resolveCompany(rawAsset),
    location: resolveLocation(rawAsset),
    createdAt: toStringValue(rawAsset.createdAt),
    updatedAt: toStringValue(rawAsset.updatedAt, rawAsset.modifiedAt),
    customAttributes: normalizeCustomAttributes(
      rawAsset.customAttributes,
      metadata.customAttributeLabelsByKey,
      requestedAttributeNames
    )
  };
}

async function fetchAssetList(
  projectId: string,
  sessionKey: string | undefined,
  query: string | undefined,
  includeCustomAttributes: boolean
): Promise<{
  records: RawAsset[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  const records: RawAsset[] = [];
  const warnings: ToolWarning[] = [];
  let cursorState: string | undefined;
  const seenCursorStates = new Set<string>();
  let pageCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_ASSET_PAGE_FETCHES; pageIndex += 1) {
    pageCount += 1;
    const url = new URL(
      `${APS_BIM360_ASSETS_V2_BASE_URL}/projects/${encodeURIComponent(projectId)}/assets`
    );
    url.searchParams.set("limit", String(ASSET_PAGE_LIMIT));
    if (includeCustomAttributes) {
      url.searchParams.set("includeCustomAttributes", "true");
    }

    if (query) {
      url.searchParams.set("filter[searchText]", query);
    }

    if (cursorState) {
      url.searchParams.set("cursorState", cursorState);
    }

    const rawResponse = await requestApsJson<AssetsResponse>(url.toString(), {
      serviceName: "mcpAccAssets.fetchAssets",
      sessionKey
    });

    const extracted = extractListRecords<RawAsset>(rawResponse);
    records.push(...extracted.records);
    warnings.push(...extracted.warnings);

    const payload = toRecord(rawResponse);
    const pagination = toRecord(payload?.pagination);
    const nextCursor =
      toStringValue(
        pagination?.nextCursorState,
        payload?.nextCursorState,
        pagination?.cursorState
      ) ?? undefined;
    const hasMore =
      toBooleanValue(pagination?.hasMore) ??
      (nextCursor ? true : extracted.records.length >= ASSET_PAGE_LIMIT);

    if (!hasMore) {
      return { records, warnings, pageCount, sourceTruncated: false };
    }

    if (!nextCursor || seenCursorStates.has(nextCursor)) {
      warnings.push({
        code: "assets_pagination_stopped",
        message:
          "Stopped reading additional asset pages because the cursor pagination state could not be advanced safely."
      });
      return { records, warnings, pageCount, sourceTruncated: true };
    }

    seenCursorStates.add(nextCursor);
    cursorState = nextCursor;
  }

  warnings.push({
    code: "asset_page_fetch_limit_reached",
    message: `Stopped after ${MAX_ASSET_PAGE_FETCHES} asset pages to keep the response bounded.`
  });
  return { records, warnings, pageCount, sourceTruncated: true };
}

async function fetchAssetMetadataList<TRecord extends Record<string, unknown>>(
  url: string,
  serviceName: string,
  sessionKey?: string
): Promise<{ records: TRecord[]; warnings: ToolWarning[] }> {
  const rawResponse = await requestApsJson<
    AssetCategoriesResponse | AssetStatusesResponse | AssetCustomAttributesResponse
  >(url, {
    serviceName,
    sessionKey
  });

  const extracted = extractListRecords<TRecord>(rawResponse);
  return {
    records: extracted.records,
    warnings: extracted.warnings
  };
}

async function fetchCategories(
  projectId: string,
  sessionKey?: string
): Promise<{ records: RawAssetCategory[]; warnings: ToolWarning[] }> {
  return fetchAssetMetadataList<RawAssetCategory>(
    `${APS_BIM360_ASSETS_V1_BASE_URL}/projects/${encodeURIComponent(projectId)}/categories`,
    "mcpAccAssets.fetchCategories",
    sessionKey
  );
}

async function fetchStatuses(
  projectId: string,
  sessionKey?: string
): Promise<{ records: RawAssetStatus[]; warnings: ToolWarning[] }> {
  return fetchAssetMetadataList<RawAssetStatus>(
    `${APS_BIM360_ASSETS_V1_BASE_URL}/projects/${encodeURIComponent(projectId)}/asset-statuses`,
    "mcpAccAssets.fetchStatuses",
    sessionKey
  );
}

async function fetchCustomAttributeDefinitions(
  projectId: string,
  categoryIds: string[],
  sessionKey?: string
): Promise<{ records: RawAssetCustomAttribute[]; warnings: ToolWarning[] }> {
  const warnings: ToolWarning[] = [];
  const records: RawAssetCustomAttribute[] = [];

  await Promise.all(
    categoryIds.map(async (categoryId) => {
      try {
        const result = await fetchAssetMetadataList<RawAssetCustomAttribute>(
          `${APS_BIM360_ASSETS_V1_BASE_URL}/projects/${encodeURIComponent(
            projectId
          )}/categories/${encodeURIComponent(categoryId)}/custom-attributes?includeInherited=true`,
          "mcpAccAssets.fetchCategoryCustomAttributes",
          sessionKey
        );
        records.push(...result.records);
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push({
          code: "asset_custom_attributes_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Asset custom attribute definitions could not be loaded."
        });
      }
    })
  );

  return { records, warnings };
}

function buildCategoryLabelsById(categories: RawAssetCategory[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const category of categories) {
    const id = toStringValue(category.id, category.categoryId);
    const label = toStringValue(category.displayName, category.name, category.title);

    if (id && label) {
      map.set(id, label);
    }
  }

  return map;
}

function buildStatusLabelsById(statuses: RawAssetStatus[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const status of statuses) {
    const id = toStringValue(status.id, status.statusId);
    const label = toStringValue(status.label, status.displayName, status.name, status.title);

    if (id && label) {
      map.set(id, label);
    }
  }

  return map;
}

function buildCustomAttributeLabelsByKey(
  attributes: RawAssetCustomAttribute[]
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

function filterAssets(assets: NormalizedAsset[], filters: AssetsFilters): NormalizedAsset[] {
  return assets.filter((asset) => {
    if (!matchesFilterValue(asset.category, filters.categories)) {
      return false;
    }

    if (!matchesFilterValue(asset.status, filters.statuses)) {
      return false;
    }

    return matchesSearchTerm(
      filters.query,
      asset.assetName,
      asset.category,
      asset.status,
      asset.assignedTo,
      asset.company,
      asset.location,
      asset.customAttributes ? Object.entries(asset.customAttributes) : undefined
    );
  });
}

async function loadAssetContext(input: {
  projectId: string;
  sessionKey?: string;
  filters?: AssetsFilters;
  includeCustomAttributes?: boolean;
}): Promise<AssetContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const includeCustomAttributes = Boolean(
    input.includeCustomAttributes || (filters.attributeNames && filters.attributeNames.length > 0)
  );

  const [assetListResult, categoriesResult, statusesResult] = await Promise.all([
    fetchAssetList(projectId, input.sessionKey, filters.query, includeCustomAttributes),
    fetchCategories(projectId, input.sessionKey),
    fetchStatuses(projectId, input.sessionKey)
  ]);
  const { records: rawAssets, warnings: assetWarnings } = assetListResult;

  const warnings = [
    ...assetWarnings,
    ...categoriesResult.warnings,
    ...statusesResult.warnings
  ];

  const categoryLabelsById = buildCategoryLabelsById(categoriesResult.records);
  const statusLabelsById = buildStatusLabelsById(statusesResult.records);
  const categoryIds = rawAssets
    .map((asset) => resolveCategoryId(asset))
    .filter((value): value is string => Boolean(value));

  const customAttributeDefinitions =
    includeCustomAttributes && categoryIds.length > 0
      ? await fetchCustomAttributeDefinitions(
          projectId,
          [...new Set(categoryIds)],
          input.sessionKey
        )
      : { records: [], warnings: [] };

  warnings.push(...customAttributeDefinitions.warnings);

  const customAttributeLabelsByKey = buildCustomAttributeLabelsByKey(
    customAttributeDefinitions.records
  );
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(
    rawAssets.flatMap((asset) => [
      asset.assignedTo,
      asset.assignee,
      asset.owner,
      asset.responsibleUser,
      asset.createdBy
    ])
  );
  const metadata: AssetMetadataMaps = {
    categoryLabelsById,
    statusLabelsById,
    customAttributeLabelsByKey
  };

  const normalizedAssets = rawAssets.map((asset) =>
    normalizeAsset(asset, metadata, userEnricher, filters.attributeNames)
  );
  const filteredAssets = filterAssets(normalizedAssets, filters);
  const availableCustomAttributes = [...new Set(customAttributeLabelsByKey.values())].sort(
    (left, right) => left.localeCompare(right)
  );

  return {
    filtersApplied: filters,
    assets: filteredAssets,
    warnings: [...warnings, ...userEnricher.warnings],
    retrieval: {
      totalFetched: rawAssets.length,
      pageCount: assetListResult.pageCount,
      sourceTruncated: assetListResult.sourceTruncated
    },
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    },
    availableCustomAttributes
  };
}

function buildSharedBreakdowns(assets: NormalizedAsset[]) {
  return {
    byCategory: buildSummaryCounts(assets.map((asset) => asset.category), "Uncategorized"),
    byStatus: buildSummaryCounts(assets.map((asset) => asset.status), "Unspecified"),
    byAssignedTo: buildSummaryCounts(
      assets.map((asset) => asset.assignedTo ?? asset.company),
      "Unassigned"
    )
  };
}

export async function getAssetsSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: AssetsFilters;
}): Promise<AssetsSummaryResult> {
  const context = await loadAssetContext(input);
  const breakdowns = buildSharedBreakdowns(context.assets);

  return {
    summary: {
      totalAssets: context.assets.length,
      categoriesTracked: breakdowns.byCategory.length,
      statusesTracked: breakdowns.byStatus.length,
      assignedGroups: breakdowns.byAssignedTo.length
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
      tool: "get_assets_summary"
    },
    warnings: context.warnings
  };
}

export async function getAssetsByCategory(input: {
  projectId: string;
  sessionKey?: string;
  filters?: AssetsFilters;
}): Promise<AssetsBreakdownResult> {
  const context = await loadAssetContext(input);
  const results = buildSummaryCounts(
    context.assets.map((asset) => asset.category),
    "Uncategorized"
  );

  return {
    summary: {
      totalAssets: context.assets.length,
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
      tool: "get_assets_by_category"
    },
    warnings: context.warnings
  };
}

export async function getAssetsByStatus(input: {
  projectId: string;
  sessionKey?: string;
  filters?: AssetsFilters;
}): Promise<AssetsBreakdownResult> {
  const context = await loadAssetContext(input);
  const results = buildSummaryCounts(
    context.assets.map((asset) => asset.status),
    "Unspecified"
  );

  return {
    summary: {
      totalAssets: context.assets.length,
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
      tool: "get_assets_by_status"
    },
    warnings: context.warnings
  };
}

export async function getAssetsReport(input: {
  projectId: string;
  sessionKey?: string;
  filters?: AssetsFilters;
}): Promise<AssetsReportResult> {
  const context = await loadAssetContext({
    ...input,
    includeCustomAttributes: true
  });
  const breakdowns = buildSharedBreakdowns(context.assets);
  const limit = clampReportLimit(context.filtersApplied.limit);
  const results: AssetReportItem[] = context.assets.slice(0, limit);

  if (context.assets.length > results.length) {
    context.warnings.push({
      code: "asset_report_truncated",
      message: `Returned the first ${results.length} matching assets to keep the report concise.`
    });
  }

  return {
    summary: {
      totalAssets: context.assets.length,
      categoriesTracked: breakdowns.byCategory.length,
      statusesTracked: breakdowns.byStatus.length,
      reportRows: results.length
    },
    results,
    breakdowns,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.assets.length,
      rowsReturned: results.length
    }),
    availableCustomAttributes: context.availableCustomAttributes,
    filtersApplied: {
      ...context.filtersApplied,
      limit
    },
    meta: {
      ...context.meta,
      tool: "get_assets_report"
    },
    warnings: context.warnings
  };
}
