import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./registerTools.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "autodesk-mcp-foundation",
    version: "0.1.0"
  });

  registerTools(server);
  return server;
}
