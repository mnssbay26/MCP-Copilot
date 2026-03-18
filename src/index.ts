import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApp } from "./bootstrap/httpApp.js";
import { getConfig, type TransportMode } from "./config/env.js";
import { createMcpServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";

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

async function runStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Autodesk MCP foundation running on stdio transport.");
}

function runHttpTransport(): void {
  const config = getConfig();
  const app = createHttpApp();

  app.listen(config.port, () => {
    logger.info(`Autodesk MCP foundation listening on http://localhost:${config.port}`);
  });
}

async function main(): Promise<void> {
  const config = getConfig();
  const transport = resolveTransport(config.transport);

  if (transport === "stdio") {
    await runStdioTransport();
    return;
  }

  runHttpTransport();
}

main().catch((error) => {
  logger.error("Failed to start Autodesk MCP foundation.", error);
  process.exit(1);
});
