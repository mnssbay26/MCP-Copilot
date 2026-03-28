import { requestApsJson } from "../shared/aps/client.js";
import {
  APS_DATA_MANAGEMENT_BASE_URL,
  APS_PROJECTS_BASE_URL
} from "../shared/aps/endpoints.js";
import { getConfig } from "../shared/config/env.js";
import {
  ensureBPrefix,
  toNumberValue,
  toRecord,
  toStringValue
} from "../shared/mcp/listUtils.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";
import type {
  DataManagementPaginationInput,
  DataManagementPageInfo,
  DataManagementTraversalOptions,
  FolderContentResultItem,
  FolderContentsResult,
  ItemResult,
  ItemSummaryResult,
  ItemVersionResult,
  ItemVersionsResult,
  ModelFilesSearchResult,
  ModelFileSearchResultItem,
  TopFolderResultItem,
  TopFoldersResult
} from "./models.js";

const SOURCE = "data-management";
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_FOLDERS_VISITED = 40;
const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_MAX_PAGES_PER_FOLDER = 3;

interface JsonApiCollection {
  data: Record<string, unknown>[];
  included: Record<string, unknown>[];
  links: Record<string, unknown> | null;
  warnings: ToolWarning[];
}

interface JsonApiResource {
  data: Record<string, unknown> | null;
  included: Record<string, unknown>[];
  links: Record<string, unknown> | null;
  warnings: ToolWarning[];
}

function clampPageLimit(pageLimit = DEFAULT_PAGE_LIMIT): number {
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(pageLimit)));
}

function clampPageNumber(pageNumber = 0): number {
  return Math.max(0, Math.trunc(pageNumber));
}

function clampTraversalOptions(
  options?: DataManagementTraversalOptions
): Required<
  Pick<
    DataManagementTraversalOptions,
    "maxDepth" | "maxFoldersVisited" | "maxResults" | "pageLimit" | "maxPagesPerFolder"
  >
> &
  Pick<DataManagementTraversalOptions, "includeHidden"> {
  return {
    maxDepth: Math.max(0, Math.min(10, Math.trunc(options?.maxDepth ?? DEFAULT_MAX_DEPTH))),
    maxFoldersVisited: Math.max(
      1,
      Math.min(200, Math.trunc(options?.maxFoldersVisited ?? DEFAULT_MAX_FOLDERS_VISITED))
    ),
    maxResults: Math.max(1, Math.min(200, Math.trunc(options?.maxResults ?? DEFAULT_MAX_RESULTS))),
    pageLimit: clampPageLimit(options?.pageLimit ?? MAX_PAGE_LIMIT),
    maxPagesPerFolder: Math.max(
      1,
      Math.min(10, Math.trunc(options?.maxPagesPerFolder ?? DEFAULT_MAX_PAGES_PER_FOLDER))
    ),
    includeHidden: options?.includeHidden
  };
}

function createMeta(tool: string, projectId: string, extra?: Record<string, unknown>) {
  return {
    tool,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    projectId,
    ...extra
  };
}

function extractJsonApiCollection(raw: unknown): JsonApiCollection {
  const payload = toRecord(raw);
  if (!payload) {
    return {
      data: [],
      included: [],
      links: null,
      warnings: [
        {
          code: "unexpected_response_shape",
          message: "APS returned a non-object response body."
        }
      ]
    };
  }

  return {
    data: Array.isArray(payload.data)
      ? payload.data.filter((item): item is Record<string, unknown> => toRecord(item) !== null)
      : [],
    included: Array.isArray(payload.included)
      ? payload.included.filter((item): item is Record<string, unknown> => toRecord(item) !== null)
      : [],
    links: toRecord(payload.links),
    warnings: Array.isArray(payload.data)
      ? []
      : [
          {
            code: "unexpected_response_shape",
            message: "APS response did not include a JSON:API data array."
          }
        ]
  };
}

