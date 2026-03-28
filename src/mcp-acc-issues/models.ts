import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { CsvArtifactResult } from "../shared/mcp/csv.js";
import type {
  CollectionRetrievalMeta,
  SummaryCount
} from "../shared/mcp/reporting.js";

export interface RawIssue extends Record<string, unknown> {
  id?: string;
  displayId?: string | number;
  title?: string;
  status?: string;
  assignedTo?: string | Record<string, unknown>;
  dueDate?: string;
  createdAt?: string;
}

export interface IssuesFilters {
  query?: string;
  statuses?: string[];
  assigneeNames?: string[];
  limit?: number;
}

export interface IssueSummary {
  id: string;
  displayId?: string;
  title?: string;
  status?: string;
  assignedTo?: string;
  dueDate?: string;
  createdAt?: string;
}

export interface IssueReportItem {
  issueNumber: string;
  title?: string;
  status: string;
  assignedTo?: string;
  createdBy?: string;
  updatedBy?: string;
  openedBy?: string;
  closedBy?: string;
  deletedBy?: string;
  watchers?: string[];
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IssuesSummaryResult {
  summary: {
    totalIssues: number;
    statusesTracked: number;
    assigneeGroupsTracked: number;
  };
  results: {
    byStatus: SummaryCount[];
    byAssignedTo: SummaryCount[];
  };
  retrieval: CollectionRetrievalMeta;
  filtersApplied: IssuesFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: import("../shared/mcp/toolResult.js").ToolWarning[];
}

export interface IssuesReportResult {
  summary: {
    totalIssues: number;
    reportRows: number;
    statusesTracked: number;
    assigneeGroupsTracked: number;
  };
  results: IssueReportItem[];
  breakdowns: {
    byStatus: SummaryCount[];
    byAssignedTo: SummaryCount[];
  };
  retrieval: CollectionRetrievalMeta;
  filtersApplied: IssuesFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: import("../shared/mcp/toolResult.js").ToolWarning[];
}

export type IssuesCsvExportResult = CsvArtifactResult;

export type IssuesResponse = ApsListEnvelope<RawIssue>;
