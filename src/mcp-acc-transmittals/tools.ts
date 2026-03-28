import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  exportTransmittalsCsv,
  findTransmittals,
  getTransmittalDetails,
  getTransmittalsReport,
  getTransmittalsSummary
} from "./service.js";

const TransmittalsFiltersSchema = z.object({
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional transmittal statuses to include."),
  senderNames: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional sender names to include."),
  dateFrom: z
    .string()
    .min(1)
    .optional()
    .describe("Optional inclusive lower date boundary in ISO 8601 or YYYY-MM-DD format."),
  dateTo: z
    .string()
    .min(1)
    .optional()
    .describe("Optional inclusive upper date boundary in ISO 8601 or YYYY-MM-DD format."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of visible transmittal rows in reports, or related rows in detail views.")
});

const GetTransmittalsSummaryInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: TransmittalsFiltersSchema.optional()
});

const FindTransmittalsInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a transmittal number, title, sender, or status."),
  sessionKey: SessionKeySchema.optional(),
  filters: TransmittalsFiltersSchema.optional()
});

const GetTransmittalsReportInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a transmittal number, title, sender, or status."),
  sessionKey: SessionKeySchema.optional(),
  filters: TransmittalsFiltersSchema.optional()
});

const GetTransmittalDetailsInputSchema = z.object({
  projectId: ProjectIdSchema,
  transmittalId: z
    .string()
    .min(1)
    .describe("The transmittal identifier to inspect."),
  sessionKey: SessionKeySchema.optional()
});

const ExportTransmittalsCsvInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a transmittal number, title, sender, or status."),
  sessionKey: SessionKeySchema.optional(),
  filters: TransmittalsFiltersSchema.omit({ limit: true }).optional()
});

export function registerAccTransmittalsTools(server: McpServer): void {
  server.registerTool(
    "get_transmittals_summary",
    {
      title: "Get Transmittals Summary",
      description: "Summarize project transmittals by status and sender.",
      inputSchema: GetTransmittalsSummaryInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetTransmittalsSummaryInputSchema.parse(args);
        const result = await getTransmittalsSummary(input);
        return toToolResult(
          result,
          `Prepared a transmittals summary for ${result.summary.totalTransmittals} matching records.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "find_transmittals",
    {
      title: "Find Transmittals",
      description: "Find transmittals by number, title, sender, date, or status.",
      inputSchema: FindTransmittalsInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindTransmittalsInputSchema.parse(args);
        const result = await findTransmittals(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalMatches} matching transmittals and returned ${result.summary.returnedRows} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_transmittals_report",
    {
      title: "Get Transmittals Report",
      description: "Create a bounded transmittals report with safe detail rows and retrieval metadata.",
      inputSchema: GetTransmittalsReportInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetTransmittalsReportInputSchema.parse(args);
        const result = await getTransmittalsReport(input);
        return toToolResult(
          result,
          `Prepared a transmittals report with ${result.summary.reportRows} rows and ${result.summary.totalTransmittals} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_transmittal_details",
    {
      title: "Get Transmittal Details",
      description: "Retrieve a transmittal record with recipients, folders, and documents.",
      inputSchema: GetTransmittalDetailsInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetTransmittalDetailsInputSchema.parse(args);
        const result = await getTransmittalDetails(input);
        return toToolResult(
          result,
          result.summary.found
            ? `Loaded the requested transmittal with ${result.summary.documentCount} documents and ${result.summary.recipientCount} recipients.`
            : `The requested transmittal could not be found.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "export_transmittals_csv",
    {
      title: "Export Transmittals CSV",
      description: "Generate a CSV artifact for project transmittals when the chat report is not enough.",
      inputSchema: ExportTransmittalsCsvInputSchema.shape
    },
    async (args) => {
      try {
        const input = ExportTransmittalsCsvInputSchema.parse(args);
        const result = await exportTransmittalsCsv(input);
        return toToolResult(
          result,
          `Prepared a transmittals CSV artifact with ${result.rowCount} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
