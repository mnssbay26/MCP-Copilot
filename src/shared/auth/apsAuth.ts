import crypto from "node:crypto";
import { APS_OAUTH_AUTHORIZE_URL, APS_OAUTH_TOKEN_URL } from "../aps/endpoints.js";
import { getConfig, type AppConfig } from "../config/env.js";
import {
  ApsAuthRequiredError,
  OAuthStateError,
  TokenRefreshError
} from "../utils/errors.js";
import { createPkcePair } from "./pkce.js";
import {
  defaultOAuthStateStore,
  MemoryOAuthStateStore
} from "./memoryOAuthStateStore.js";
import { defaultTokenCache, MemoryTokenCache } from "./memoryTokenCache.js";
import type {
  AuthStatus,
  AuthorizationUrlResult,
  AutodeskTokenResponse,
  CachedAccessToken
} from "./models.js";
import type { OAuthStateStore } from "./oauthStateStore.js";
import type { TokenCache } from "./tokenCache.js";

const DEFAULT_SESSION_KEY = "default";
const DEFAULT_AUTH_SCOPES = ["data:read", "data:write", "data:create", "account:read"];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;

function createBasicAuthHeader(config: AppConfig): string {
  const value = Buffer.from(`${config.apsClientId}:${config.apsClientSecret}`).toString("base64");
  return `Basic ${value}`;
}

function resolveRequestedScopes(config: AppConfig): string[] {
  const scopes = Array.isArray(config.apsScopes)
    ? config.apsScopes.map((value) => value.trim()).filter(Boolean)
    : [];

  return scopes.length > 0 ? [...new Set(scopes)] : [...DEFAULT_AUTH_SCOPES];
}

function normalizeScopes(rawScope: string | string[] | undefined, fallback: string[]): string[] {
  if (Array.isArray(rawScope)) {
    return rawScope.filter(Boolean);
  }

  if (typeof rawScope === "string") {
    const scopes = rawScope
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (scopes.length > 0) {
      return [...new Set(scopes)];
    }
  }

  return [...new Set(fallback)];
}

export function normalizeTokenResponse(
  token: AutodeskTokenResponse,
  fallbackScopes: string[]
): CachedAccessToken {
  const obtainedAt = Date.now();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    scope: normalizeScopes(token.scope, fallbackScopes),
    obtainedAt,
    expiresAt: obtainedAt + token.expires_in * 1000
  };
}

export function isTokenExpired(token: CachedAccessToken, skewMs = EXPIRY_SKEW_MS): boolean {
  return Date.now() >= token.expiresAt - skewMs;
}

interface CreateApsAuthServiceOptions {
  getConfig: () => AppConfig;
  tokenCache: TokenCache;
  stateStore: OAuthStateStore;
  fetchImpl?: typeof fetch;
}

export interface ApsAuthService {
  getAuthorizationUrl(sessionKey?: string): Promise<AuthorizationUrlResult>;
  exchangeCodeForToken(code: string, state: string): Promise<CachedAccessToken>;
  refreshAccessToken(
    cachedToken: CachedAccessToken,
    sessionKey?: string
  ): Promise<CachedAccessToken>;
  getValidAccessToken(sessionKey?: string): Promise<string>;
  clearCachedToken(sessionKey?: string): Promise<void>;
  getCachedToken(sessionKey?: string): Promise<CachedAccessToken | null>;
  getAuthStatus(sessionKey?: string): Promise<AuthStatus>;
}

async function requestToken(
  config: AppConfig,
  body: URLSearchParams,
  fetchImpl: typeof fetch
): Promise<AutodeskTokenResponse> {
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
      `Autodesk token request failed (${response.status}): ${await response.text()}`
    );
  }

  return (await response.json()) as AutodeskTokenResponse;
}

