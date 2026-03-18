import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccIssuesTools } from "./tools.js";

export function createAccIssuesServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-issues",
    version: "0.1.0"
  });

  registerAccIssuesTools(server);

  return server;
}