function extractJsonApiResource(raw: unknown): JsonApiResource {
  const payload = toRecord(raw);
  if (!payload) {
    return {
      data: null,
      included: [],
      links: null,
      warnings: [
        {
          code: "unexpected_response_shape",
          message: "APS returned a non-object response body."
        }
      ]
    };
  }

  return {
    data: toRecord(payload.data),
    included: Array.isArray(payload.included)
      ? payload.included.filter((item): item is Record<string, unknown> => toRecord(item) !== null)
      : [],
    links: toRecord(payload.links),
    warnings: toRecord(payload.data)
      ? []
      : [
          {
            code: "unexpected_response_shape",
            message: "APS response did not include a JSON:API data object."
          }
        ]
  };
}

function buildIncludedMap(included: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (const resource of included) {
    const type = toStringValue(resource.type);
    const id = toStringValue(resource.id);
    if (type && id) {
      map.set(`${type}:${id}`, resource);
    }
  }

  return map;
}

function resolveLinkHref(value: unknown): string | undefined {
  const record = toRecord(value);
  if (record) {
    return toStringValue(record.href, record.url);
  }

  return toStringValue(value);
}

function resolveResourceLink(resource: Record<string, unknown>, linkName: string): string | undefined {
  const links = toRecord(resource.links);
  if (!links) {
    return undefined;
  }

  return (
    resolveLinkHref(links[linkName]) ??
    resolveLinkHref(toRecord(links.links)?.[linkName]) ??
    resolveLinkHref(toRecord(toRecord(links[linkName])?.links)?.self)
  );
}

function resolveRelationshipDataId(
  resource: Record<string, unknown>,
  relationshipName: string
): string | undefined {
  const relationships = toRecord(resource.relationships);
  const relationship = toRecord(relationships?.[relationshipName]);
  const data = toRecord(relationship?.data);
  return toStringValue(data?.id);
}

function resolveAttributes(resource: Record<string, unknown>): Record<string, unknown> {
  return toRecord(resource.attributes) ?? {};
}

function resolveExtensionType(attributes: Record<string, unknown>): string | undefined {
  return toStringValue(toRecord(attributes.extension)?.type);
}

function resolveUserDisplayName(attributes: Record<string, unknown>, key: "create" | "lastModified") {
  return toStringValue(attributes[`${key}UserName`], attributes[`${key}UserId`]);
}

function resolveResourceName(resource: Record<string, unknown>): string | undefined {
  const attributes = resolveAttributes(resource);
  return toStringValue(attributes.displayName, attributes.name, resource.id);
}

function resolveAccUrl(resource: Record<string, unknown>, fallback?: string): string | undefined {
  return (
    resolveResourceLink(resource, "webView") ??
    resolveResourceLink(resource, "self") ??
    fallback
  );
}

function resolveVersionNumber(attributes: Record<string, unknown>): number | undefined {
  return toNumberValue(attributes.versionNumber);
}

function resolveFileExtension(name: string | undefined, fileType: string | undefined): string | undefined {
  if (fileType) {
    return fileType.trim().toLowerCase();
  }

  if (!name) {
    return undefined;
  }

  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1];
}

function normalizeTopFolder(resource: Record<string, unknown>): TopFolderResultItem | null {
  const folderId = toStringValue(resource.id);
  const attributes = resolveAttributes(resource);
  const name = resolveResourceName(resource);

  if (!folderId || !name) {
    return null;
  }

  return {
    folderId,
    name,
    folderType: resolveExtensionType(attributes) ?? "folders",
    objectCount: toNumberValue(attributes.objectCount),
    path: toStringValue(attributes.path),
    createdAt: toStringValue(attributes.createTime),
    createdBy: resolveUserDisplayName(attributes, "create"),
    updatedAt: toStringValue(attributes.lastModifiedTime, attributes.lastModifiedTimeRollup),
    updatedBy: resolveUserDisplayName(attributes, "lastModified"),
    hidden: typeof attributes.hidden === "boolean" ? attributes.hidden : undefined,
    accUrl: resolveAccUrl(resource)
  };
}

