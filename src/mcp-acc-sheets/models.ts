import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawSheet extends Record<string, unknown> {
  id?: string;
  number?: string;
  title?: string;
  discipline?: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface SheetLookupItem {
  sheetNumber: string;
  title?: string;
  discipline: string;
  versionSet?: string;
  tags?: string[];
  updatedAt?: string;
  publishedAt?: string;
  linkAvailable: boolean;
}

export interface SheetsFindResult {
  summary: {
    totalMatches: number;
    disciplinesTracked: number;
    linkReadySheets: number;
    returnedRows: number;
  };
  results: SheetLookupItem[];
  filtersApplied: {
    discipline?: string;
    query?: string;
  };
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface SheetsSummaryResult {
  summary: {
    totalSheets: number;
    disciplinesTracked: number;
    linkReadySheets: number;
  };
  results: SummaryCount[];
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface SheetLinkResult {
  summary: {
    found: boolean;
    linkAvailable: boolean;
  };
  result: {
    sheetNumber: string;
    title?: string;
    discipline: string;
    accUrl?: string;
  } | null;
  lookedUpBy: {
    sheetId?: string;
    sheetNumber?: string;
  };
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export type SheetsResponse = ApsListEnvelope<RawSheet>;
