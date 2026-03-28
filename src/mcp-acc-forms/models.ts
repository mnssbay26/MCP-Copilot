import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawFormTemplate extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  type?: string;
  templateType?: string;
  status?: string;
  isActive?: boolean;
}

export interface RawFormItem extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
  formNumber?: string;
  number?: string;
  identifier?: string;
  status?: string | Record<string, unknown>;
  templateId?: string;
  templateName?: string;
  templateType?: string;
  formDate?: string;
  updatedAt?: string;
  modifiedAt?: string;
}

export interface FormsFilters {
  query?: string;
  statuses?: string[];
  templateNames?: string[];
  templateTypes?: string[];
  includeInactiveFormTemplates?: boolean;
  limit?: number;
}

export interface FormsSummaryResult {
  summary: {
    totalForms: number;
    statusesTracked: number;
    templateTypesTracked: number;
    templatesTracked: number;
  };
  results: {
    byStatus: SummaryCount[];
    byTemplateType: SummaryCount[];
    byTemplateName: SummaryCount[];
  };
  filtersApplied: FormsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface FormLookupItem {
  formName: string;
  reference?: string;
  templateName: string;
  templateType: string;
  status: string;
  formDate?: string;
  updatedAt?: string;
}

export interface FormsReportResult {
  summary: {
    totalForms: number;
    reportRows: number;
    statusesTracked: number;
    templateTypesTracked: number;
    templatesTracked: number;
  };
  results: FormLookupItem[];
  breakdowns: {
    byStatus: SummaryCount[];
    byTemplateType: SummaryCount[];
    byTemplateName: SummaryCount[];
  };
  filtersApplied: FormsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface FindFormsResult {
  summary: {
    totalMatches: number;
    returnedRows: number;
    statusesTracked: number;
    templateTypesTracked: number;
  };
  results: FormLookupItem[];
  filtersApplied: FormsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export type FormTemplatesResponse = ApsListEnvelope<RawFormTemplate>;
export type FormsResponse = ApsListEnvelope<RawFormItem>;
