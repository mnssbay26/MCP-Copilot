import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccAssetsTools } from "./tools.js";

export function createAccAssetsServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-assets",
    version: "0.1.0"
  });

  registerAccAssetsTools(server);

  return server;
}
