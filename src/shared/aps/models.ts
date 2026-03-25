export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApsRequestOptions {
  method?: HttpMethod;
  token?: string;
  sessionKey?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  correlationId?: string;
  serviceName?: string;
  fetchImpl?: typeof fetch;
}

export interface ApsPagination {
  limit?: number | string;
  offset?: number | string;
  totalResults?: number | string;
  returned?: number | string;
  hasMore?: boolean;
  nextOffset?: number | string | null;
  [key: string]: unknown;
}

export interface ApsListEnvelope<TItem> {
  results?: TItem[];
  data?: TItem[];
  items?: TItem[];
  pagination?: ApsPagination;
  [key: string]: unknown;
}
