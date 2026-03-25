import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_SHEETS_BASE_URL } from "../shared/aps/endpoints.js";
import { buildSummaryCounts, matchesSearchTerm } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";
import {
  extractListRecords,
  stripBPrefix,
  toRecord,
  toStringArray,
  toStringValue
} from "../shared/mcp/listUtils.js";
import type {
  RawSheet,
  SheetLinkResult,
  SheetLookupItem,
  SheetsFindResult,
  SheetsResponse,
  SheetsSummaryResult
} from "./models.js";

const SOURCE = "construction/sheets/v1";
const SHEET_PAGE_LIMIT = 200;
const MAX_SHEET_PAGE_FETCHES = 10;
const DEFAULT_FIND_ROWS = 20;

interface NormalizedSheet {
  id?: string;
  sheetNumber: string;
  title?: string;
  discipline: string;
  versionSet?: string;
  tags?: string[];
  updatedAt?: string;
  publishedAt?: string;
  accUrl?: string;
}

function createMeta(tool: string, projectId: string) {
  return {
    tool,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    projectId
  };
}

function inferDisciplineFromSheetNumber(sheetNumber: string | undefined): string | undefined {
  if (!sheetNumber) {
    return undefined;
  }

  const match = sheetNumber.trim().match(/^[A-Za-z]{1,4}/);
  return match?.[0]?.toUpperCase();
}

function resolveDiscipline(rawSheet: RawSheet): string {
  const rawDiscipline = toRecord(rawSheet.discipline);
  return (
    toStringValue(
      rawDiscipline?.name,
      rawDiscipline?.title,
      rawDiscipline?.displayName,
      rawSheet.disciplineName,
      rawSheet.discipline
    ) ??
    inferDisciplineFromSheetNumber(
      toStringValue(rawSheet.number, rawSheet.sheetNumber, rawSheet.identifier)
    ) ??
    "Unassigned"
  );
}

function resolveVersionSet(rawSheet: RawSheet): string | undefined {
  const versionSet = toRecord(rawSheet.versionSet);
  return toStringValue(
    versionSet?.name,
    versionSet?.title,
    rawSheet.versionSetName,
    rawSheet.versionSetTitle
  );
}

