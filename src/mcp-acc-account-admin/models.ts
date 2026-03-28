import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type {
  ListToolMeta,
  ListToolPagination,
  ToolWarning
} from "../shared/mcp/toolResult.js";

export interface RawAccProject extends Record<string, unknown> {
  id?: string;
  projectId?: string;
  name?: string;
  title?: string;
  status?: string;
  platform?: string;
  projectType?: string;
}

export interface RawAccProjectUser extends Record<string, unknown> {
  id?: string;
  autodeskId?: string;
  name?: string;
  displayName?: string;
  email?: string;
  status?: string;
  companyId?: string;
  companyName?: string;
  accessLevels?: string[] | string;
}

export interface RawAccProjectCompany extends Record<string, unknown> {
  id?: string;
  companyId?: string;
  name?: string;
  trade?: string;
  status?: string;
  type?: string;
  companyType?: string;
  category?: string;
  companyCategory?: string;
}

export interface ProjectSummary {
  id: string;
  name?: string;
  status?: string;
  platform?: string;
  type?: string;
}

export interface ProjectUserSummary {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  companyId?: string;
  companyName?: string;
  accessLevels?: string[];
}

export interface ProjectCompanySummary {
  companyName: string;
  trade?: string;
  companyType?: string;
  status?: string;
}

export interface ProjectCompaniesResult {
  summary: {
    totalCompanies: number;
    returnedRows: number;
    tradeGroups: number;
    statusGroups: number;
    companyTypeGroups: number;
  };
  results: ProjectCompanySummary[];
  breakdowns: {
    byTrade: SummaryCount[];
    byStatus: SummaryCount[];
    byCompanyType: SummaryCount[];
  };
  pagination: ListToolPagination;
  meta: ListToolMeta;
  warnings: ToolWarning[];
}

export type AccProjectsResponse = ApsListEnvelope<RawAccProject>;
export type AccProjectUsersResponse = ApsListEnvelope<RawAccProjectUser>;
export type AccProjectCompaniesResponse = ApsListEnvelope<RawAccProjectCompany>;
