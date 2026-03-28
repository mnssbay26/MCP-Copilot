import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDataManagementTools } from "./tools.js";

export function createDataManagementServer(): McpServer {
  const server = new McpServer({
    name: "mcp-data-management",
    version: "0.1.0"
  });

  registerDataManagementTools(server);

  return server;
}
