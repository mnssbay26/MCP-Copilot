import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ListPaginationInputSchemaShape,
  ProjectIdSchema
} from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import { getIssues } from "./service.js";

const GetIssuesInputSchema = z.object({
  projectId: ProjectIdSchema,
  ...ListPaginationInputSchemaShape
});

export function registerAccIssuesTools(server: McpServer): void {
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
