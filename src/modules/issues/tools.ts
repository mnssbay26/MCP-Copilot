import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toToolError, toToolResult } from "../../mcp/toolResult.js";
import { getIssues } from "./service.js";

const GetIssuesInputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe("ACC project identifier. A leading 'b.' prefix is accepted."),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of issues to return."),
  offset: z.number().int().min(0).default(0).describe("Zero-based issue offset.")
});

export function registerIssuesTools(server: McpServer) {
  server.registerTool(
    "get_issues",
    {
      title: "Get Issues",
      description: "List issues for a specific ACC project.",
      inputSchema: GetIssuesInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetIssuesInputSchema.parse(args);
        return toToolResult(await getIssues(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
