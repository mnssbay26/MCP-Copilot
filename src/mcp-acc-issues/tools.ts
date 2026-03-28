import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ListPaginationInputSchemaShape,
  ProjectIdSchema,
  SessionKeySchema
} from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  exportIssuesCsv,
  getIssues,
  getIssuesReport,
  getIssuesSummary
} from "./service.js";

const GetIssuesInputSchema = z.object({
  projectId: ProjectIdSchema,
  ...ListPaginationInputSchemaShape,
  sessionKey: SessionKeySchema.optional()
});

const IssuesFiltersSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional text to search across issue number, title, status, and assignment."),
  statuses: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional issue statuses to include."),
  assigneeNames: z
    .array(z.string().min(1))
    .max(25)
    .optional()
    .describe("Optional assignee display names to include."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of issue rows to include in the report.")
});

const IssuesToolInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: IssuesFiltersSchema.optional()
});

const IssuesCsvExportInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional(),
  filters: IssuesFiltersSchema.omit({ limit: true }).optional()
});

export function registerAccIssuesTools(server: McpServer): void {
  server.registerTool(
    "get_issues",
    {
      title: "Get Issues",
      description: "List issues for a specific ACC project in the current Autodesk user session.",
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

  server.registerTool(
    "get_issues_summary",
    {
      title: "Get Issues Summary",
      description: "Summarize project issues by status and assignee for concise Copilot reporting.",
      inputSchema: IssuesToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = IssuesToolInputSchema.parse(args);
        const result = await getIssuesSummary(input);
        return toToolResult(
          result,
          `Prepared an issues summary for ${result.summary.totalIssues} matching issues.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_issues_report",
    {
      title: "Get Issues Report",
      description: "Create a bounded issues report with safe detail rows and retrieval metadata.",
      inputSchema: IssuesToolInputSchema.shape
    },
    async (args) => {
      try {
        const input = IssuesToolInputSchema.parse(args);
        const result = await getIssuesReport(input);
        return toToolResult(
          result,
          `Prepared an issues report with ${result.summary.reportRows} rows and ${result.summary.totalIssues} total matches.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "export_issues_csv",
    {
      title: "Export Issues CSV",
      description: "Generate a CSV artifact for project issues when the chat summary is not enough.",
      inputSchema: IssuesCsvExportInputSchema.shape
    },
    async (args) => {
      try {
        const input = IssuesCsvExportInputSchema.parse(args);
        const result = await exportIssuesCsv(input);
        return toToolResult(
          result,
          `Prepared an issues CSV artifact with ${result.rowCount} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
