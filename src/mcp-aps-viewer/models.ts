import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface ViewerSearchInput {
  query?: string;
  extensions?: string[];
}

export interface ViewerCandidate {
  itemId: string;
  name: string;
  folderPath?: string;
  extension?: string;
  latestVersionId?: string;
  latestVersionUrn?: string;
  latestVersionNumber?: number;
  updatedAt?: string;
  accUrl?: string;
}

export interface ViewerPayloadResult {
  summary: {
    found: boolean;
    sourceType: "version" | "item" | "search";
    alternativeCount: number;
  };
  result: {
    projectId: string;
    sourceType: "version" | "item" | "search";
    itemId?: string;
    versionId: string;
    versionUrn: string;
    encodedUrn: string;
    viewerDocumentId: string;
    manifestPath: string;
    displayName?: string;
    versionNumber?: number;
    fileType?: string;
    accUrl?: string;
    viewerConfig: {
      env: "AutodeskProduction";
      api: "derivativeV2";
      documentId: string;
      manifestPath: string;
      requiredScopes: string[];
    };
    alternatives?: ViewerCandidate[];
  } | null;
  warnings: ToolWarning[];
}
