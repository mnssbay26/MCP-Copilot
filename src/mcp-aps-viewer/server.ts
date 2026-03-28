import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApsViewerTools } from "./tools.js";

export function createApsViewerServer(): McpServer {
  const server = new McpServer({
    name: "mcp-aps-viewer",
    version: "0.1.0"
  });

  registerApsViewerTools(server);

  return server;
}
