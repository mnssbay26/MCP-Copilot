import { saveArtifact } from "../artifacts/store.js";
import type { CollectionRetrievalMeta } from "./reporting.js";
import type { ToolWarning } from "./toolResult.js";

export interface CsvColumn<TItem> {
  header: string;
  value: (item: TItem) => unknown;
}

export interface CsvArtifactResult {
  ok: true;
  artifactType: "csv";
  fileName: string;
  rowCount: number;
  truncated: boolean;
  safeLimitReached: boolean;
  retrieval: CollectionRetrievalMeta;
  downloadPath: string;
  expiresAt: string;
  warnings: ToolWarning[];
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId?: string;
    [key: string]: unknown;
  };
}

function normalizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCsvCell(item)).filter(Boolean).join("; ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

export function buildCsvContent<TItem>(rows: TItem[], columns: CsvColumn<TItem>[]): string {
  const headerRow = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const dataRows = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(normalizeCsvCell(column.value(row))))
      .join(",")
  );

  return [headerRow, ...dataRows].join("\r\n");
}

export function createCsvArtifactResult<TItem>(input: {
  fileName: string;
  rows: TItem[];
  columns: CsvColumn<TItem>[];
  retrieval: CollectionRetrievalMeta;
  warnings: ToolWarning[];
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId?: string;
    [key: string]: unknown;
  };
}): CsvArtifactResult {
  const csvContent = buildCsvContent(input.rows, input.columns);
  const artifact = saveArtifact({
    fileName: input.fileName,
    contentType: "text/csv; charset=utf-8",
    content: csvContent
  });

  return {
    ok: true,
    artifactType: "csv",
    fileName: input.fileName,
    rowCount: input.rows.length,
    truncated: input.retrieval.truncated,
    safeLimitReached: input.retrieval.safeLimitReached,
    retrieval: input.retrieval,
    downloadPath: artifact.downloadPath,
    expiresAt: artifact.expiresAt,
    warnings: input.warnings,
    meta: input.meta
  };
}
