import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_TRANSMITTALS_BASE_URL } from "../shared/aps/endpoints.js";
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
  toStringValue
} from "../shared/mcp/listUtils.js";
import {
  createProjectUserEnricher,
  type ProjectUserEnricher
} from "../shared/users/enrichment.js";
import type {
  FindTransmittalsResult,
  RawTransmittalRecipientsResponse,
  RawTransmittalRecord,
  TransmittalDetailsResult,
  TransmittalDocumentItem,
  TransmittalFolderItem,
  TransmittalLookupItem,
  TransmittalRecipient,
  TransmittalsFilters,
  TransmittalsResponse,
  TransmittalsSummaryResult
} from "./models.js";

const SOURCE = "construction/transmittals/v1";
const PAGE_LIMIT = 200;
const MAX_PAGE_FETCHES = 10;
const DEFAULT_FIND_ROWS = 20;
const DEFAULT_DETAIL_ROWS = 25;
const MAX_DETAIL_ROWS = 50;

interface NormalizedTransmittal extends TransmittalLookupItem {}

interface TransmittalContext {
  filtersApplied: TransmittalsFilters;
  items: NormalizedTransmittal[];
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

function clampLimit(limit?: number): number {
  return Math.max(1, Math.min(MAX_DETAIL_ROWS, Math.trunc(limit ?? DEFAULT_DETAIL_ROWS)));
}

function normalizeFilters(filters?: TransmittalsFilters): TransmittalsFilters {
  const statuses = filters?.statuses?.map((value) => value.trim()).filter(Boolean);
  const senderNames = filters?.senderNames?.map((value) => value.trim()).filter(Boolean);
  const dateFrom = filters?.dateFrom?.trim();
  const dateTo = filters?.dateTo?.trim();

  return {
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(senderNames && senderNames.length > 0 ? { senderNames: [...new Set(senderNames)] } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(filters?.limit !== undefined ? { limit: clampLimit(filters.limit) } : {})
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

function resolveAccUrl(record: Record<string, unknown>): string | undefined {
  const links = toRecord(record.links);
  return toStringValue(
    record.webUrl,
    record.accUrl,
    record.url,
    record.permalink,
    toRecord(links?.web)?.href,
    toRecord(links?.webView)?.href,
    toRecord(links?.self)?.href
  );
}

function resolveStatus(raw: RawTransmittalRecord): string {
  const status = toRecord(raw.status);
  return (
    toStringValue(
      raw.statusName,
      status?.displayName,
      status?.name,
      status?.label,
      status?.value,
      raw.status
    ) ?? "Unspecified"
  );
}

function resolveSender(
  raw: RawTransmittalRecord | Record<string, unknown>,
  userEnricher: ProjectUserEnricher
): string | undefined {
  return (
    toStringValue(raw.sentByName, raw.senderName, raw.createdByName, raw.updatedByName) ??
    userEnricher.resolveDisplayName(raw.sentBy) ??
    userEnricher.resolveDisplayName(raw.sender) ??
    userEnricher.resolveDisplayName(raw.createdBy) ??
    userEnricher.resolveDisplayName(raw.updatedBy)
  );
}

function resolveSequenceId(raw: RawTransmittalRecord | Record<string, unknown>): string | undefined {
  return toStringValue(raw.sequenceId, raw.number, raw.displayId, raw.identifier);
}

function resolveDocumentsCount(raw: RawTransmittalRecord | Record<string, unknown>): number | undefined {
  return toNumberValue(raw.documentsCount) ?? toNumberValue(raw.documentCount);
}

function normalizeTransmittal(
  raw: RawTransmittalRecord,
  userEnricher: ProjectUserEnricher
): NormalizedTransmittal | null {
  const id = toStringValue(raw.id);
  if (!id) {
    return null;
  }

  return {
    id,
    sequenceId: resolveSequenceId(raw),
    title: toStringValue(raw.title, raw.subject, raw.name),
    status: resolveStatus(raw),
    sentBy: resolveSender(raw, userEnricher),
    createdAt: toStringValue(raw.createdAt, raw.sentAt),
    updatedAt: toStringValue(raw.updatedAt, raw.modifiedAt),
    documentsCount: resolveDocumentsCount(raw)
  };
}

function isWithinDateRange(dateValue: string | undefined, filters: TransmittalsFilters): boolean {
  if (!dateValue) {
    return !(filters.dateFrom || filters.dateTo);
  }

  const time = Date.parse(dateValue);
  if (Number.isNaN(time)) {
    return !(filters.dateFrom || filters.dateTo);
  }

  const fromTime = filters.dateFrom ? Date.parse(filters.dateFrom) : NaN;
  if (!Number.isNaN(fromTime) && time < fromTime) {
    return false;
  }

  const toTime = filters.dateTo ? Date.parse(filters.dateTo) : NaN;
  if (!Number.isNaN(toTime) && time > toTime) {
    return false;
  }

  return true;
}

function filterTransmittals(
  items: NormalizedTransmittal[],
  query: string | undefined,
  filters: TransmittalsFilters
): NormalizedTransmittal[] {
  return items.filter((item) => {
    if (!matchesFilterValue(item.status, filters.statuses)) {
      return false;
    }

    if (!matchesFilterValue(item.sentBy, filters.senderNames)) {
      return false;
    }

    if (!isWithinDateRange(item.createdAt ?? item.updatedAt, filters)) {
      return false;
    }

    return matchesSearchTerm(
      query,
      item.sequenceId,
      item.title,
      item.status,
      item.sentBy
    );
  });
}

async function fetchPagedTransmittalList(
  projectId: string,
  sessionKey?: string
): Promise<{
  records: RawTransmittalRecord[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  const warnings: ToolWarning[] = [];
  const records: RawTransmittalRecord[] = [];
  let pageCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_PAGE_FETCHES; pageIndex += 1) {
    pageCount += 1;
    const offset = pageIndex * PAGE_LIMIT;
    const url = new URL(
      `${APS_CONSTRUCTION_TRANSMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/transmittals`
    );
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const rawResponse = await requestApsJson<TransmittalsResponse>(url.toString(), {
      serviceName: "mcpAccTransmittals.getTransmittals",
      sessionKey
    });
    const extracted = extractListRecords<RawTransmittalRecord>(rawResponse);
    warnings.push(...extracted.warnings);
    records.push(...extracted.records);

    if (extracted.records.length < PAGE_LIMIT) {
      return { records, warnings, pageCount, sourceTruncated: false };
    }
  }

  warnings.push({
    code: "transmittal_page_fetch_limit_reached",
    message: `Stopped after ${MAX_PAGE_FETCHES} pages to keep the response bounded.`
  });
  return { records, warnings, pageCount, sourceTruncated: true };
}

async function loadTransmittalContext(input: {
  projectId: string;
  sessionKey?: string;
  query?: string;
  filters?: TransmittalsFilters;
}): Promise<TransmittalContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const listResult = await fetchPagedTransmittalList(projectId, input.sessionKey);
  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime(
    listResult.records.flatMap((record) => [
      record.sentBy,
      record.sender,
      record.createdBy,
      record.updatedBy
    ])
  );
  const normalized = listResult.records
    .map((record) => normalizeTransmittal(record, userEnricher))
    .filter((item): item is NormalizedTransmittal => item !== null);

  return {
    filtersApplied: filters,
    items: filterTransmittals(normalized, input.query?.trim() || undefined, filters),
    warnings: [...listResult.warnings, ...userEnricher.warnings],
    retrieval: {
      totalFetched: listResult.records.length,
      pageCount: listResult.pageCount,
      sourceTruncated: listResult.sourceTruncated
    },
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    }
  };
}

function normalizeRecipient(
  rawRecipient: Record<string, unknown>,
  recipientType: "internal" | "external",
  userEnricher: ProjectUserEnricher
): TransmittalRecipient | null {
  const name =
    userEnricher.resolveDisplayName(rawRecipient) ??
    toStringValue(
      rawRecipient.displayName,
      rawRecipient.name,
      rawRecipient.fullName,
      rawRecipient.recipientName,
      rawRecipient.companyName
    ) ??
    (recipientType === "external" ? "External recipient" : undefined);

  if (!name) {
    return null;
  }

  return {
    name,
    company: toStringValue(rawRecipient.companyName, rawRecipient.organizationName),
    role: toStringValue(rawRecipient.roleName, rawRecipient.role, rawRecipient.type),
    recipientType
  };
}

function normalizeFolder(
  rawFolder: Record<string, unknown>,
  userEnricher: ProjectUserEnricher
): TransmittalFolderItem | null {
  const id = toStringValue(rawFolder.id);
  const name = toStringValue(rawFolder.name, rawFolder.title, rawFolder.displayName);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    updatedAt: toStringValue(rawFolder.lastUpdatedAt, rawFolder.updatedAt, rawFolder.modifiedAt),
    updatedBy:
      toStringValue(rawFolder.updatedByName) ??
      resolveSender(rawFolder, userEnricher)
  };
}

function normalizeDocument(
  rawDocument: Record<string, unknown>,
  userEnricher: ProjectUserEnricher
): TransmittalDocumentItem | null {
  const id = toStringValue(rawDocument.id);
  const name = toStringValue(rawDocument.name, rawDocument.title, rawDocument.displayName);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    version: toStringValue(rawDocument.version, rawDocument.versionNumber),
    updatedAt: toStringValue(rawDocument.lastUpdatedAt, rawDocument.updatedAt, rawDocument.modifiedAt),
    updatedBy:
      toStringValue(rawDocument.updatedByName) ??
      resolveSender(rawDocument, userEnricher),
    fileType: toStringValue(rawDocument.fileType),
    accUrl: resolveAccUrl(rawDocument)
  };
}

