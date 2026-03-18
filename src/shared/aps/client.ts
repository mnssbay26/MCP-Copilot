import { randomUUID } from "node:crypto";
import { getValidAccessToken } from "../auth/apsAuth.js";
import { ApsHttpError } from "../utils/errors.js";
import type { ApsRequestOptions } from "./models.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const MAX_ERROR_BODY_LENGTH = 800;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function sanitizeBody(body: string): string {
  return body.length <= MAX_ERROR_BODY_LENGTH
    ? body
    : `${body.slice(0, MAX_ERROR_BODY_LENGTH)}...`;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildHeaders(
  token: string,
  correlationId: string,
  customHeaders: Record<string, string>,
  hasJsonBody: boolean
): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "x-correlation-id": correlationId,
    "x-request-id": correlationId,
    ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
    ...customHeaders
  };
}

export async function requestApsJson<TResponse = unknown>(
  url: string,
  options: ApsRequestOptions = {}
): Promise<TResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.token ?? (await getValidAccessToken());
  const method = options.method ?? "GET";
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const correlationId = options.correlationId ?? randomUUID();
  const serviceName = options.serviceName ?? "aps";

  const hasJsonBody =
    options.body !== undefined &&
    options.body !== null &&
    typeof options.body !== "string";

  const requestBody =
    options.body === undefined || options.body === null
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);

  const headers = buildHeaders(
    token,
    correlationId,
    options.headers ?? {},
    hasJsonBody
  );

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal
      });

      if (response.ok) {
        clearTimeout(timeout);
        return (await parseJsonOrText(response)) as TResponse;
      }

      const responseBody = sanitizeBody(await response.text());
      const shouldRetry =
        RETRYABLE_STATUS_CODES.has(response.status) && attempt < retries;

      if (!shouldRetry) {
        clearTimeout(timeout);
        throw new ApsHttpError({
          message: `[${serviceName}] APS request failed (${response.status}) ${method} ${url}`,
          status: response.status,
          method,
          url,
          correlationId,
          responseBody
        });
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      clearTimeout(timeout);
      await sleep(retryAfterMs ?? baseDelayMs * 2 ** attempt);
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ApsHttpError) {
        throw error;
      }

      if (attempt >= retries) {
        throw new ApsHttpError({
          message: `[${serviceName}] APS request error ${method} ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          status: 0,
          method,
          url,
          correlationId
        });
      }

      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw new ApsHttpError({
    message: `[${serviceName}] APS request failed without an explicit error.`,
    status: 0,
    method,
    url,
    correlationId
  });
}
