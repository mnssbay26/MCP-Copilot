import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "../utils/logger.js";

export interface RunStdioServerOptions {
  createServer: () => McpServer;
  label: string;
}

export async function runStdioServer(
  options: RunStdioServerOptions
): Promise<void> {
  const server = options.createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info(`${options.label} running on stdio transport.`);
}
