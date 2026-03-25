import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawSubmittalItem extends Record<string, unknown> {
  id?: string;
  identifier?: string;
  title?: string;
  specId?: string;
  stateId?: string;
  statusId?: string;
  dueDate?: string;
  updatedAt?: string;
}

export interface RawSubmittalSpec extends Record<string, unknown> {
  id?: string;
  identifier?: string;
  title?: string;
}

export interface SubmittalsFilters {
  query?: string;
  statuses?: string[];
  specSections?: string[];
  limit?: number;
}

export interface SubmittalLookupItem {
  identifier: string;
  title?: string;
  status: string;
  specSection: string;
  manager?: string;
  response?: string;
  dueDate?: string;
  updatedAt?: string;
}

export interface SubmittalsSummaryResult {
  summary: {
    totalSubmittals: number;
    statusesTracked: number;
    specSectionsTracked: number;
  };
  results: {
    byStatus: SummaryCount[];
    bySpecSection: SummaryCount[];
  };
  filtersApplied: SubmittalsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface SubmittalsBreakdownResult {
  summary: {
    totalSubmittals: number;
    distinctGroups: number;
  };
  results: SummaryCount[];
  filtersApplied: SubmittalsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface SubmittalsReportResult {
  summary: {
    totalSubmittals: number;
    reportRows: number;
    statusesTracked: number;
    specSectionsTracked: number;
  };
  results: SubmittalLookupItem[];
  breakdowns: {
    byStatus: SummaryCount[];
    bySpecSection: SummaryCount[];
  };
  filtersApplied: SubmittalsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface FindSubmittalsResult {
  summary: {
    totalMatches: number;
    returnedRows: number;
    statusesTracked: number;
    specSectionsTracked: number;
  };
  results: SubmittalLookupItem[];
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

export type SubmittalsResponse = ApsListEnvelope<RawSubmittalItem>;
export type SubmittalSpecsResponse = ApsListEnvelope<RawSubmittalSpec>;