async function fetchTransmittalDetailRecord(
  projectId: string,
  transmittalId: string,
  sessionKey?: string
): Promise<Record<string, unknown>> {
  return requestApsJson<Record<string, unknown>>(
    `${APS_CONSTRUCTION_TRANSMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/transmittals/${encodeURIComponent(transmittalId)}`,
    {
      serviceName: "mcpAccTransmittals.getTransmittal",
      sessionKey
    }
  );
}

async function fetchTransmittalRecipients(
  projectId: string,
  transmittalId: string,
  sessionKey?: string
): Promise<RawTransmittalRecipientsResponse> {
  return requestApsJson<RawTransmittalRecipientsResponse>(
    `${APS_CONSTRUCTION_TRANSMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/transmittals/${encodeURIComponent(transmittalId)}/recipients`,
    {
      serviceName: "mcpAccTransmittals.getTransmittalRecipients",
      sessionKey
    }
  );
}

async function fetchTransmittalRelatedList(
  projectId: string,
  transmittalId: string,
  collection: "folders" | "documents",
  sessionKey?: string
): Promise<{ records: Record<string, unknown>[]; warnings: ToolWarning[] }> {
  const warnings: ToolWarning[] = [];
  const records: Record<string, unknown>[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGE_FETCHES; pageIndex += 1) {
    const offset = pageIndex * PAGE_LIMIT;
    const url = new URL(
      `${APS_CONSTRUCTION_TRANSMITTALS_BASE_URL}/projects/${encodeURIComponent(projectId)}/transmittals/${encodeURIComponent(transmittalId)}/${collection}`
    );
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const rawResponse = await requestApsJson(url.toString(), {
      serviceName: `mcpAccTransmittals.getTransmittal${collection === "folders" ? "Folders" : "Documents"}`,
      sessionKey
    });
    const extracted = extractListRecords<Record<string, unknown>>(rawResponse);
    warnings.push(...extracted.warnings);
    records.push(...extracted.records);

    if (extracted.records.length < PAGE_LIMIT) {
      return { records, warnings };
    }
  }

  warnings.push({
    code: `transmittal_${collection}_page_fetch_limit_reached`,
    message: `Stopped after ${MAX_PAGE_FETCHES} ${collection} pages to keep the response bounded.`
  });
  return { records, warnings };
}

