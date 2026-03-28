import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  buildViewerPayloadFromItem,
  buildViewerPayloadFromSearch,
  buildViewerPayloadFromVersion
} from "./service.js";

const TraversalOptionsSchema = z.object({
  maxDepth: z.number().int().min(0).max(10).optional(),
  maxFoldersVisited: z.number().int().min(1).max(200).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  pageLimit: z.number().int().min(1).max(200).optional(),
  maxPagesPerFolder: z.number().int().min(1).max(10).optional(),
  includeHidden: z.boolean().optional()
});

const BuildViewerPayloadFromVersionInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    versionId: z
      .string()
      .min(1)
      .optional()
      .describe("The version identifier to convert into a viewer-ready payload."),
    versionUrn: z
      .string()
      .min(1)
      .optional()
      .describe("The version URN to convert directly into a viewer-ready payload."),
    sessionKey: SessionKeySchema.optional()
  })
  .superRefine((value, ctx) => {
    const providedCount = [value.versionId, value.versionUrn].filter(Boolean).length;

    if (providedCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of versionId or versionUrn.",
        path: ["versionId"]
      });
      return;
    }

    if (providedCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of versionId or versionUrn, not both.",
        path: ["versionId"]
      });
    }
  });

const BuildViewerPayloadFromItemInputSchema = z.object({
  projectId: ProjectIdSchema,
  itemId: z
    .string()
    .min(1)
    .describe("The Data Management item identifier whose latest version should be prepared for viewing."),
  sessionKey: SessionKeySchema.optional()
});

const BuildViewerPayloadFromSearchInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    query: z
      .string()
      .min(1)
      .optional()
      .describe("Optional search text to match against model file names."),
    extensions: z
      .array(z.string().min(1))
      .max(20)
      .optional()
      .describe("Optional list of model file extensions to search within."),
    sessionKey: SessionKeySchema.optional(),
    traversalOptions: TraversalOptionsSchema.optional()
  })
  .refine((value) => Boolean(value.query || (value.extensions && value.extensions.length > 0)), {
    message: "Provide a query, extensions, or both.",
    path: ["query"]
  });

export function registerApsViewerTools(server: McpServer): void {
  server.registerTool(
    "build_viewer_payload_from_version",
    {
      title: "Build Viewer Payload From Version",
      description: "Prepare a viewer-ready payload from a Docs version identifier or URN.",
      inputSchema: BuildViewerPayloadFromVersionInputSchema.shape
    },
    async (args) => {
      try {
        const input = BuildViewerPayloadFromVersionInputSchema.parse(args);
        const result = await buildViewerPayloadFromVersion(input);
        return toToolResult(
          result,
          result.summary.found
            ? `Prepared a viewer-ready payload from the requested version.`
            : `A viewer-ready version could not be resolved.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "build_viewer_payload_from_item",
    {
      title: "Build Viewer Payload From Item",
      description: "Prepare a viewer-ready payload from the latest version of a Docs file item.",
      inputSchema: BuildViewerPayloadFromItemInputSchema.shape
    },
    async (args) => {
      try {
        const input = BuildViewerPayloadFromItemInputSchema.parse(args);
        const result = await buildViewerPayloadFromItem(input);
        return toToolResult(
          result,
          result.summary.found
            ? `Prepared a viewer-ready payload from the requested file item.`
            : `A viewer-ready item could not be resolved.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "build_viewer_payload_from_search",
    {
      title: "Build Viewer Payload From Search",
      description: "Search project model files and prepare the best viewer-ready payload available.",
      inputSchema: BuildViewerPayloadFromSearchInputSchema.shape
    },
    async (args) => {
      try {
        const input = BuildViewerPayloadFromSearchInputSchema.parse(args);
        const result = await buildViewerPayloadFromSearch(input);
        return toToolResult(
          result,
          result.summary.found
            ? `Prepared a viewer-ready payload from the best matching search result.`
            : `No viewer-ready search result could be resolved.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
