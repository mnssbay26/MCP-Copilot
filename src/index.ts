import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjects } from "./mcp-acc-account-admin/service.js";
import { registerAccAccountAdminTools } from "./mcp-acc-account-admin/tools.js";
import { registerAccIssuesTools } from "./mcp-acc-issues/tools.js";
import { getAuthStatus } from "./shared/auth/apsAuth.js";
import { createHttpApp } from "./shared/bootstrap/httpApp.js";
import { runStdioServer } from "./shared/bootstrap/stdio.js";
import { getConfig, type TransportMode } from "./shared/config/env.js";
import {
  ApsAuthRequiredError,
  ApsHttpError,
  ConfigError,
  TokenRefreshError
} from "./shared/utils/errors.js";
import { logger } from "./shared/utils/logger.js";

import mcpRouter from "./http/routes/mcpServerHttp.js";

/**
 * 👇 ADICIÓN: router para exponer /.well-known/mcp.json
 * Si guardaste el archivo en src/http/routers/wellKnown.ts,
 * cambia la línea de importación por la versión comentada.
 */
import wellKnownRouter from "./http/routes/wellKnown.js";
// import wellKnownRouter from "./http/routers/wellKnown.js"; // <-- usa esta si tu carpeta es "routers"

const SMOKE_PROJECT_LIMIT = 5;

function resolveTransport(defaultTransport: TransportMode): TransportMode {
  const args = new Set(process.argv.slice(2).map((value) => value.trim().toLowerCase()));
  if (args.has("--stdio")) {
    return "stdio";
  }

  if (args.has("--http")) {
    return "http";
  }

  return defaultTransport;
}

function isDirectExecution(metaUrl: string): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return pathToFileURL(entrypoint).href === metaUrl;
}

export function createCombinedMcpServer(): McpServer {
  const server = new McpServer({
    name: "autodesk-mcp-foundation",
    version: "0.1.0"
  });

  registerAccAccountAdminTools(server);
  registerAccIssuesTools(server);

  return server;
}

function resolveSmokeRouteStatus(error: unknown): number {
  if (error instanceof ApsAuthRequiredError) {
    return 401;
  }

  if (error instanceof ApsHttpError || error instanceof TokenRefreshError) {
    return 502;
  }

  if (error instanceof ConfigError) {
    return 500;
  }

  return 500;
}

function formatSmokeRouteError(error: unknown): string {
  if (error instanceof ApsHttpError) {
    return `APS request failed while validating get_projects: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function registerSmokeRoutes(app: Express): void {
  app.get("/internal/smoke/projects", async (_req, res) => {
    try {
      const authStatus = await getAuthStatus();

      if (!authStatus.loggedIn) {
        res.status(401).json({
          error:
            "No Autodesk token is cached for this server process. Complete GET /auth/url first.",
          authStatus
        });
        return;
      }

      const result = await getProjects({
        limit: SMOKE_PROJECT_LIMIT,
        offset: 0
      });

      res.json({
        ok: true,
        authStatus,
        summary: {
          accountId: result.meta.accountId,
          returned: result.results.length,
          totalResults: result.pagination.totalResults ?? result.results.length,
          preview: result.results
            .slice(0, SMOKE_PROJECT_LIMIT)
            .map((project) => ({
              id: project.id,
              name: project.name ?? null
            }))
        },
        warnings: result.warnings
      });
    } catch (error) {
      logger.error("Smoke validation route failed.", error);
      res.status(resolveSmokeRouteStatus(error)).json({
        error: formatSmokeRouteError(error),
        details:
          error instanceof ApsHttpError
            ? {
                status: error.status,
                correlationId: error.correlationId
              }
            : undefined
      });
    }
  });
}

export function createRootHttpApp(): Express {
  const app = createHttpApp({
    createServer: createCombinedMcpServer
  });

  // 👇 ADICIÓN: publica /.well-known/mcp.json desde tu servidor
  app.use(wellKnownRouter);
  app.use(mcpRouter);

  // Rutas de validación ya existentes
  registerSmokeRoutes(app);

  return app;
}

async function runStdioTransport(): Promise<void> {
  await runStdioServer({
    createServer: createCombinedMcpServer,
    label: "Autodesk MCP foundation"
  });
}

function runHttpTransport(): void {
  const config = getConfig();
  const app = createRootHttpApp();

  app.listen(config.port, () => {
    logger.info(`Autodesk MCP foundation listening on http://localhost:${config.port}`);
  });
}

export async function main(): Promise<void> {
  const config = getConfig();
  const transport = resolveTransport(config.transport);

  if (transport === "stdio") {
    await runStdioTransport();
    return;
  }

  runHttpTransport();
}

if (isDirectExecution(import.meta.url)) {
  void main().catch((error) => {
    logger.error("Failed to start Autodesk MCP foundation.", error);
    process.exit(1);
  });
}