import type { ApsListEnvelope } from "../shared/aps/models.js";
import type { SummaryCount } from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawAsset extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
  categoryId?: string;
  statusId?: string;
  updatedAt?: string;
  createdAt?: string;
  customAttributes?: unknown;
}

export interface RawAssetCategory extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
}

export interface RawAssetStatus extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
}

export interface RawAssetCustomAttribute extends Record<string, unknown> {
  id?: string;
  name?: string;
  title?: string;
  displayName?: string;
  label?: string;
}

export interface AssetsFilters {
  query?: string;
  categories?: string[];
  statuses?: string[];
  attributeNames?: string[];
  limit?: number;
}

export interface AssetReportItem {
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

export interface AssetsSummaryResult {
  summary: {
    totalAssets: number;
    categoriesTracked: number;
    statusesTracked: number;
    assignedGroups: number;
  };
  results: {
    byCategory: SummaryCount[];
    byStatus: SummaryCount[];
    byAssignedTo: SummaryCount[];
  };
  filtersApplied: AssetsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface AssetsBreakdownResult {
  summary: {
    totalAssets: number;
    distinctGroups: number;
  };
  results: SummaryCount[];
  filtersApplied: AssetsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface AssetsReportResult {
  summary: {
    totalAssets: number;
    categoriesTracked: number;
    statusesTracked: number;
    reportRows: number;
  };
  results: AssetReportItem[];
  breakdowns: {
    byCategory: SummaryCount[];
    byStatus: SummaryCount[];
    byAssignedTo: SummaryCount[];
  };
  availableCustomAttributes: string[];
  filtersApplied: AssetsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export type AssetsResponse = ApsListEnvelope<RawAsset>;
export type AssetCategoriesResponse = ApsListEnvelope<RawAssetCategory>;
export type AssetStatusesResponse = ApsListEnvelope<RawAssetStatus>;
export type AssetCustomAttributesResponse = ApsListEnvelope<RawAssetCustomAttribute>;
