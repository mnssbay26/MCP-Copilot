import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RegionSchema } from "../../config/env.js";
import { toToolError, toToolResult } from "../../mcp/toolResult.js";
import { getProjects, getUsers } from "./service.js";

const BaseListInputSchema = {
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return."),
  offset: z.number().int().min(0).default(0).describe("Zero-based result offset.")
};

const GetProjectsInputSchema = z.object({
  ...BaseListInputSchema,
  region: RegionSchema.optional().describe("Optional ACC region override.")
});

const GetUsersInputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe("ACC project identifier. A leading 'b.' prefix is accepted."),
  ...BaseListInputSchema,
  region: RegionSchema.optional().describe("Optional ACC region override.")
});

export function registerAccAdminTools(server: McpServer) {
  server.registerTool(
    "get_projects",
    {
      title: "Get Projects",
      description: "List ACC projects for the configured Autodesk account.",
      inputSchema: GetProjectsInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetProjectsInputSchema.parse(args);
        return toToolResult(await getProjects(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_users",
    {
      title: "Get Users",
      description: "List project users for a specific ACC project.",
      inputSchema: GetUsersInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetUsersInputSchema.parse(args);
        return toToolResult(await getUsers(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