function normalizeVersionResource(resource: Record<string, unknown>): ItemVersionResult | null {
  const versionId = toStringValue(resource.id);
  const attributes = resolveAttributes(resource);
  const name =
    toStringValue(attributes.name, attributes.displayName, attributes.sourceFileName) ?? undefined;

  if (!versionId || !name) {
    return null;
  }

  return {
    versionId,
    versionUrn: versionId,
    versionNumber: resolveVersionNumber(attributes),
    name,
    displayName: toStringValue(attributes.displayName),
    fileType: resolveFileExtension(
      toStringValue(attributes.name, attributes.sourceFileName),
      toStringValue(attributes.fileType)
    ),
    extensionType: resolveExtensionType(attributes),
    mimeType: toStringValue(attributes.mimeType),
    createdAt: toStringValue(attributes.createTime),
    createdBy: resolveUserDisplayName(attributes, "create"),
    updatedAt: toStringValue(attributes.lastModifiedTime),
    updatedBy: resolveUserDisplayName(attributes, "lastModified"),
    accUrl: resolveAccUrl(resource)
  };
}

function normalizeItemResource(
  resource: Record<string, unknown>,
  includedMap: Map<string, Record<string, unknown>>
): ItemSummaryResult | null {
  const itemId = toStringValue(resource.id);
  const attributes = resolveAttributes(resource);
  const latestVersionId = resolveRelationshipDataId(resource, "tip");
  const latestVersion = latestVersionId
    ? normalizeVersionResource(includedMap.get(`versions:${latestVersionId}`) ?? {})
    : null;
  const name =
    toStringValue(
      attributes.displayName,
      latestVersion?.displayName,
      latestVersion?.name,
      attributes.name,
      itemId
    ) ?? undefined;

  if (!itemId || !name) {
    return null;
  }

  return {
    itemId,
    name,
    itemType: resolveExtensionType(attributes) ?? "items",
    pathInProject: toStringValue(attributes.pathInProject, attributes.path),
    latestVersionId,
    latestVersionUrn: latestVersion?.versionUrn ?? latestVersionId,
    latestVersionNumber: latestVersion?.versionNumber,
    fileType: latestVersion?.fileType,
    extensionType: latestVersion?.extensionType ?? resolveExtensionType(attributes),
    createdAt: toStringValue(attributes.createTime),
    createdBy: resolveUserDisplayName(attributes, "create"),
    updatedAt: latestVersion?.updatedAt ?? toStringValue(attributes.lastModifiedTime),
    updatedBy:
      latestVersion?.updatedBy ?? resolveUserDisplayName(attributes, "lastModified"),
    accUrl: latestVersion?.accUrl ?? resolveAccUrl(resource)
  };
}

function normalizeFolderContentEntry(
  resource: Record<string, unknown>,
  includedMap: Map<string, Record<string, unknown>>
): FolderContentResultItem | null {
  const type = toStringValue(resource.type);
  const attributes = resolveAttributes(resource);
  const id = toStringValue(resource.id);
  const name = resolveResourceName(resource);

  if (!type || !id || !name) {
    return null;
  }

  if (type === "folders") {
    return {
      entryType: "folder",
      id,
      name,
      folderType: resolveExtensionType(attributes) ?? "folders",
      path: toStringValue(attributes.path),
      objectCount: toNumberValue(attributes.objectCount),
      createdAt: toStringValue(attributes.createTime),
      createdBy: resolveUserDisplayName(attributes, "create"),
      updatedAt: toStringValue(attributes.lastModifiedTime, attributes.lastModifiedTimeRollup),
      updatedBy: resolveUserDisplayName(attributes, "lastModified"),
      hidden: typeof attributes.hidden === "boolean" ? attributes.hidden : undefined,
      accUrl: resolveAccUrl(resource)
    };
  }

  const normalizedItem = normalizeItemResource(resource, includedMap);
  if (!normalizedItem) {
    return null;
  }

  return {
    entryType: "item",
    id: normalizedItem.itemId,
    name: normalizedItem.name,
    fileType: normalizedItem.fileType,
    extensionType: normalizedItem.extensionType,
    latestVersionId: normalizedItem.latestVersionId,
    latestVersionUrn: normalizedItem.latestVersionUrn,
    latestVersionNumber: normalizedItem.latestVersionNumber,
    createdAt: normalizedItem.createdAt,
    createdBy: normalizedItem.createdBy,
    updatedAt: normalizedItem.updatedAt,
    updatedBy: normalizedItem.updatedBy,
    hidden: typeof attributes.hidden === "boolean" ? attributes.hidden : undefined,
    accUrl: normalizedItem.accUrl
  };
}

