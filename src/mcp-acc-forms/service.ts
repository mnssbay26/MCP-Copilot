import { requestApsJson } from "../shared/aps/client.js";
import { APS_CONSTRUCTION_FORMS_BASE_URL } from "../shared/aps/endpoints.js";
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
  toRecord,
  toStringValue
} from "../shared/mcp/listUtils.js";
import type {
  FindFormsResult,
  FormLookupItem,
  FormsFilters,
  FormsSearchFilters,
  FormsReportResult,
  FormsResponse,
  FormsSummaryResult,
  FormTemplatesResponse,
  RawFormItem,
  RawFormTemplate
} from "./models.js";

const SOURCE = "construction/forms/v1";
const PAGE_LIMIT = 50;
const MAX_PAGE_FETCHES = 10;
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 50;
const DEFAULT_FIND_ROWS = 20;
const INACTIVE_TEMPLATE_STATUSES = new Set(["inactive", "archived", "deleted", "disabled"]);

interface NormalizedTemplate {
  templateName: string;
  templateType: string;
  isActive: boolean;
}

interface NormalizedForm extends FormLookupItem {
  templateActive: boolean;
}

interface FormsContext {
  filtersApplied: FormsFilters;
  forms: NormalizedForm[];
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

function toLookupItem(form: NormalizedForm): FormLookupItem {
  return {
    formName: form.formName,
    reference: form.reference,
    templateName: form.templateName,
    templateType: form.templateType,
    status: form.status,
    formDate: form.formDate,
    updatedAt: form.updatedAt
  };
}

function clampReportLimit(limit?: number): number {
  return Math.max(1, Math.min(MAX_REPORT_LIMIT, Math.trunc(limit ?? DEFAULT_REPORT_LIMIT)));
}

function normalizeFilters(filters?: FormsFilters): FormsFilters {
  const query = filters?.query?.trim();
  const statuses = filters?.statuses?.map((value) => value.trim()).filter(Boolean);
  const templateNames = filters?.templateNames?.map((value) => value.trim()).filter(Boolean);
  const templateTypes = filters?.templateTypes?.map((value) => value.trim()).filter(Boolean);

  return {
    ...(query ? { query } : {}),
    ...(statuses && statuses.length > 0 ? { statuses: [...new Set(statuses)] } : {}),
    ...(templateNames && templateNames.length > 0
      ? { templateNames: [...new Set(templateNames)] }
      : {}),
    ...(templateTypes && templateTypes.length > 0
      ? { templateTypes: [...new Set(templateTypes)] }
      : {}),
    ...(filters?.includeInactiveFormTemplates !== undefined
      ? { includeInactiveFormTemplates: filters.includeInactiveFormTemplates }
      : {}),
    ...(filters?.limit !== undefined ? { limit: clampReportLimit(filters.limit) } : {})
  };
}

function resolveStatusLabel(value: unknown): string {
  const record = toRecord(value);
  return (
    toStringValue(
      value,
      record?.label,
      record?.name,
      record?.displayName,
      record?.title,
      record?.value
    ) ?? "Unspecified"
  );
}

function resolveTemplateType(
  rawTemplate: Record<string, unknown> | null,
  rawFallback?: Record<string, unknown> | null
): string {
  return (
    toStringValue(
      rawTemplate?.templateType,
      rawTemplate?.type,
      rawTemplate?.category,
      rawTemplate?.formType,
      rawFallback?.templateType,
      rawFallback?.type,
      rawFallback?.category,
      rawFallback?.formType
    ) ?? "Unspecified"
  );
}

function resolveTemplateName(
  rawTemplate: Record<string, unknown> | null,
  rawFallback?: Record<string, unknown> | null
): string {
  return (
    toStringValue(
      rawTemplate?.name,
      rawTemplate?.title,
      rawTemplate?.displayName,
      rawFallback?.templateName,
      rawFallback?.name,
      rawFallback?.title
    ) ?? "Unspecified Template"
  );
}

function resolveTemplateActive(
  rawTemplate: Record<string, unknown> | null,
  rawFallback?: Record<string, unknown> | null
): boolean {
  const rawStatus = resolveStatusLabel(rawTemplate?.status ?? rawFallback?.templateStatus);

  if (typeof rawTemplate?.isActive === "boolean") {
    return rawTemplate.isActive;
  }

  if (typeof rawFallback?.isActive === "boolean") {
    return rawFallback.isActive;
  }

  return !INACTIVE_TEMPLATE_STATUSES.has(rawStatus.trim().toLowerCase());
}

function normalizeTemplate(rawTemplate: RawFormTemplate): {
  id: string;
  value: NormalizedTemplate;
} | null {
  const id = toStringValue(rawTemplate.id);
  if (!id) {
    return null;
  }

  const record = toRecord(rawTemplate);

  return {
    id,
    value: {
      templateName: resolveTemplateName(record),
      templateType: resolveTemplateType(record),
      isActive: resolveTemplateActive(record)
    }
  };
}

async function fetchFormTemplates(
  projectId: string,
  sessionKey?: string
): Promise<{ records: RawFormTemplate[]; warnings: ToolWarning[] }> {
  const rawResponse = await requestApsJson<FormTemplatesResponse>(
    `${APS_CONSTRUCTION_FORMS_BASE_URL}/projects/${encodeURIComponent(projectId)}/form-templates`,
    {
      serviceName: "mcpAccForms.fetchFormTemplates",
      sessionKey
    }
  );

  const extracted = extractListRecords<RawFormTemplate>(rawResponse);
  return {
    records: extracted.records,
    warnings: extracted.warnings
  };
}

async function fetchForms(
  projectId: string,
  sessionKey?: string,
  statuses?: string[]
): Promise<{
  records: RawFormItem[];
  warnings: ToolWarning[];
  pageCount: number;
  sourceTruncated: boolean;
}> {
  const records: RawFormItem[] = [];
  const warnings: ToolWarning[] = [];
  let pageCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_PAGE_FETCHES; pageIndex += 1) {
    pageCount += 1;
    const offset = pageIndex * PAGE_LIMIT;
    const url = new URL(
      `${APS_CONSTRUCTION_FORMS_BASE_URL}/projects/${encodeURIComponent(projectId)}/forms`
    );
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    if (statuses && statuses.length > 0) {
      url.searchParams.set("statuses", statuses.join(","));
    }

    const rawResponse = await requestApsJson<FormsResponse>(url.toString(), {
      serviceName: "mcpAccForms.fetchForms",
      sessionKey
    });

    const extracted = extractListRecords<RawFormItem>(rawResponse);
    records.push(...extracted.records);
    warnings.push(...extracted.warnings);

    if (extracted.records.length < PAGE_LIMIT) {
      return { records, warnings, pageCount, sourceTruncated: false };
    }
  }

