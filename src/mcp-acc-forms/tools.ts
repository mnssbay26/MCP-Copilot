import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import { findForms, getFormsReport, getFormsSummary } from "./service.js";

const FormsFiltersSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text to narrow forms by name, number, template, or status."),
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional form statuses to include."),
  templateNames: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional form template names to include."),
  templateTypes: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional form template types to include."),
  includeInactiveFormTemplates: z
    .boolean()
    .optional()
    .describe("Include forms tied to inactive or archived templates when set to true."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of form rows to include in the report.")
});

const FormsToolInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: FormsFiltersSchema.optional()
});

const FindFormsInputSchema = z.object({
  projectId: ProjectIdSchema,
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a form name, number, template, or status."),
  sessionKey: SessionKeySchema.optional(),
  filters: FormsFiltersSchema.optional()
});

export function registerAccFormsTools(server: McpServer): void {
  server.registerTool(
    "get_forms_summary",
    {
      title: "Get Forms Summary",
      description: "Summarize project forms by status, template type, and template name.",
      inputSchema: FormsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = FormsToolInputSchema.parse(args);
        const result = await getFormsSummary(input);
        return toToolResult(
          result,
          `Prepared a forms summary for ${result.summary.totalForms} matching forms.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "find_forms",
    {
      title: "Find Forms",
      description: "Find forms by name, number, template, or status.",
      inputSchema: FindFormsInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindFormsInputSchema.parse(args);
        const result = await findForms(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalMatches} matching forms and returned ${result.summary.returnedRows} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_forms_report",
    {
      title: "Get Forms Report",
      description: "Create a concise forms report payload with safe rows and summary counts.",
      inputSchema: FormsToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = FormsToolInputSchema.parse(args);
        const result = await getFormsReport(input);
        return toToolResult(
          result,
          `Prepared a forms report with ${result.summary.reportRows} rows and ${result.summary.totalForms} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
