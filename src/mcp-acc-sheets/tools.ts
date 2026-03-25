import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import { findSheets, getSheetLink, getSheetSummary } from "./service.js";

const FindSheetsInputSchema = z.object({
  projectId: ProjectIdSchema,
  discipline: z
    .string()
    .min(1)
    .optional()
    .describe("Optional sheet discipline filter, such as A, S, or M."),
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Optional search text for a sheet number or title."),
  sessionKey: SessionKeySchema.optional()
});

const GetSheetSummaryInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional()
});

const GetSheetLinkInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    sheetId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional sheet identifier when you already know the exact sheet."),
    sheetNumber: z
      .string()
      .min(1)
      .optional()
      .describe("Optional sheet number when you want to look up a published sheet link."),
    sessionKey: SessionKeySchema.optional()
  })
  .refine((value) => Boolean(value.sheetId || value.sheetNumber), {
    message: "Provide either sheetId or sheetNumber."
  });

export function registerAccSheetsTools(server: McpServer): void {
  server.registerTool(
    "find_sheets",
    {
      title: "Find Sheets",
      description: "Find project sheets by discipline, sheet number, or title.",
      inputSchema: FindSheetsInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindSheetsInputSchema.parse(args);
        const result = await findSheets(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalMatches} matching sheets and returned ${result.summary.returnedRows} rows.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_sheet_summary",
    {
      title: "Get Sheet Summary",
      description: "Summarize project sheets by discipline so PMs can see what is published.",
      inputSchema: GetSheetSummaryInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetSheetSummaryInputSchema.parse(args);
        const result = await getSheetSummary(input);
        return toToolResult(
          result,
          `Prepared a sheet summary for ${result.summary.totalSheets} sheets.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_sheet_link",
    {
      title: "Get Sheet Link",
      description: "Look up a sheet and return a safe ACC link when one is available.",
      inputSchema: GetSheetLinkInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetSheetLinkInputSchema.parse(args);
        const result = await getSheetLink(input);
        return toToolResult(
          result,
          result.summary.found
            ? result.summary.linkAvailable
              ? "Found the sheet and returned an ACC link."
              : "Found the sheet, but no ACC link was available in the API response."
            : "No matching sheet was found."
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
