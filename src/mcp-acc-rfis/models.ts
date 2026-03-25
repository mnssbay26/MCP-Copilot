import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawRfi extends Record<string, unknown> {
  id?: string;
  title?: string;
  status?: string;
  typeId?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawRfiType extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
}

export interface RawRfiAttribute extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
  label?: string;
}

export interface RfisFilters {
  query?: string;
  statuses?: string[];
  types?: string[];
  attributeNames?: string[];
  limit?: number;
}

export interface RfiLookupItem {
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

export interface RfisSummaryResult {
  summary: {
    totalRfis: number;
    statusesTracked: number;
    typesTracked: number;
    agingBucketsTracked: number;
  };
  results: {
    byStatus: SummaryCount[];
    byType: SummaryCount[];
    byAging: SummaryCount[];
  };
  filtersApplied: RfisFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface RfisBreakdownResult {
  summary: {
    totalRfis: number;
    distinctGroups: number;
  };
  results: SummaryCount[];
  filtersApplied: RfisFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface RfisReportResult {
  summary: {
    totalRfis: number;
    reportRows: number;
    statusesTracked: number;
    typesTracked: number;
  };
  results: RfiLookupItem[];
  breakdowns: {
    byStatus: SummaryCount[];
    byType: SummaryCount[];
    byAging: SummaryCount[];
  };
  availableCustomAttributes: string[];
  filtersApplied: RfisFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface FindRfisResult {
  summary: {
    totalMatches: number;
    returnedRows: number;
    statusesTracked: number;
    typesTracked: number;
  };
  results: RfiLookupItem[];
  filtersApplied: {
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

export type RfisResponse = ApsListEnvelope<RawRfi>;
export type RfiTypesResponse = ApsListEnvelope<RawRfiType>;
export type RfiAttributesResponse = ApsListEnvelope<RawRfiAttribute>;
