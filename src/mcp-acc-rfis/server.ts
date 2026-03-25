import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccRfisTools } from "./tools.js";

export function createAccRfisServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-rfis",
    version: "0.1.0"
  });

  registerAccRfisTools(server);

  return server;
}
