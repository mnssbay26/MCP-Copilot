import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccAccountAdminTools } from "./tools.js";

export function createAccAccountAdminServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-account-admin",
    version: "0.1.0"
  });

  registerAccAccountAdminTools(server);

  return server;
}