function normalizePageInfo(
  links: Record<string, unknown> | null,
  pageNumber: number,
  pageLimit: number,
  returned: number
): DataManagementPageInfo {
  const nextHref = resolveLinkHref(links?.next);
  const nextPageNumber =
    nextHref !== undefined
      ? toNumberValue(
          new URL(nextHref, "https://developer.api.autodesk.com").searchParams.get("page[number]")
        )
      : undefined;

  return {
    pageNumber,
    pageLimit,
    returned,
    hasNextPage: nextHref !== undefined,
    nextPageNumber: nextPageNumber ?? null
  };
}

async function fetchTopFolderResources(
  projectId: string,
  sessionKey?: string
): Promise<JsonApiCollection> {
  const hubId = ensureBPrefix(getConfig().apsAccountId);
  const normalizedProjectId = ensureBPrefix(projectId);
  const response = await requestApsJson(
    `${APS_PROJECTS_BASE_URL}/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(
      normalizedProjectId
    )}/topFolders`,
    {
      serviceName: "mcpDataManagement.getTopFolders",
      sessionKey
    }
  );

  return extractJsonApiCollection(response);
}

async function fetchFolderContentsPage(input: {
  projectId: string;
  folderId: string;
  pageNumber?: number;
  pageLimit?: number;
  includeHidden?: boolean;
  sessionKey?: string;
}): Promise<JsonApiCollection & { pagination: DataManagementPageInfo }> {
  const projectId = ensureBPrefix(input.projectId);
  const pageNumber = clampPageNumber(input.pageNumber);
  const pageLimit = clampPageLimit(input.pageLimit);
  const url = new URL(
    `${APS_DATA_MANAGEMENT_BASE_URL}/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(
      input.folderId
    )}/contents`
  );
  url.searchParams.set("page[number]", String(pageNumber));
  url.searchParams.set("page[limit]", String(pageLimit));
  if (input.includeHidden) {
    url.searchParams.set("includeHidden", "true");
  }

  const response = await requestApsJson(url.toString(), {
    serviceName: "mcpDataManagement.getFolderContents",
    sessionKey: input.sessionKey
  });
  const extracted = extractJsonApiCollection(response);

  return {
    ...extracted,
    pagination: normalizePageInfo(extracted.links, pageNumber, pageLimit, extracted.data.length)
  };
}

async function fetchItemResource(
  projectId: string,
  itemId: string,
  sessionKey?: string
): Promise<JsonApiResource> {
  const normalizedProjectId = ensureBPrefix(projectId);
  const url = new URL(
    `${APS_DATA_MANAGEMENT_BASE_URL}/projects/${encodeURIComponent(normalizedProjectId)}/items/${encodeURIComponent(
      itemId
    )}`
  );
  url.searchParams.set("includePathInProject", "true");

  const response = await requestApsJson(url.toString(), {
    serviceName: "mcpDataManagement.getItem",
    sessionKey
  });

  return extractJsonApiResource(response);
}

async function fetchItemVersionsPage(input: {
  projectId: string;
  itemId: string;
  pageNumber?: number;
  pageLimit?: number;
  sessionKey?: string;
}): Promise<JsonApiCollection & { pagination: DataManagementPageInfo }> {
  const projectId = ensureBPrefix(input.projectId);
  const pageNumber = clampPageNumber(input.pageNumber);
  const pageLimit = clampPageLimit(input.pageLimit);
  const url = new URL(
    `${APS_DATA_MANAGEMENT_BASE_URL}/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(
      input.itemId
    )}/versions`
  );
  url.searchParams.set("page[number]", String(pageNumber));
  url.searchParams.set("page[limit]", String(pageLimit));

  const response = await requestApsJson(url.toString(), {
    serviceName: "mcpDataManagement.getItemVersions",
    sessionKey: input.sessionKey
  });
  const extracted = extractJsonApiCollection(response);

  return {
    ...extracted,
    pagination: normalizePageInfo(extracted.links, pageNumber, pageLimit, extracted.data.length)
  };
}

