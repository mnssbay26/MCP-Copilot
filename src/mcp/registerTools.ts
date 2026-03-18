import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccAdminTools } from "../modules/accAdmin/tools.js";
import { registerIssuesTools } from "../modules/issues/tools.js";

export function registerTools(server: McpServer): void {
  registerAccAdminTools(server);
  registerIssuesTools(server);
}
