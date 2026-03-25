export interface SummaryCount {
  label: string;
  count: number;
  percentage: number;
}

function normalizeComparisonValue(value: string): string {
  return value.trim().toLowerCase();
}

function collectSearchTerms(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSearchTerms(item));
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  return [];
}

export function normalizeFilterValues(values?: string[]): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeComparisonValue);

  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

export function matchesFilterValue(
  value: string | undefined,
  filters?: string[]
): boolean {
  const normalizedFilters = normalizeFilterValues(filters);
  if (!normalizedFilters || normalizedFilters.length === 0) {
    return true;
  }

  if (!value) {
    return false;
  }

  return normalizedFilters.includes(normalizeComparisonValue(value));
}

export function matchesSearchTerm(
  query: string | undefined,
  ...values: unknown[]
): boolean {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values
    .flatMap((value) => collectSearchTerms(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function buildSummaryCounts(
  values: Array<string | undefined>,
  fallbackLabel = "Unspecified"
): SummaryCount[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const label = value?.trim() || fallbackLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = values.length;
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