  warnings.push({
    code: "forms_page_fetch_limit_reached",
    message: `Stopped after ${MAX_PAGE_FETCHES} pages to keep the response bounded.`
  });
  return { records, warnings, pageCount, sourceTruncated: true };
}

function buildTemplateMap(rawTemplates: RawFormTemplate[]): Map<string, NormalizedTemplate> {
  const map = new Map<string, NormalizedTemplate>();

  for (const rawTemplate of rawTemplates) {
    const normalized = normalizeTemplate(rawTemplate);
    if (normalized) {
      map.set(normalized.id, normalized.value);
    }
  }

  return map;
}

function normalizeForm(
  rawForm: RawFormItem,
  templatesById: Map<string, NormalizedTemplate>
): NormalizedForm | null {
  const templateRecord = toRecord(rawForm.template);
  const templateId = toStringValue(rawForm.templateId, templateRecord?.id);
  const template = templateId ? templatesById.get(templateId) : undefined;
  const templateName =
    template?.templateName ??
    resolveTemplateName(templateRecord, rawForm);
  const templateType =
    template?.templateType ??
    resolveTemplateType(templateRecord, rawForm);
  const formName =
    toStringValue(
      rawForm.name,
      rawForm.title,
      rawForm.displayName,
      rawForm.formNumber,
      rawForm.number,
      rawForm.identifier
    ) ??
    templateName;

  if (!formName) {
    return null;
  }

  return {
    formName,
    reference: toStringValue(rawForm.formNumber, rawForm.number, rawForm.identifier),
    templateName,
    templateType,
    status: resolveStatusLabel(rawForm.status),
    formDate: toStringValue(rawForm.formDate),
    updatedAt: toStringValue(rawForm.updatedAt, rawForm.modifiedAt),
    templateActive: template?.isActive ?? resolveTemplateActive(templateRecord, rawForm)
  };
}

function filterForms(forms: NormalizedForm[], filters: FormsFilters): NormalizedForm[] {
  return forms.filter((form) => {
    if (!filters.includeInactiveFormTemplates && !form.templateActive) {
      return false;
    }

    if (!matchesFilterValue(form.status, filters.statuses)) {
      return false;
    }

    if (!matchesFilterValue(form.templateName, filters.templateNames)) {
      return false;
    }

    if (!matchesFilterValue(form.templateType, filters.templateTypes)) {
      return false;
    }

    return matchesSearchTerm(
      filters.query,
      form.formName,
      form.reference,
      form.templateName,
      form.templateType,
      form.status
    );
  });
}

