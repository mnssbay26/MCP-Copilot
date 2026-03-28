import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccTransmittalsTools } from "./tools.js";

export function createAccTransmittalsServer(): McpServer {
  const server = new McpServer({
    name: "mcp-acc-transmittals",
    version: "0.1.0"
  });

  registerAccTransmittalsTools(server);

  return server;
}
