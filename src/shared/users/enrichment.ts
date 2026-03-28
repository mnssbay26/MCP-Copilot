import { requestApsJson } from "../aps/client.js";
import { APS_CONSTRUCTION_ADMIN_BASE_URL } from "../aps/endpoints.js";
import { getConfig, type RegionValue } from "../config/env.js";
import {
  ensureBPrefix,
  extractListRecords,
  stripBPrefix,
  toRecord,
  toStringValue
} from "../mcp/listUtils.js";
import type { ToolWarning } from "../mcp/toolResult.js";

const PROJECT_USER_PAGE_LIMIT = 200;
const MAX_PROJECT_USER_PAGE_FETCHES = 10;

function buildRegionHeaders(region?: RegionValue): Record<string, string> | undefined {
  return region ? { Region: region } : undefined;
}

function isEmailLike(value: string): boolean {
  return value.includes("@");
}

function looksOpaqueIdentifier(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (isEmailLike(normalized)) {
    return true;
  }

  if (/^urn:/i.test(normalized)) {
    return true;
  }

  if (/^b\./i.test(normalized)) {
    return true;
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalized)) {
    return true;
  }

  if (/\s/.test(normalized)) {
    return false;
  }

  return /[_?=:/-]/.test(normalized) || /\d/.test(normalized) || normalized.length >= 16;
}

function resolveEmbeddedDisplayName(value: unknown): string | undefined {
  const record = toRecord(value);
  if (record) {
    return toStringValue(
      record.displayName,
      record.name,
      record.fullName,
      record.title,
      record.label,
      record.createUserName,
      record.lastModifiedUserName
    );
  }

  const stringValue = toStringValue(value);
  if (!stringValue) {
    return undefined;
  }

  return looksOpaqueIdentifier(stringValue) ? undefined : stringValue;
}

function collectCandidateKeys(values: unknown[]): string[] {
  const keys = new Set<string>();

  const visit = (value: unknown): void => {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = toRecord(value);
    if (record) {
      const embeddedDisplayName = resolveEmbeddedDisplayName(value);
      if (!embeddedDisplayName) {
        const keyCandidates = [
          record.id,
          record.userId,
          record.autodeskId,
          record.accountId,
          record.email
        ];

        for (const keyCandidate of keyCandidates) {
          const normalized = toStringValue(keyCandidate);
          if (normalized) {
            keys.add(normalized);
          }
        }
        const fallbackValue = toStringValue(record.value);
        if (fallbackValue && looksOpaqueIdentifier(fallbackValue)) {
          keys.add(fallbackValue);
        }
      }

      return;
    }

    const normalized = toStringValue(value);
    if (normalized && looksOpaqueIdentifier(normalized)) {
      keys.add(normalized);
    }
  };

  for (const value of values) {
    visit(value);
  }

  return [...keys];
}

function buildUserAliasMap(records: Record<string, unknown>[]): Map<string, string> {
  const aliasMap = new Map<string, string>();

  for (const record of records) {
    const displayName = toStringValue(
      record.displayName,
      record.name,
      record.fullName,
      record.createUserName,
      record.lastModifiedUserName
    );

    if (!displayName) {
      continue;
    }

    const aliases = [
      record.id,
      record.userId,
      record.autodeskId,
      record.accountId,
      record.email
    ]
      .map((value) => toStringValue(value))
      .filter((value): value is string => Boolean(value));

    for (const alias of aliases) {
      aliasMap.set(alias, displayName);
      const stripped = stripBPrefix(alias);
      if (stripped && stripped !== alias) {
        aliasMap.set(stripped, displayName);
      }
    }
  }

  return aliasMap;
}

