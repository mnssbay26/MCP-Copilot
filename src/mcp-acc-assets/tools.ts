import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  getAssetsByCategory,
  getAssetsByStatus,
  getAssetsReport,
  getAssetsSummary
} from "./service.js";

const AssetsFiltersSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text to narrow the asset results."),
  categories: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional asset category names to include."),
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional asset status names to include."),
  attributeNames: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional custom attribute names to include in the asset report."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of asset rows to include in the report.")
});

const AssetsToolInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: AssetsFiltersSchema.optional()
});

export function registerAccAssetsTools(server: McpServer): void {
  server.registerTool(
    "get_assets_summary",
    {
      title: "Get Assets Summary",
      description: "Show a project-level asset summary grouped by category, status, and assignee.",
      inputSchema: AssetsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = AssetsToolInputSchema.parse(args);
        const result = await getAssetsSummary(input);
        return toToolResult(
          result,
          `Prepared an asset summary for ${result.summary.totalAssets} matching assets.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_assets_by_category",
    {
      title: "Get Assets By Category",
      description: "Count matching project assets by category for reporting or charts.",
      inputSchema: AssetsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = AssetsToolInputSchema.parse(args);
        const result = await getAssetsByCategory(input);
        return toToolResult(
          result,
          `Prepared category counts for ${result.summary.totalAssets} matching assets.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_assets_by_status",
    {
      title: "Get Assets By Status",
      description: "Count matching project assets by status for reporting or charts.",
      inputSchema: AssetsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = AssetsToolInputSchema.parse(args);
        const result = await getAssetsByStatus(input);
        return toToolResult(
          result,
          `Prepared status counts for ${result.summary.totalAssets} matching assets.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_assets_report",
    {
      title: "Get Assets Report",
      description: "Create a concise asset dashboard payload with summary counts and safe asset details.",
      inputSchema: AssetsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = AssetsToolInputSchema.parse(args);
        const result = await getAssetsReport(input);
        return toToolResult(
          result,
          `Prepared an asset report with ${result.summary.reportRows} asset rows and ${result.summary.totalAssets} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