async function loadFormsContext(input: {
  projectId: string;
  sessionKey?: string;
  filters?: FormsFilters;
}): Promise<FormsContext> {
  const projectId = stripBPrefix(input.projectId);
  const filters = normalizeFilters(input.filters);
  const [formsResult, templatesResult] = await Promise.all([
    fetchForms(projectId, input.sessionKey, filters.statuses),
    fetchFormTemplates(projectId, input.sessionKey).catch((error) => ({
      records: [],
      warnings: [
        {
          code: "form_templates_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Form templates could not be loaded. Results may be less descriptive."
        }
      ]
    }))
  ]);
  const warnings = [...formsResult.warnings, ...templatesResult.warnings];
  const templatesById = buildTemplateMap(templatesResult.records);
  const normalizedForms = formsResult.records
    .map((form) => normalizeForm(form, templatesById))
    .filter((form): form is NormalizedForm => form !== null);

  return {
    filtersApplied: filters,
    forms: filterForms(normalizedForms, filters),
    warnings,
    retrieval: {
      totalFetched: formsResult.records.length,
      pageCount: formsResult.pageCount,
      sourceTruncated: formsResult.sourceTruncated
    },
    meta: {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId
    }
  };
}

function buildBreakdowns(forms: NormalizedForm[]) {
  return {
    byStatus: buildSummaryCounts(forms.map((form) => form.status), "Unspecified"),
    byTemplateType: buildSummaryCounts(forms.map((form) => form.templateType), "Unspecified"),
    byTemplateName: buildSummaryCounts(forms.map((form) => form.templateName), "Unspecified")
  };
}

export async function getFormsSummary(input: {
  projectId: string;
  sessionKey?: string;
  filters?: FormsFilters;
}): Promise<FormsSummaryResult> {
  const context = await loadFormsContext(input);
  const breakdowns = buildBreakdowns(context.forms);

  return {
    summary: {
      totalForms: context.forms.length,
      statusesTracked: breakdowns.byStatus.length,
      templateTypesTracked: breakdowns.byTemplateType.length,
      templatesTracked: breakdowns.byTemplateName.length
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
      tool: "get_forms_summary"
    },
    warnings: context.warnings
  };
}

export async function findForms(input: {
  projectId: string;
  query?: string;
  sessionKey?: string;
  filters?: FormsSearchFilters;
}): Promise<FindFormsResult> {
  const context = await loadFormsContext({
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    filters: {
      ...input.filters,
      ...(input.query ? { query: input.query } : {})
    }
  });
  const breakdowns = buildBreakdowns(context.forms);
  const results: FormLookupItem[] = context.forms
    .slice(0, DEFAULT_FIND_ROWS)
    .map(toLookupItem);

  if (context.forms.length > results.length) {
    context.warnings.push({
      code: "forms_results_truncated",
      message: `Returned the first ${results.length} matching forms to keep the response concise.`
    });
  }

  return {
    summary: {
      totalMatches: context.forms.length,
      returnedRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      templateTypesTracked: breakdowns.byTemplateType.length
    },
    results,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.forms.length,
      rowsReturned: results.length
    }),
    filtersApplied: context.filtersApplied,
    meta: {
      ...context.meta,
      tool: "find_forms"
    },
    warnings: context.warnings
  };
}

export async function getFormsReport(input: {
  projectId: string;
  sessionKey?: string;
  filters?: FormsFilters;
}): Promise<FormsReportResult> {
  const context = await loadFormsContext(input);
  const breakdowns = buildBreakdowns(context.forms);
  const limit = clampReportLimit(context.filtersApplied.limit);
  const results: FormLookupItem[] = context.forms.slice(0, limit).map(toLookupItem);

  if (context.forms.length > results.length) {
    context.warnings.push({
      code: "forms_report_truncated",
      message: `Returned the first ${results.length} matching forms to keep the report concise.`
    });
  }

  return {
    summary: {
      totalForms: context.forms.length,
      reportRows: results.length,
      statusesTracked: breakdowns.byStatus.length,
      templateTypesTracked: breakdowns.byTemplateType.length,
      templatesTracked: breakdowns.byTemplateName.length
    },
    results,
    breakdowns,
    retrieval: buildCollectionRetrievalMeta({
      totalFetched: context.retrieval.totalFetched,
      pageCount: context.retrieval.pageCount,
      sourceTruncated: context.retrieval.sourceTruncated,
      rowsAvailable: context.forms.length,
      rowsReturned: results.length
    }),
    filtersApplied: {
      ...context.filtersApplied,
      limit
    },
    meta: {
      ...context.meta,
      tool: "get_forms_report"
    },
    warnings: context.warnings
  };
}