export function createApsAuthService(options: CreateApsAuthServiceOptions): ApsAuthService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const refreshLocks = new Map<string, Promise<CachedAccessToken>>();

  async function refreshWithLock(
    sessionKey: string,
    cachedToken: CachedAccessToken
  ): Promise<CachedAccessToken> {
    const existingLock = refreshLocks.get(sessionKey);
    if (existingLock) {
      return existingLock;
    }

    const refreshPromise = (async () => {
      const refreshedToken = await api.refreshAccessToken(cachedToken, sessionKey);
      return refreshedToken;
    })();

    refreshLocks.set(sessionKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      refreshLocks.delete(sessionKey);
    }
  }

  const api: ApsAuthService = {
    async getAuthorizationUrl(sessionKey = DEFAULT_SESSION_KEY) {
      const config = options.getConfig();
      const requestedScopes = resolveRequestedScopes(config);
      const { verifier, challenge } = createPkcePair();
      const state = crypto.randomUUID();
      const now = Date.now();
    
      await options.stateStore.set({
        state,
        codeVerifier: verifier,
        redirectUri: config.apsCallbackUrl,
        scopes: requestedScopes,
        sessionKey,
        createdAt: now,
        expiresAt: now + OAUTH_STATE_TTL_MS
      });
    
      const url = new URL(APS_OAUTH_AUTHORIZE_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", config.apsClientId);
      url.searchParams.set("redirect_uri", config.apsCallbackUrl);
      url.searchParams.set("scope", requestedScopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
    
      return {
        authorizationUrl: url.toString(),
        state,
        redirectUri: config.apsCallbackUrl,
        scope: requestedScopes.join(" "),
        sessionKey,
        expiresAt: new Date(now + OAUTH_STATE_TTL_MS).toISOString()
      };
    },

    async exchangeCodeForToken(code: string, state: string) {
      const config = options.getConfig();
      const storedState = await options.stateStore.take(state);

      if (!storedState) {
        throw new OAuthStateError(
          "Missing or expired OAuth state. Generate a new authorization URL and try again."
        );
      }

      const body = new URLSearchParams();
      body.set("grant_type", "authorization_code");
      body.set("code", code);
      body.set("redirect_uri", storedState.redirectUri);
      body.set("code_verifier", storedState.codeVerifier);
      body.set("scope", storedState.scopes.join(" "));

      const rawToken = await requestToken(config, body, fetchImpl);
      const normalizedToken = normalizeTokenResponse(rawToken, storedState.scopes);
      await options.tokenCache.set(storedState.sessionKey, normalizedToken);
      return normalizedToken;
    },

    async refreshAccessToken(cachedToken: CachedAccessToken, sessionKey = DEFAULT_SESSION_KEY) {
      const config = options.getConfig();
      if (!cachedToken.refreshToken) {
        throw new TokenRefreshError(
          "Cached Autodesk token is expired and does not include a refresh token."
        );
      }
      //comment
      const requestedScopes = resolveRequestedScopes(config);

      const body = new URLSearchParams();
      body.set("grant_type", "refresh_token");
      body.set("refresh_token", cachedToken.refreshToken);
      body.set(
        "scope",
        cachedToken.scope.join(" ") || requestedScopes.join(" ")
      );

      const rawToken = await requestToken(config, body, fetchImpl);
      const refreshedToken = normalizeTokenResponse(rawToken, cachedToken.scope);
      if (!refreshedToken.refreshToken && cachedToken.refreshToken) {
        refreshedToken.refreshToken = cachedToken.refreshToken;
      }

      await options.tokenCache.set(sessionKey, refreshedToken);
      return refreshedToken;
    },

    async getValidAccessToken(sessionKey = DEFAULT_SESSION_KEY) {
      const cachedToken = await options.tokenCache.get(sessionKey);
      if (!cachedToken) {
        throw new ApsAuthRequiredError();
      }

      if (!isTokenExpired(cachedToken)) {
        return cachedToken.accessToken;
      }

      const refreshedToken = await refreshWithLock(sessionKey, cachedToken);
      return refreshedToken.accessToken;
    },

    async clearCachedToken(sessionKey = DEFAULT_SESSION_KEY) {
      await options.tokenCache.delete(sessionKey);
    },

    async getCachedToken(sessionKey = DEFAULT_SESSION_KEY) {
      return options.tokenCache.get(sessionKey);
    },

    async getAuthStatus(sessionKey = DEFAULT_SESSION_KEY) {
      const cachedToken = await options.tokenCache.get(sessionKey);
      if (!cachedToken) {
        return {
          sessionKey,
          loggedIn: false,
          cacheBackend: options.tokenCache.constructor.name
        };
      }

      return {
        sessionKey,
        loggedIn: true,
        expiresAt: new Date(cachedToken.expiresAt).toISOString(),
        scopes: cachedToken.scope,
        tokenType: cachedToken.tokenType,
        cacheBackend: options.tokenCache.constructor.name
      };
    }
  };

  return api;
}

const defaultAuthService = createApsAuthService({
  getConfig,
  tokenCache: defaultTokenCache,
  stateStore: defaultOAuthStateStore
});

export function getAuthorizationUrl(sessionKey = DEFAULT_SESSION_KEY) {
  return defaultAuthService.getAuthorizationUrl(sessionKey);
}

export function exchangeCodeForToken(code: string, state: string) {
  return defaultAuthService.exchangeCodeForToken(code, state);
}

export function refreshAccessToken(
  cachedToken: CachedAccessToken,
  sessionKey = DEFAULT_SESSION_KEY
) {
  return defaultAuthService.refreshAccessToken(cachedToken, sessionKey);
}

export function getValidAccessToken(sessionKey = DEFAULT_SESSION_KEY) {
  return defaultAuthService.getValidAccessToken(sessionKey);
}

export function clearCachedToken(sessionKey = DEFAULT_SESSION_KEY) {
  return defaultAuthService.clearCachedToken(sessionKey);
}

export function getAuthStatus(sessionKey = DEFAULT_SESSION_KEY) {
  return defaultAuthService.getAuthStatus(sessionKey);
}

export async function resetAuthForTests(): Promise<void> {
  await defaultTokenCache.clear();
  await defaultOAuthStateStore.clear();
}

export {
  defaultAuthService,
  defaultOAuthStateStore,
  defaultTokenCache,
  MemoryOAuthStateStore,
  MemoryTokenCache
};
