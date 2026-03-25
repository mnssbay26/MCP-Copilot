import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  findSubmittals,
  getSubmittalsBySpec,
  getSubmittalsReport,
  getSubmittalsSummary
} from "./service.js";

const SubmittalsFiltersSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional text to search across submittal numbers, titles, specs, and managers."),
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional submittal statuses to include."),
  specSections: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional spec sections to include."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of submittal rows to include in the report.")
});

const SubmittalsToolInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: SubmittalsFiltersSchema.optional()
});

const FindSubmittalsInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a submittal number, title, manager, or spec section."),
  sessionKey: SessionKeySchema.optional()
});

export function registerAccSubmittalsTools(server: McpServer): void {
  server.registerTool(
    "get_submittals_summary",
    {
      title: "Get Submittals Summary",
      description: "Summarize project submittals by status and spec section.",
      inputSchema: SubmittalsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = SubmittalsToolInputSchema.parse(args);
        const result = await getSubmittalsSummary(input);
        return toToolResult(
          result,
          `Prepared a submittals summary for ${result.summary.totalSubmittals} matching items.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_submittals_by_spec",
    {
      title: "Get Submittals By Spec",
      description: "Count matching submittals by spec section for reporting or charts.",
      inputSchema: SubmittalsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = SubmittalsToolInputSchema.parse(args);
        const result = await getSubmittalsBySpec(input);
        return toToolResult(
          result,
          `Prepared spec section counts for ${result.summary.totalSubmittals} matching submittals.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_submittals_report",
    {
      title: "Get Submittals Report",
      description: "Create a concise submittals report payload with safe details and summary counts.",
      inputSchema: SubmittalsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = SubmittalsToolInputSchema.parse(args);
        const result = await getSubmittalsReport(input);
        return toToolResult(
          result,
          `Prepared a submittals report with ${result.summary.reportRows} rows and ${result.summary.totalSubmittals} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "find_submittals",
    {
      title: "Find Submittals",
      description: "Find submittals by number, title, manager, or spec section.",
      inputSchema: FindSubmittalsInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindSubmittalsInputSchema.parse(args);
        const result = await findSubmittals(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalMatches} matching submittals and returned ${result.summary.returnedRows} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
