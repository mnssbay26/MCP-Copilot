import "dotenv/config";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccAccountAdminTools } from "./mcp-acc-account-admin/tools.js";
import { registerAccIssuesTools } from "./mcp-acc-issues/tools.js";
import { createHttpApp } from "./shared/bootstrap/httpApp.js";
import { runStdioServer } from "./shared/bootstrap/stdio.js";
import { getConfig, type TransportMode } from "./shared/config/env.js";
import { logger } from "./shared/utils/logger.js";

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

async function runStdioTransport(): Promise<void> {
  await runStdioServer({
    createServer: createCombinedMcpServer,
    label: "Autodesk MCP foundation"
  });
}

function runHttpTransport(): void {
  const config = getConfig();
  const app = createHttpApp({
    createServer: createCombinedMcpServer
  });

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
