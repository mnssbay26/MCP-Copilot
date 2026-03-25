import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccSubmittalsTools } from "./tools.js";

export function createAccSubmittalsServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-submittals",
    version: "0.1.0"
  });

  registerAccSubmittalsTools(server);

  return server;
}
