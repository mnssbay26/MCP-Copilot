import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RegionSchema } from "../shared/config/env.js";
import {
  ListPaginationInputSchemaShape,
  ProjectIdSchema
} from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import { getProjects, getUsers } from "./service.js";

const GetProjectsInputSchema = z.object({
  ...ListPaginationInputSchemaShape,
  region: RegionSchema.optional().describe("Optional ACC region override.")
});

const GetUsersInputSchema = z.object({
  projectId: ProjectIdSchema,
  ...ListPaginationInputSchemaShape,
  region: RegionSchema.optional().describe("Optional ACC region override.")
});

export function registerAccAccountAdminTools(server: McpServer): void {
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