async function fetchVersionResource(
  projectId: string,
  versionId: string,
  sessionKey?: string
): Promise<JsonApiResource> {
  const normalizedProjectId = ensureBPrefix(projectId);
  const response = await requestApsJson(
    `${APS_DATA_MANAGEMENT_BASE_URL}/projects/${encodeURIComponent(normalizedProjectId)}/versions/${encodeURIComponent(
      versionId
    )}`,
    {
      serviceName: "mcpDataManagement.getVersion",
      sessionKey
    }
  );

  return extractJsonApiResource(response);
}

export async function getTopFolders(input: {
  projectId: string;
  sessionKey?: string;
}): Promise<TopFoldersResult> {
  const projectId = ensureBPrefix(input.projectId);
  const hubId = ensureBPrefix(getConfig().apsAccountId);
  const extracted = await fetchTopFolderResources(projectId, input.sessionKey);
  const results = extracted.data
    .map(normalizeTopFolder)
    .filter((item): item is TopFolderResultItem => item !== null);

  return {
    summary: {
      totalFolders: results.length,
      hiddenFolders: results.filter((item) => item.hidden).length
    },
    results,
    meta: {
      tool: "get_top_folders",
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId,
      hubId
    },
    warnings: extracted.warnings
  };
}

export async function getFolderContents(input: {
  projectId: string;
  folderId: string;
  sessionKey?: string;
  pagination?: DataManagementPaginationInput;
  includeHidden?: boolean;
}): Promise<FolderContentsResult> {
  const projectId = ensureBPrefix(input.projectId);
  const page = await fetchFolderContentsPage({
    projectId,
    folderId: input.folderId,
    pageNumber: input.pagination?.pageNumber,
    pageLimit: input.pagination?.pageLimit,
    includeHidden: input.includeHidden,
    sessionKey: input.sessionKey
  });
  const includedMap = buildIncludedMap(page.included);
  const results = page.data
    .map((resource) => normalizeFolderContentEntry(resource, includedMap))
    .filter((item): item is FolderContentResultItem => item !== null);

  return {
    summary: {
      totalEntries: results.length,
      folderCount: results.filter((item) => item.entryType === "folder").length,
      itemCount: results.filter((item) => item.entryType === "item").length
    },
    results,
    pagination: page.pagination,
    meta: {
      tool: "get_folder_contents",
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId,
      folderId: input.folderId
    },
    warnings: page.warnings
  };
}

export async function getItem(input: {
  projectId: string;
  itemId: string;
  sessionKey?: string;
}): Promise<ItemResult> {
  const projectId = ensureBPrefix(input.projectId);
  const extracted = await fetchItemResource(projectId, input.itemId, input.sessionKey);
  const normalized = extracted.data
    ? normalizeItemResource(extracted.data, buildIncludedMap(extracted.included))
    : null;

  return {
    summary: {
      found: normalized !== null,
      hasLatestVersion: Boolean(normalized?.latestVersionId)
    },
    result: normalized,
    meta: {
      tool: "get_item",
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId,
      itemId: input.itemId
    },
    warnings: extracted.warnings
  };
}

export async function getVersionDetails(input: {
  projectId: string;
  versionId: string;
  sessionKey?: string;
}): Promise<ItemVersionResult | null> {
  const projectId = ensureBPrefix(input.projectId);
  const extracted = await fetchVersionResource(projectId, input.versionId, input.sessionKey);
  return extracted.data ? normalizeVersionResource(extracted.data) : null;
}

export async function getItemVersions(input: {
  projectId: string;
  itemId: string;
  sessionKey?: string;
  pagination?: DataManagementPaginationInput;
}): Promise<ItemVersionsResult> {
  const projectId = ensureBPrefix(input.projectId);
  const page = await fetchItemVersionsPage({
    projectId,
    itemId: input.itemId,
    pageNumber: input.pagination?.pageNumber,
    pageLimit: input.pagination?.pageLimit,
    sessionKey: input.sessionKey
  });
  const results = page.data
    .map(normalizeVersionResource)
    .filter((item): item is ItemVersionResult => item !== null);

  return {
    summary: {
      totalVersions: results.length,
      returnedVersions: results.length
    },
    results,
    pagination: page.pagination,
    meta: {
      tool: "get_item_versions",
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      projectId,
      itemId: input.itemId
    },
    warnings: page.warnings
  };
}