export async function getTransmittalsSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: TransmittalsFilters;
}): Promise<TransmittalsSummaryResult> {
  const context = await loadTransmittalContext(input);
  const byStatus = buildSummaryCounts(context.items.map((item) => item.status), "Unspecified");
  const bySender = buildSummaryCounts(context.items.map((item) => item.sentBy), "Unknown sender");

  return {
    summary: {
      totalTransmittals: context.items.length,
      statusesTracked: byStatus.length,
      senderGroupsTracked: bySender.length,
      documentsReferenced: context.items.reduce(
        (total, item) => total + (item.documentsCount ?? 0),
        0
      )
    },
    results: {
      byStatus,
      bySender
    },
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated
    }),
    filtersApplied: context.filtersApplied,
    meta: createMeta("get_transmittals_summary", context.meta.projectId),
    warnings: context.warnings
  };
}

export async function findTransmittals(input: {
  projectId: string;
  query?: string;
  sessionKey?: string;
  filters?: TransmittalsFilters;
}): Promise<FindTransmittalsResult> {
  const context = await loadTransmittalContext(input);
  const results = context.items.slice(0, DEFAULT_FIND_ROWS);

  if (context.items.length > results.length) {
    context.warnings.push({
      code: "transmittal_results_truncated",
      message: `Returned the first ${results.length} matching transmittals to keep the response concise.`
    });
  }

  const byStatus = buildSummaryCounts(context.items.map((item) => item.status), "Unspecified");
  const bySender = buildSummaryCounts(context.items.map((item) => item.sentBy), "Unknown sender");

  return {
    summary: {
      totalMatches: context.items.length,
      returnedRows: results.length,
      statusesTracked: byStatus.length,
      senderGroupsTracked: bySender.length
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
      ...(input.query?.trim() ? { query: input.query.trim() } : {}),
      ...(context.filtersApplied.statuses ? { statuses: context.filtersApplied.statuses } : {}),
      ...(context.filtersApplied.senderNames ? { senderNames: context.filtersApplied.senderNames } : {}),
      ...(context.filtersApplied.dateFrom ? { dateFrom: context.filtersApplied.dateFrom } : {}),
      ...(context.filtersApplied.dateTo ? { dateTo: context.filtersApplied.dateTo } : {})
    },
    meta: createMeta("find_transmittals", context.meta.projectId),
    warnings: context.warnings
  };
}

