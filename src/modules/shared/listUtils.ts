import type { ListToolPagination, ToolWarning } from "../../mcp/toolResult.js";

export function stripBPrefix(value: string): string {
  return value.trim().replace(/^b\./i, "");
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function toStringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

export function toNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return undefined;
}

export function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        const record = toRecord(item);
        return (
          toStringValue(
            record?.name,
            record?.title,
            record?.displayName,
            record?.id
          ) ?? ""
        );
      })
      .filter(Boolean);

    return items.length > 0 ? [...new Set(items)] : undefined;
  }

  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? [...new Set(items)] : undefined;
  }

  return undefined;
}

export function extractListRecords<TItem extends Record<string, unknown>>(raw: unknown): {
  records: TItem[];
  pagination?: Record<string, unknown>;
  warnings: ToolWarning[];
} {
  if (Array.isArray(raw)) {
    return {
      records: raw.filter((item): item is TItem => toRecord(item) !== null),
      warnings: []
    };
  }

  const payload = toRecord(raw);
  if (!payload) {
    return {
      records: [],
      warnings: [
        {
          code: "unexpected_response_shape",
          message: "APS returned a non-object response body."
        }
      ]
    };
  }

  const candidates = [payload.results, payload.data, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return {
        records: candidate.filter((item): item is TItem => toRecord(item) !== null),
        pagination: toRecord(payload.pagination) ?? undefined,
        warnings: []
      };
    }
  }

  return {
    records: [],
    pagination: toRecord(payload.pagination) ?? undefined,
    warnings: [
      {
        code: "unexpected_response_shape",
        message: "APS response did not include a results/data/items array."
      }
    ]
  };
}

export function normalizeListPagination(
  rawPagination: Record<string, unknown> | undefined,
  limit: number,
  offset: number,
  returned: number
): ListToolPagination {
  const totalResults = toNumberValue(rawPagination?.totalResults);
  const normalizedReturned = toNumberValue(rawPagination?.returned) ?? returned;
  const normalizedHasMore =
    typeof rawPagination?.hasMore === "boolean"
      ? rawPagination.hasMore
      : totalResults !== undefined
        ? offset + normalizedReturned < totalResults
        : normalizedReturned >= limit;
  const normalizedNextOffset =
    toNumberValue(rawPagination?.nextOffset) ??
    (normalizedHasMore ? offset + normalizedReturned : null);

  return {
    limit,
    offset,
    returned: normalizedReturned,
    ...(totalResults !== undefined ? { totalResults } : {}),
    hasMore: normalizedHasMore,
    nextOffset: normalizedNextOffset
  };
}