function resolvePossibleAccUrl(rawSheet: RawSheet): string | undefined {
  const links = toRecord(rawSheet.links);
  const linkCandidates = [
    rawSheet.viewerUrl,
    rawSheet.webUrl,
    rawSheet.url,
    rawSheet.sheetUrl,
    rawSheet.permalink,
    toRecord(links?.web)?.href,
    toRecord(links?.viewer)?.href,
    toRecord(links?.self)?.href
  ]
    .map((value) => toStringValue(value))
    .filter((value): value is string => Boolean(value));

  return linkCandidates.find((value) => /^https:\/\//i.test(value));
}

function normalizeSheet(rawSheet: RawSheet): NormalizedSheet | null {
  const sheetNumber =
    toStringValue(rawSheet.number, rawSheet.sheetNumber, rawSheet.identifier) ?? undefined;
  const id = toStringValue(rawSheet.id);

  if (!sheetNumber && !id) {
    return null;
  }

  return {
    id,
    sheetNumber: sheetNumber ?? "Unnumbered Sheet",
    title: toStringValue(rawSheet.title, rawSheet.name, rawSheet.displayName),
    discipline: resolveDiscipline(rawSheet),
    versionSet: resolveVersionSet(rawSheet),
    tags: toStringArray(rawSheet.tags),
    updatedAt: toStringValue(rawSheet.updatedAt, rawSheet.modifiedAt),
    publishedAt: toStringValue(rawSheet.publishedAt, rawSheet.createdAt),
    accUrl: resolvePossibleAccUrl(rawSheet)
  };
}

async function fetchSheets(
  projectId: string,
  sessionKey?: string,
  query?: string
): Promise<{ records: NormalizedSheet[]; warnings: ToolWarning[] }> {
  const records: NormalizedSheet[] = [];
  const warnings: ToolWarning[] = [];

  for (let pageIndex = 0; pageIndex < MAX_SHEET_PAGE_FETCHES; pageIndex += 1) {
    const offset = pageIndex * SHEET_PAGE_LIMIT;
    const url = new URL(
      `${APS_CONSTRUCTION_SHEETS_BASE_URL}/projects/${encodeURIComponent(projectId)}/sheets`
    );
    url.searchParams.set("limit", String(SHEET_PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));
    if (query) {
      url.searchParams.set("searchText", query);
    }

    const rawResponse = await requestApsJson<SheetsResponse>(url.toString(), {
      serviceName: "mcpAccSheets.fetchSheets",
      sessionKey
    });

    const extracted = extractListRecords<RawSheet>(rawResponse);
    warnings.push(...extracted.warnings);

    const normalized = extracted.records
      .map(normalizeSheet)
      .filter((sheet): sheet is NormalizedSheet => sheet !== null);
    records.push(...normalized);

    if (extracted.records.length < SHEET_PAGE_LIMIT) {
      return { records, warnings };
    }
  }

  warnings.push({
    code: "sheet_page_fetch_limit_reached",
    message: `Stopped after ${MAX_SHEET_PAGE_FETCHES} sheet pages to keep the response bounded.`
  });

  return { records, warnings };
}

function filterSheets(
  sheets: NormalizedSheet[],
  discipline?: string,
  query?: string
): NormalizedSheet[] {
  const normalizedDiscipline = discipline?.trim().toLowerCase();

  return sheets.filter((sheet) => {
    if (
      normalizedDiscipline &&
      sheet.discipline.trim().toLowerCase() !== normalizedDiscipline
    ) {
      return false;
    }

    return matchesSearchTerm(
      query,
      sheet.sheetNumber,
      sheet.title,
      sheet.discipline,
      sheet.versionSet,
      sheet.tags
    );
  });
}

function toLookupItem(sheet: NormalizedSheet): SheetLookupItem {
  return {
    sheetNumber: sheet.sheetNumber,
    title: sheet.title,
    discipline: sheet.discipline,
    versionSet: sheet.versionSet,
    tags: sheet.tags,
    updatedAt: sheet.updatedAt,
    publishedAt: sheet.publishedAt,
    linkAvailable: Boolean(sheet.accUrl)
  };
}

export async function findSheets(input: {
  projectId: string;
  discipline?: string;
  query?: string;
  sessionKey?: string;
}): Promise<SheetsFindResult> {
  const projectId = stripBPrefix(input.projectId);
  const discipline = input.discipline?.trim() || undefined;
  const query = input.query?.trim() || undefined;
  const { records, warnings } = await fetchSheets(projectId, input.sessionKey, query);
  const filtered = filterSheets(records, discipline, query);
  const results = filtered.slice(0, DEFAULT_FIND_ROWS).map(toLookupItem);

  if (filtered.length > results.length) {
    warnings.push({
      code: "sheet_results_truncated",
      message: `Returned the first ${results.length} matching sheets to keep the response concise.`
    });
  }

  return {
    summary: {
      totalMatches: filtered.length,
      disciplinesTracked: buildSummaryCounts(filtered.map((sheet) => sheet.discipline)).length,
      linkReadySheets: filtered.filter((sheet) => Boolean(sheet.accUrl)).length,
      returnedRows: results.length
    },
    results,
    filtersApplied: {
      ...(discipline ? { discipline } : {}),
      ...(query ? { query } : {})
    },
    meta: createMeta("find_sheets", projectId),
    warnings
  };
}

export async function getSheetSummary(input: {
  projectId: string;
  sessionKey?: string;
}): Promise<SheetsSummaryResult> {
  const projectId = stripBPrefix(input.projectId);
  const { records, warnings } = await fetchSheets(projectId, input.sessionKey);
  const results = buildSummaryCounts(records.map((sheet) => sheet.discipline), "Unassigned");

  return {
    summary: {
      totalSheets: records.length,
      disciplinesTracked: results.length,
      linkReadySheets: records.filter((sheet) => Boolean(sheet.accUrl)).length
    },
    results,
    meta: createMeta("get_sheet_summary", projectId),
    warnings
  };
}

export async function getSheetLink(input: {
  projectId: string;
  sheetId?: string;
  sheetNumber?: string;
  sessionKey?: string;
}): Promise<SheetLinkResult> {
  const projectId = stripBPrefix(input.projectId);
  const sheetId = input.sheetId?.trim() || undefined;
  const sheetNumber = input.sheetNumber?.trim() || undefined;
  const { records, warnings } = await fetchSheets(projectId, input.sessionKey, sheetNumber);

  const matchedSheet =
    records.find((sheet) => sheetId && sheet.id === sheetId) ??
    records.find(
      (sheet) =>
        sheetNumber &&
        sheet.sheetNumber.trim().toLowerCase() === sheetNumber.trim().toLowerCase()
    ) ??
    null;

  if (!matchedSheet) {
    warnings.push({
      code: "sheet_not_found",
      message: "No matching sheet was found for the provided sheet id or sheet number."
    });
  }

  return {
    summary: {
      found: Boolean(matchedSheet),
      linkAvailable: Boolean(matchedSheet?.accUrl)
    },
    result: matchedSheet
      ? {
          sheetNumber: matchedSheet.sheetNumber,
          title: matchedSheet.title,
          discipline: matchedSheet.discipline,
          ...(matchedSheet.accUrl ? { accUrl: matchedSheet.accUrl } : {})
        }
      : null,
    lookedUpBy: {
      ...(sheetId ? { sheetId } : {}),
      ...(sheetNumber ? { sheetNumber } : {})
    },
    meta: createMeta("get_sheet_link", projectId),
    warnings
  };
}