async function fetchProjectUsers(
  projectId: string,
  sessionKey?: string
): Promise<{ aliasMap: Map<string, string>; warnings: ToolWarning[] }> {
  const config = getConfig();
  const warnings: ToolWarning[] = [];
  const records: Record<string, unknown>[] = [];
  const normalizedProjectId = stripBPrefix(projectId);

  for (let pageIndex = 0; pageIndex < MAX_PROJECT_USER_PAGE_FETCHES; pageIndex += 1) {
    const offset = pageIndex * PROJECT_USER_PAGE_LIMIT;
    const url = new URL(
      `${APS_CONSTRUCTION_ADMIN_BASE_URL}/projects/${encodeURIComponent(normalizedProjectId)}/users`
    );
    url.searchParams.set("limit", String(PROJECT_USER_PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const response = await requestApsJson(url.toString(), {
      headers: buildRegionHeaders(config.apsRegion),
      serviceName: "sharedUsers.fetchProjectUsers",
      sessionKey
    });
    const extracted = extractListRecords<Record<string, unknown>>(response);

    warnings.push(...extracted.warnings);
    records.push(...extracted.records);

    if (extracted.records.length < PROJECT_USER_PAGE_LIMIT) {
      return {
        aliasMap: buildUserAliasMap(records),
        warnings
      };
    }
  }

  warnings.push({
    code: "project_user_lookup_truncated",
    message:
      `Stopped after ${MAX_PROJECT_USER_PAGE_FETCHES} user pages while building display-name lookups.`
  });

  return {
    aliasMap: buildUserAliasMap(records),
    warnings
  };
}

export interface ProjectUserEnricher {
  prime(values: unknown[]): Promise<void>;
  resolveDisplayName(value: unknown): string | undefined;
  resolveDisplayNames(value: unknown): string[] | undefined;
  warnings: ToolWarning[];
}

export function createProjectUserEnricher(input: {
  projectId: string;
  sessionKey?: string;
}): ProjectUserEnricher {
  const warnings: ToolWarning[] = [];
  let aliasMap = new Map<string, string>();
  let hasLoadedProjectUsers = false;
  let loadPromise: Promise<void> | null = null;

  async function ensureProjectUsersLoaded(candidateKeys: string[]): Promise<void> {
    if (hasLoadedProjectUsers || candidateKeys.length === 0) {
      return;
    }

    if (loadPromise) {
      await loadPromise;
      return;
    }

    loadPromise = (async () => {
      try {
        const result = await fetchProjectUsers(input.projectId, input.sessionKey);
        aliasMap = result.aliasMap;
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push({
          code: "project_user_lookup_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Project user display names could not be loaded."
        });
      } finally {
        hasLoadedProjectUsers = true;
        loadPromise = null;
      }
    })();

    await loadPromise;
  }

  function resolveFromAliasMap(value: unknown): string | undefined {
    const keyCandidates = collectCandidateKeys([value]);
    for (const key of keyCandidates) {
      const directMatch = aliasMap.get(key);
      if (directMatch) {
        return directMatch;
      }

      const ensuredBPrefix = ensureBPrefix(key);
      const ensuredMatch = aliasMap.get(ensuredBPrefix);
      if (ensuredMatch) {
        return ensuredMatch;
      }

      const strippedMatch = aliasMap.get(stripBPrefix(key));
      if (strippedMatch) {
        return strippedMatch;
      }
    }

    return undefined;
  }

  return {
    async prime(values: unknown[]) {
      await ensureProjectUsersLoaded(collectCandidateKeys(values));
    },

    resolveDisplayName(value: unknown) {
      const embeddedDisplayName = resolveEmbeddedDisplayName(value);
      if (embeddedDisplayName) {
        return embeddedDisplayName;
      }

      const aliasDisplayName = resolveFromAliasMap(value);
      if (aliasDisplayName) {
        return aliasDisplayName;
      }

      const stringValue = toStringValue(value);
      if (!stringValue || looksOpaqueIdentifier(stringValue)) {
        return undefined;
      }

      return stringValue;
    },

    resolveDisplayNames(value: unknown) {
      const items = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];

      if (items.length === 0) {
        return undefined;
      }

      const resolved = items
        .map((item) => this.resolveDisplayName(item))
        .filter((item): item is string => Boolean(item));

      return resolved.length > 0 ? [...new Set(resolved)] : undefined;
    },

    warnings
  };
}
