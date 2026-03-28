import { APS_MODEL_DERIVATIVE_BASE_URL } from "../shared/aps/endpoints.js";
import { ensureBPrefix } from "../shared/mcp/listUtils.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";
import type { DataManagementTraversalOptions } from "../mcp-data-management/models.js";
import {
  findModelFiles,
  getItem,
  getVersionDetails
} from "../mcp-data-management/service.js";
import type { ViewerCandidate, ViewerPayloadResult } from "./models.js";

const DEFAULT_SEARCH_EXTENSIONS = ["rvt", "nwd", "ifc", "nwc", "dwg", "dxf"];

function encodeViewerUrn(versionUrn: string): string {
  return Buffer.from(versionUrn, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildViewerPayload(input: {
  projectId: string;
  sourceType: "version" | "item" | "search";
  versionId: string;
  versionUrn: string;
  displayName?: string;
  versionNumber?: number;
  fileType?: string;
  accUrl?: string;
  itemId?: string;
  alternatives?: ViewerCandidate[];
}): ViewerPayloadResult {
  const encodedUrn = encodeViewerUrn(input.versionUrn);
  const viewerDocumentId = `urn:${encodedUrn}`;
  const manifestPath = `${APS_MODEL_DERIVATIVE_BASE_URL}/designdata/${encodedUrn}/manifest`;
  const alternatives = input.alternatives?.filter(
    (candidate) => candidate.latestVersionUrn !== input.versionUrn
  );

  return {
    summary: {
      found: true,
      sourceType: input.sourceType,
      alternativeCount: alternatives?.length ?? 0
    },
    result: {
      projectId: ensureBPrefix(input.projectId),
      sourceType: input.sourceType,
      itemId: input.itemId,
      versionId: input.versionId,
      versionUrn: input.versionUrn,
      encodedUrn,
      viewerDocumentId,
      manifestPath,
      displayName: input.displayName,
      versionNumber: input.versionNumber,
      fileType: input.fileType,
      accUrl: input.accUrl,
      viewerConfig: {
        env: "AutodeskProduction",
        api: "derivativeV2",
        documentId: viewerDocumentId,
        manifestPath,
        requiredScopes: ["data:read", "viewables:read"]
      },
      ...(alternatives && alternatives.length > 0 ? { alternatives } : {})
    },
    warnings: []
  };
}

function buildNotFoundPayload(
  sourceType: "version" | "item" | "search",
  warnings: ToolWarning[]
): ViewerPayloadResult {
  return {
    summary: {
      found: false,
      sourceType,
      alternativeCount: 0
    },
    result: null,
    warnings
  };
}

function scoreCandidate(candidate: ViewerCandidate, query?: string): number {
  if (!query) {
    return Date.parse(candidate.updatedAt ?? "") || 0;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedName = candidate.name.trim().toLowerCase();
  const normalizedPath = (candidate.accUrl ?? "").toLowerCase();

  if (normalizedName === normalizedQuery) {
    return 10_000;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 5_000;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 2_000;
  }

  if (normalizedPath.includes(normalizedQuery)) {
    return 1_000;
  }

  return Date.parse(candidate.updatedAt ?? "") || 0;
}

function sortCandidates(candidates: ViewerCandidate[], query?: string): ViewerCandidate[] {
  return [...candidates].sort((left, right) => scoreCandidate(right, query) - scoreCandidate(left, query));
}

export async function buildViewerPayloadFromVersion(input: {
  projectId: string;
  versionId?: string;
  versionUrn?: string;
  sessionKey?: string;
}): Promise<ViewerPayloadResult> {
  const projectId = ensureBPrefix(input.projectId);
  const warnings: ToolWarning[] = [];

  let versionUrn = input.versionUrn?.trim();
  let versionId = input.versionId?.trim();
  let versionDetails = null;

  if (!versionUrn && versionId) {
    versionDetails = await getVersionDetails({
      projectId,
      versionId,
      sessionKey: input.sessionKey
    });
    versionUrn = versionDetails?.versionUrn ?? (versionId.startsWith("urn:") ? versionId : undefined);
    versionId = versionDetails?.versionId ?? versionId;
  }

  if (versionUrn && !versionId) {
    versionId = versionUrn;
  }

  if (!versionUrn || !versionId) {
    warnings.push({
      code: "viewer_version_not_found",
      message: "A matching version could not be resolved for the viewer payload."
    });
    return buildNotFoundPayload("version", warnings);
  }

  return buildViewerPayload({
    projectId,
    sourceType: "version",
    versionId,
    versionUrn,
    displayName: versionDetails?.displayName ?? versionDetails?.name,
    versionNumber: versionDetails?.versionNumber,
    fileType: versionDetails?.fileType,
    accUrl: versionDetails?.accUrl
  });
}

export async function buildViewerPayloadFromItem(input: {
  projectId: string;
  itemId: string;
  sessionKey?: string;
}): Promise<ViewerPayloadResult> {
  const projectId = ensureBPrefix(input.projectId);
  const item = await getItem({
    projectId,
    itemId: input.itemId,
    sessionKey: input.sessionKey
  });

  if (!item.result?.latestVersionUrn || !item.result.latestVersionId) {
    return buildNotFoundPayload("item", [
      {
        code: "viewer_item_not_found",
        message: "The requested item does not expose a latest version URN."
      },
      ...item.warnings
    ]);
  }

  const payload = buildViewerPayload({
    projectId,
    sourceType: "item",
    itemId: item.result.itemId,
    versionId: item.result.latestVersionId,
    versionUrn: item.result.latestVersionUrn,
    displayName: item.result.name,
    versionNumber: item.result.latestVersionNumber,
    fileType: item.result.fileType,
    accUrl: item.result.accUrl
  });
  payload.warnings.push(...item.warnings);
  return payload;
}

export async function buildViewerPayloadFromSearch(input: {
  projectId: string;
  query?: string;
  extensions?: string[];
  sessionKey?: string;
  traversalOptions?: DataManagementTraversalOptions;
}): Promise<ViewerPayloadResult> {
  const projectId = ensureBPrefix(input.projectId);
  const warnings: ToolWarning[] = [];
  const extensions =
    input.extensions && input.extensions.length > 0
      ? input.extensions
      : DEFAULT_SEARCH_EXTENSIONS;

  if (!input.extensions || input.extensions.length === 0) {
    warnings.push({
      code: "viewer_search_default_extensions",
      message:
        `No extensions were provided, so the search used the default model file set: ${DEFAULT_SEARCH_EXTENSIONS.join(", ")}.`
    });
  }

  const searchResult = await findModelFiles({
    projectId,
    extensions,
    sessionKey: input.sessionKey,
    traversalOptions: input.traversalOptions
  });
  warnings.push(...searchResult.warnings);

  const candidates = input.query?.trim()
    ? searchResult.results.filter((candidate: ViewerCandidate) =>
        [candidate.name, candidate.folderPath]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(input.query!.trim().toLowerCase())
          )
      )
    : searchResult.results;

  if (candidates.length === 0) {
    warnings.push({
      code: "viewer_search_not_found",
      message: "No matching model file was found for the viewer payload."
    });
    return buildNotFoundPayload("search", warnings);
  }

  const sortedCandidates = sortCandidates(candidates, input.query);
  const selected = sortedCandidates[0];
  if (!selected) {
    warnings.push({
      code: "viewer_search_not_found",
      message: "No matching model file was found for the viewer payload."
    });
    return buildNotFoundPayload("search", warnings);
  }

  const payload = buildViewerPayload({
    projectId,
    sourceType: "search",
    itemId: selected.itemId,
    versionId: selected.latestVersionId ?? selected.latestVersionUrn ?? selected.itemId,
    versionUrn: selected.latestVersionUrn ?? selected.latestVersionId ?? selected.itemId,
    displayName: selected.name,
    versionNumber: selected.latestVersionNumber,
    fileType: selected.extension,
    accUrl: selected.accUrl,
    alternatives: sortedCandidates.slice(1, 5)
  });
  payload.warnings.push(...warnings);
  return payload;
}
