import "dotenv/config";
import { getConfig } from "../src/shared/config/env.js";
import { ConfigError } from "../src/shared/utils/errors.js";

const PROJECT_PREVIEW_LIMIT = 5;
const AUTH_STATUS_PATH = "/auth/status";
const SMOKE_PROJECTS_PATH = "/internal/smoke/projects";

interface AuthStatusResponse {
  loggedIn?: boolean;
  expiresAt?: string;
  error?: string;
}

interface SmokeProjectsResponse {
  ok?: boolean;
  error?: string;
  details?: {
    correlationId?: string;
    status?: number;
  };
  summary?: {
    accountId?: string;
    returned?: number;
    totalResults?: number;
    preview?: Array<{
      id: string;
      name?: string | null;
    }>;
  };
}

function resolveBaseUrl(): string {
  const config = getConfig();
  return `http://127.0.0.1:${config.port}`;
}

async function requestJson<T>(url: string): Promise<{
  status: number;
  data: T | string | null;
}> {
  const response = await fetch(url);
  const responseText = await response.text();

  if (!responseText) {
    return {
      status: response.status,
      data: null
    };
  }

  try {
    return {
      status: response.status,
      data: JSON.parse(responseText) as T
    };
  } catch {
    return {
      status: response.status,
      data: responseText
    };
  }
}

function printNoTokenMessage(baseUrl: string): void {
  console.error("Smoke validation failed: no Autodesk token is cached yet.");
  console.error("Next steps:");
  console.error("1. npm run start:http");
  console.error(`2. Open ${baseUrl}/auth/url and complete Autodesk login`);
  console.error(`3. Confirm ${baseUrl}/auth/status returns loggedIn=true`);
  console.error("4. Re-run npm run smoke:projects");
}

function printProjectPreview(
  projects: Array<{ id: string; name?: string }>
): void {
  if (projects.length === 0) {
    console.log("No projects were returned for the configured account.");
    return;
  }

  console.log("Project preview:");
  for (const project of projects) {
    console.log(`- ${project.name ?? "(unnamed project)"} [${project.id}]`);
  }
}

function formatError(error: unknown): string {
  if (error instanceof ConfigError) {
    return `Configuration error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function extractJsonObject<T>(value: T | string | null): T | null {
  if (!value || typeof value === "string") {
    return null;
  }

  return value;
}

function formatServerError(
  response: SmokeProjectsResponse | AuthStatusResponse | null,
  status: number
): string {
  if (response?.error) {
    return response.error;
  }

  return `Server request failed with HTTP ${status}.`;
}

function printServerUnavailableMessage(baseUrl: string): void {
  console.error("Smoke validation failed: the HTTP server is not reachable.");
  console.error("Next steps:");
  console.error("1. Start the server with npm run start:http");
  console.error(`2. Confirm ${baseUrl}/health returns ok=true`);
  console.error("3. Re-run npm run smoke:projects");
}

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();

  let authStatusResponse;

  try {
    authStatusResponse = await requestJson<AuthStatusResponse>(`${baseUrl}${AUTH_STATUS_PATH}`);
  } catch (error) {
    printServerUnavailableMessage(baseUrl);
    console.error(`Details: ${formatError(error)}`);
    process.exitCode = 1;
    return;
  }

  const authStatus = extractJsonObject<AuthStatusResponse>(authStatusResponse.data);
  if (authStatusResponse.status !== 200) {
    console.error(
      `Smoke validation failed: ${formatServerError(authStatus, authStatusResponse.status)}`
    );
    process.exitCode = 1;
    return;
  }

  if (!authStatus?.loggedIn) {
    printNoTokenMessage(baseUrl);
    process.exitCode = 1;
    return;
  }

  const smokeResponse = await requestJson<SmokeProjectsResponse>(`${baseUrl}${SMOKE_PROJECTS_PATH}`);
  const smokeData = extractJsonObject<SmokeProjectsResponse>(smokeResponse.data);
  if (smokeResponse.status !== 200) {
    console.error(
      `Smoke validation failed: ${formatServerError(smokeData, smokeResponse.status)}`
    );
    if (smokeData?.details?.correlationId) {
      console.error(`Correlation ID: ${smokeData.details.correlationId}`);
    }
    process.exitCode = 1;
    return;
  }

  const preview =
    smokeData?.summary?.preview?.slice(0, PROJECT_PREVIEW_LIMIT).map((project) => ({
      id: project.id,
      name: project.name ?? undefined
    })) ?? [];
  const returnedProjects = smokeData?.summary?.returned ?? preview.length;
  const totalProjects = smokeData?.summary?.totalResults ?? returnedProjects;

  console.log("Autodesk smoke validation succeeded.");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Account: ${smokeData?.summary?.accountId ?? "(unknown)"}`);
  console.log(`Projects returned: ${returnedProjects}`);
  console.log(`Total projects reported: ${totalProjects}`);
  printProjectPreview(preview);
}

main().catch((error) => {
  console.error(`Smoke validation failed: ${formatError(error)}`);
  process.exit(1);
});
