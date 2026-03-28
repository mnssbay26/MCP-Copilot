import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectIdSchema, SessionKeySchema } from "../shared/mcp/sharedSchemas.js";
import { toToolError, toToolResult } from "../shared/mcp/toolResult.js";
import {
  findModelFiles,
  getFolderContents,
  getItem,
  getItemVersions,
  getTopFolders
} from "./service.js";

const PaginationSchema = z.object({
  pageNumber: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based page number for Data Management list results."),
  pageLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of Data Management results to include in a page.")
});

const TraversalOptionsSchema = z.object({
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe("Maximum folder depth to traverse beneath the project’s top folders."),
  maxFoldersVisited: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of folders to visit during traversal."),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of matching files to return."),
  pageLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of folder contents to request per page."),
  maxPagesPerFolder: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum number of paginated content pages to read per folder."),
  includeHidden: z
    .boolean()
    .optional()
    .describe("Whether deleted or hidden Docs entries should be included when available.")
});

const GetTopFoldersInputSchema = z.object({
  projectId: ProjectIdSchema,
  sessionKey: SessionKeySchema.optional()
});

const GetFolderContentsInputSchema = z.object({
  projectId: ProjectIdSchema,
  folderId: z
    .string()
    .min(1)
    .describe("The Data Management folder identifier to inspect."),
  sessionKey: SessionKeySchema.optional(),
  pagination: PaginationSchema.optional(),
  includeHidden: z
    .boolean()
    .optional()
    .describe("Whether deleted or hidden Docs entries should be included when available.")
});

const GetItemInputSchema = z.object({
  projectId: ProjectIdSchema,
  itemId: z
    .string()
    .min(1)
    .describe("The Data Management item identifier to inspect."),
  sessionKey: SessionKeySchema.optional()
});

const GetItemVersionsInputSchema = z.object({
  projectId: ProjectIdSchema,
  itemId: z
    .string()
    .min(1)
    .describe("The Data Management item identifier whose versions should be listed."),
  sessionKey: SessionKeySchema.optional(),
  pagination: PaginationSchema.optional()
});

const FindModelFilesInputSchema = z.object({
  projectId: ProjectIdSchema,
  extensions: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("A list of model file extensions to search for, such as rvt or nwd."),
  sessionKey: SessionKeySchema.optional(),
  traversalOptions: TraversalOptionsSchema.optional()
});

export function registerDataManagementTools(server: McpServer): void {
  server.registerTool(
    "get_top_folders",
    {
      title: "Get Top Folders",
      description: "List the highest-level Docs folders a project user can browse.",
      inputSchema: GetTopFoldersInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetTopFoldersInputSchema.parse(args);
        const result = await getTopFolders(input);
        return toToolResult(
          result,
          `Found ${result.summary.totalFolders} accessible top-level folders for the project.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_folder_contents",
    {
      title: "Get Folder Contents",
      description: "List the folders and files inside a specific Docs folder.",
      inputSchema: GetFolderContentsInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetFolderContentsInputSchema.parse(args);
        const result = await getFolderContents(input);
        return toToolResult(
          result,
          `Loaded ${result.summary.totalEntries} entries from the requested folder page.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_item",
    {
      title: "Get Item",
      description: "Retrieve a Docs file item with its latest version details.",
      inputSchema: GetItemInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetItemInputSchema.parse(args);
        const result = await getItem(input);
        return toToolResult(
          result,
          result.summary.found
            ? `Loaded the requested file item and its latest version details.`
            : `The requested file item could not be found.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_item_versions",
    {
      title: "Get Item Versions",
      description: "List the available versions of a Docs file item.",
      inputSchema: GetItemVersionsInputSchema.shape
    },
    async (args) => {
      try {
        const input = GetItemVersionsInputSchema.parse(args);
        const result = await getItemVersions(input);
        return toToolResult(
          result,
          `Loaded ${result.summary.returnedVersions} versions for the requested file item.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "find_model_files",
    {
      title: "Find Model Files",
      description: "Traverse Docs folders safely to find model files by extension.",
      inputSchema: FindModelFilesInputSchema.shape
    },
    async (args) => {
      try {
        const input = FindModelFilesInputSchema.parse(args);
        const result = await findModelFiles(input);
        return toToolResult(
          result,
          `Found ${result.summary.returnedFiles} matching model files after visiting ${result.summary.visitedFolders} folders.`
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
