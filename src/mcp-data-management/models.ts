import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface DataManagementPaginationInput {
  pageNumber?: number;
  pageLimit?: number;
}

export interface DataManagementTraversalOptions {
  maxDepth?: number;
  maxFoldersVisited?: number;
  maxResults?: number;
  pageLimit?: number;
  maxPagesPerFolder?: number;
  includeHidden?: boolean;
}

export interface DataManagementPageInfo {
  pageNumber: number;
  pageLimit: number;
  returned: number;
  hasNextPage: boolean;
  nextPageNumber: number | null;
}

export interface TopFolderResultItem {
  folderId: string;
  name: string;
  folderType: string;
  objectCount?: number;
  path?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  hidden?: boolean;
  accUrl?: string;
}

export interface FolderContentResultItem {
  entryType: "folder" | "item";
  id: string;
  name: string;
  folderType?: string;
  path?: string;
  objectCount?: number;
  fileType?: string;
  extensionType?: string;
  latestVersionId?: string;
  latestVersionUrn?: string;
  latestVersionNumber?: number;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  hidden?: boolean;
  accUrl?: string;
}

export interface ItemSummaryResult {
  itemId: string;
  name: string;
  itemType: string;
  pathInProject?: string;
  latestVersionId?: string;
  latestVersionUrn?: string;
  latestVersionNumber?: number;
  fileType?: string;
  extensionType?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  accUrl?: string;
}

export interface ItemVersionResult {
  versionId: string;
  versionUrn: string;
  versionNumber?: number;
  name: string;
  displayName?: string;
  fileType?: string;
  extensionType?: string;
  mimeType?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  accUrl?: string;
}

export interface ModelFileSearchResultItem {
  itemId: string;
  name: string;
  extension: string;
  folderPath?: string;
  latestVersionId?: string;
  latestVersionUrn?: string;
  latestVersionNumber?: number;
  updatedAt?: string;
  updatedBy?: string;
  accUrl?: string;
}

export interface TopFoldersResult {
  summary: {
    totalFolders: number;
    hiddenFolders: number;
  };
  results: TopFolderResultItem[];
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
    hubId: string;
  };
  warnings: ToolWarning[];
}

export interface FolderContentsResult {
  summary: {
    totalEntries: number;
    folderCount: number;
    itemCount: number;
  };
  results: FolderContentResultItem[];
  pagination: DataManagementPageInfo;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
    folderId: string;
  };
  warnings: ToolWarning[];
}

export interface ItemResult {
  summary: {
    found: boolean;
    hasLatestVersion: boolean;
  };
  result: ItemSummaryResult | null;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
    itemId: string;
  };
  warnings: ToolWarning[];
}

export interface ItemVersionsResult {
  summary: {
    totalVersions: number;
    returnedVersions: number;
  };
  results: ItemVersionResult[];
  pagination: DataManagementPageInfo;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
    itemId: string;
  };
  warnings: ToolWarning[];
}

export interface ModelFilesSearchResult {
  summary: {
    matchedFiles: number;
    returnedFiles: number;
    visitedFolders: number;
    extensionsMatched: number;
  };
  results: ModelFileSearchResultItem[];
  filtersApplied: {
    extensions: string[];
    traversal: Required<Pick<
      DataManagementTraversalOptions,
      "maxDepth" | "maxFoldersVisited" | "maxResults" | "pageLimit" | "maxPagesPerFolder"
    >> & Pick<DataManagementTraversalOptions, "includeHidden">;
  };
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}
