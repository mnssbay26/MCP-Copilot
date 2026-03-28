import { APS_OAUTH_TOKEN_URL } from "../aps/endpoints.js";
import { getConfig, type AppConfig } from "../config/env.js";
import { TokenRefreshError } from "../utils/errors.js";
import { isTokenExpired, normalizeTokenResponse } from "./apsAuth.js";
import { MemoryTokenCache } from "./memoryTokenCache.js";
import type { AutodeskTokenResponse, CachedAccessToken } from "./models.js";
import type { TokenCache } from "./tokenCache.js";

export const DEFAULT_APP_CONTEXT_SCOPES = ["account:read"] as const;

interface CreateApsAppAuthServiceOptions {
  getConfig: () => AppConfig;
  tokenCache: TokenCache;
  fetchImpl?: typeof fetch;
}

export interface ApsAppAuthService {
  getAppContextToken(scopes?: string[]): Promise<CachedAccessToken>;
  getValidAppContextAccessToken(scopes?: string[]): Promise<string>;
  getCachedAppContextToken(scopes?: string[]): Promise<CachedAccessToken | null>;
  clearCachedAppContextToken(scopes?: string[]): Promise<void>;
}

function createBasicAuthHeader(config: AppConfig): string {
  const value = Buffer.from(`${config.apsClientId}:${config.apsClientSecret}`).toString("base64");
  return `Basic ${value}`;
}

function normalizeRequestedScopes(scopes?: string[]): string[] {
  const normalized =
    scopes
      ?.map((value) => value.trim())
      .filter(Boolean)
      .sort() ?? [];

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_APP_CONTEXT_SCOPES];
}

function buildScopeCacheKey(scopes?: string[]): string {
  return normalizeRequestedScopes(scopes).join(" ");
}

async function requestClientCredentialsToken(
  config: AppConfig,
  scopes: string[],
  fetchImpl: typeof fetch
): Promise<AutodeskTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", scopes.join(" "));

  const response = await fetchImpl(APS_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: createBasicAuthHeader(config),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new TokenRefreshError(
      `Autodesk app-context token request failed (${response.status}).`
    );
  }

  return (await response.json()) as AutodeskTokenResponse;
}

export function createApsAppAuthService(
  options: CreateApsAppAuthServiceOptions
): ApsAppAuthService {
  const requestLocks = new Map<string, Promise<CachedAccessToken>>();

  async function requestFreshToken(scopes?: string[]): Promise<CachedAccessToken> {
    const normalizedScopes = normalizeRequestedScopes(scopes);
    const rawToken = await requestClientCredentialsToken(
      options.getConfig(),
      normalizedScopes,
      options.fetchImpl ?? fetch
    );
    const cachedToken = normalizeTokenResponse(rawToken, normalizedScopes);
    await options.tokenCache.set(buildScopeCacheKey(normalizedScopes), cachedToken);
    return cachedToken;
  }

  async function requestFreshTokenWithLock(scopes?: string[]): Promise<CachedAccessToken> {
    const cacheKey = buildScopeCacheKey(scopes);
    const existingLock = requestLocks.get(cacheKey);

    if (existingLock) {
      return existingLock;
    }

    const requestPromise = requestFreshToken(scopes);
    requestLocks.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      requestLocks.delete(cacheKey);
    }
  }

  return {
    async getAppContextToken(scopes?: string[]) {
      const normalizedScopes = normalizeRequestedScopes(scopes);
      const cacheKey = buildScopeCacheKey(normalizedScopes);
      const cachedToken = await options.tokenCache.get(cacheKey);

      if (cachedToken && !isTokenExpired(cachedToken)) {
        return cachedToken;
      }

      return requestFreshTokenWithLock(normalizedScopes);
    },

    async getValidAppContextAccessToken(scopes?: string[]) {
      const cachedToken = await this.getAppContextToken(scopes);
      return cachedToken.accessToken;
    },

    async getCachedAppContextToken(scopes?: string[]) {
      return options.tokenCache.get(buildScopeCacheKey(scopes));
    },

    async clearCachedAppContextToken(scopes?: string[]) {
      await options.tokenCache.delete(buildScopeCacheKey(scopes));
    }
  };
}

const defaultAppTokenCache = new MemoryTokenCache();

const defaultAppAuthService = createApsAppAuthService({
  getConfig,
  tokenCache: defaultAppTokenCache
});

export function getValidAppContextAccessToken(scopes?: string[]) {
  return defaultAppAuthService.getValidAppContextAccessToken(scopes);
}

export function clearCachedAppContextToken(scopes?: string[]) {
  return defaultAppAuthService.clearCachedAppContextToken(scopes);
}

export async function resetAppAuthForTests(): Promise<void> {
  await defaultAppTokenCache.clear();
}

export { defaultAppAuthService, defaultAppTokenCache, MemoryTokenCache };
