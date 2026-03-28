import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccFormsTools } from "./tools.js";

export function createAccFormsServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-forms",
    version: "0.1.0"
  });

  registerAccFormsTools(server);

  return server;
}