export async function getTransmittalDetails(input: {
  projectId: string;
  transmittalId: string;
  sessionKey?: string;
}): Promise<TransmittalDetailsResult> {
  const projectId = stripBPrefix(input.projectId);
  const warnings: ToolWarning[] = [];
  const record = await fetchTransmittalDetailRecord(projectId, input.transmittalId, input.sessionKey);

  const [recipientsResult, foldersResult, documentsResult] = await Promise.all([
    fetchTransmittalRecipients(projectId, input.transmittalId, input.sessionKey).catch((error) => {
      warnings.push({
        code: "transmittal_recipients_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Transmittal recipients could not be loaded."
      });
      return { recipients: [], externalMembers: [] } as RawTransmittalRecipientsResponse;
    }),
    fetchTransmittalRelatedList(projectId, input.transmittalId, "folders", input.sessionKey).catch(
      (error) => {
        warnings.push({
          code: "transmittal_folders_unavailable",
          message:
            error instanceof Error ? error.message : "Transmittal folders could not be loaded."
        });
        return { records: [], warnings: [] };
      }
    ),
    fetchTransmittalRelatedList(projectId, input.transmittalId, "documents", input.sessionKey).catch(
      (error) => {
        warnings.push({
          code: "transmittal_documents_unavailable",
          message:
            error instanceof Error ? error.message : "Transmittal documents could not be loaded."
        });
        return { records: [], warnings: [] };
      }
    )
  ]);

  warnings.push(...foldersResult.warnings, ...documentsResult.warnings);

  const userEnricher = createProjectUserEnricher({
    projectId,
    sessionKey: input.sessionKey
  });
  await userEnricher.prime([
    record.sentBy,
    record.sender,
    record.createdBy,
    record.updatedBy,
    ...(recipientsResult.recipients ?? []),
    ...(recipientsResult.externalMembers ?? []),
    ...foldersResult.records,
    ...documentsResult.records
  ]);
  warnings.push(...userEnricher.warnings);

  const normalizedRecord = normalizeTransmittal(record, userEnricher);
  const recipients = [
    ...(recipientsResult.recipients ?? [])
      .map((item) => normalizeRecipient(item, "internal", userEnricher))
      .filter((item): item is TransmittalRecipient => item !== null),
    ...(recipientsResult.externalMembers ?? [])
      .map((item) => normalizeRecipient(item, "external", userEnricher))
      .filter((item): item is TransmittalRecipient => item !== null)
  ];
  const folders = foldersResult.records
    .map((item) => normalizeFolder(item, userEnricher))
    .filter((item): item is TransmittalFolderItem => item !== null)
    .slice(0, clampLimit());
  const documents = documentsResult.records
    .map((item) => normalizeDocument(item, userEnricher))
    .filter((item): item is TransmittalDocumentItem => item !== null)
    .slice(0, clampLimit());

  if (foldersResult.records.length > folders.length) {
    warnings.push({
      code: "transmittal_folders_truncated",
      message: `Returned the first ${folders.length} folders to keep the details response concise.`
    });
  }

  if (documentsResult.records.length > documents.length) {
    warnings.push({
      code: "transmittal_documents_truncated",
      message: `Returned the first ${documents.length} documents to keep the details response concise.`
    });
  }

  return {
    summary: {
      found: normalizedRecord !== null,
      recipientCount: recipients.length,
      folderCount: foldersResult.records.length,
      documentCount: documentsResult.records.length
    },
    result: normalizedRecord
      ? {
          id: normalizedRecord.id,
          sequenceId: normalizedRecord.sequenceId,
          title: normalizedRecord.title,
          status: normalizedRecord.status,
          sentBy: normalizedRecord.sentBy,
          createdAt: normalizedRecord.createdAt,
          updatedAt: normalizedRecord.updatedAt,
          message: toStringValue(record.message, record.description, record.subject),
          recipients,
          folders,
          documents
        }
      : null,
    meta: {
      tool: "get_transmittal_details",
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId,
      transmittalId: input.transmittalId
    },
    warnings
  };
}