function matchesExtensionFilter(
  entry: FolderContentResultItem,
  extensions: Set<string>
): entry is FolderContentResultItem & {
  entryType: "item";
  latestVersionUrn: string;
} {
  if (entry.entryType !== "item") {
    return false;
  }

  const extension = resolveFileExtension(entry.name, entry.fileType);
  return Boolean(extension && extensions.has(extension) && entry.latestVersionUrn);
}

export async function findModelFiles(input: {
  projectId: string;
  extensions: string[];
  sessionKey?: string;
  traversalOptions?: DataManagementTraversalOptions;
}): Promise<ModelFilesSearchResult> {
  const projectId = ensureBPrefix(input.projectId);
  const traversal = clampTraversalOptions(input.traversalOptions);
  const extensions = [
    ...new Set(
      input.extensions
        .map((value) => value.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean)
    )
  ];
  const extensionSet = new Set(extensions);
  const warnings: ToolWarning[] = [];
  const topFolders = await getTopFolders({
    projectId,
    sessionKey: input.sessionKey
  });
  warnings.push(...topFolders.warnings);

  const visitedFolderIds = new Set<string>();
  const discoveredFiles: ModelFileSearchResultItem[] = [];
  const queue = topFolders.results.map((folder) => ({
    folderId: folder.folderId,
    depth: 0,
    folderPath: folder.path ?? folder.name
  }));

  traversalLoop: while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (visitedFolderIds.has(current.folderId)) {
      continue;
    }

    if (visitedFolderIds.size >= traversal.maxFoldersVisited) {
      warnings.push({
        code: "folder_traversal_truncated",
        message:
          `Stopped after visiting ${traversal.maxFoldersVisited} folders to keep the search bounded.`
      });
      break;
    }

    visitedFolderIds.add(current.folderId);

    for (let pageNumber = 0; pageNumber < traversal.maxPagesPerFolder; pageNumber += 1) {
      const page = await fetchFolderContentsPage({
        projectId,
        folderId: current.folderId,
        pageNumber,
        pageLimit: traversal.pageLimit,
        includeHidden: traversal.includeHidden,
        sessionKey: input.sessionKey
      });
      warnings.push(...page.warnings);
      const includedMap = buildIncludedMap(page.included);
      const entries = page.data
        .map((resource) => normalizeFolderContentEntry(resource, includedMap))
        .filter((item): item is FolderContentResultItem => item !== null);

      for (const entry of entries) {
        if (entry.hidden && !traversal.includeHidden) {
          continue;
        }

        if (entry.entryType === "folder") {
          if (current.depth < traversal.maxDepth) {
            queue.push({
              folderId: entry.id,
              depth: current.depth + 1,
              folderPath: entry.path ?? [current.folderPath, entry.name].filter(Boolean).join("/")
            });
          }
          continue;
        }

        if (!matchesExtensionFilter(entry, extensionSet)) {
          continue;
        }

        discoveredFiles.push({
          itemId: entry.id,
          name: entry.name,
          extension: resolveFileExtension(entry.name, entry.fileType) ?? "unknown",
          folderPath: current.folderPath,
          latestVersionId: entry.latestVersionId,
          latestVersionUrn: entry.latestVersionUrn,
          latestVersionNumber: entry.latestVersionNumber,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
          accUrl: entry.accUrl
        });

        if (discoveredFiles.length >= traversal.maxResults) {
          warnings.push({
            code: "model_file_results_truncated",
            message: `Returned the first ${traversal.maxResults} matching model files to keep the search concise.`
          });
          break traversalLoop;
        }
      }

      if (!page.pagination.hasNextPage) {
        break;
      }

      if (pageNumber + 1 >= traversal.maxPagesPerFolder) {
        warnings.push({
          code: "folder_page_traversal_truncated",
          message:
            `Stopped after ${traversal.maxPagesPerFolder} pages for folder ${current.folderId} to keep the search bounded.`
        });
      }
    }
  }

  return {
    summary: {
      matchedFiles: discoveredFiles.length,
      returnedFiles: discoveredFiles.length,
      visitedFolders: visitedFolderIds.size,
      extensionsMatched: extensions.length
    },
    results: discoveredFiles,
    filtersApplied: {
      extensions,
      traversal
    },
    meta: createMeta("find_model_files", projectId),
    warnings
  };
}
