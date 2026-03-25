import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccSheetsTools } from "./tools.js";

export function createAccSheetsServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-sheets",
    version: "0.1.0"
  });

  registerAccSheetsTools(server);

  return server;
}
