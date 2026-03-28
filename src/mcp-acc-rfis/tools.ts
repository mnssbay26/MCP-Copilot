import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  exportRfisCsv,
  findRfis,
  getRfisByType,
  getRfisReport,
  getRfisSummary
} from "./service.js";

const RfisFiltersSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional text to search across RFI numbers, titles, and assignments."),
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional RFI statuses to include."),
  types: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional RFI types to include."),
  attributeNames: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional custom attribute names to include in the RFI report."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of RFI rows to include in the report.")
});

const RfisToolInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: RfisFiltersSchema.optional()
});

const FindRfisInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for an RFI number, title, or assignee."),
  sessionKey: SessionKeySchema.optional()
});

const ExportRfisCsvInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: RfisFiltersSchema.omit({ limit: true }).optional()
});

export function registerAccRfisTools(server: McpServer): void {
  server.registerTool(
    "get_rfis_summary",
    {
      title: "Get RFIs Summary",
      description: "Summarize project RFIs by status, type, and aging buckets.",
      inputSchema: RfisToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = RfisToolInputSchema.parse(args);
        const result = await getRfisSummary(input);
        return toToolResult(
          result,
          `Prepared an RFI summary for ${result.summary.totalRfis} matching RFIs.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_rfis_by_type",
    {
      title: "Get RFIs By Type",
      description: "Count matching RFIs by type for reporting or charts.",
      inputSchema: RfisToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = RfisToolInputSchema.parse(args);
        const result = await getRfisByType(input);
        return toToolResult(
          result,
          `Prepared type counts for ${result.summary.totalRfis} matching RFIs.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_rfis_report",
    {
      title: "Get RFIs Report",
      description: "Create a concise RFI report payload with summary counts and safe detail rows.",
      inputSchema: RfisToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = RfisToolInputSchema.parse(args);
        const result = await getRfisReport(input);
        return toToolResult(
          result,
          `Prepared an RFI report with ${result.summary.reportRows} rows and ${result.summary.totalRfis} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "find_rfis",
    {
      title: "Find RFIs",
      description: "Find RFIs by number, title, or assignee without returning the raw APS payload.",
      inputSchema: FindRfisInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindRfisInputSchema.parse(args);
        const result = await findRfis(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalMatches} matching RFIs and returned ${result.summary.returnedRows} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "export_rfis_csv",
    {
      title: "Export RFIs CSV",
      description: "Generate a CSV artifact for project RFIs when the chat report is not enough.",
      inputSchema: ExportRfisCsvInputSchema.shape
    },
    async (args) => {
      try {
        const input = ExportRfisCsvInputSchema.parse(args);
        const result = await exportRfisCsv(input);
        return toToolResult(
          result,
          `Prepared an RFIs CSV artifact with ${result.rowCount} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
