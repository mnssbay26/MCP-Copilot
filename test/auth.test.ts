import { afterEach, describe, expect, it, vi } from "vitest";
import { ApsAuthRequiredError } from "../src/shared/utils/errors.js";
import {
  createApsAuthService,
  isTokenExpired,
  normalizeTokenResponse
} from "../src/shared/auth/apsAuth.js";
import { MemoryOAuthStateStore } from "../src/shared/auth/memoryOAuthStateStore.js";
import { MemoryTokenCache } from "../src/shared/auth/memoryTokenCache.js";
import type { AppConfig } from "../src/shared/config/env.js";

function createConfig(): AppConfig {
  return {
    apsClientId: "client-id",
    apsClientSecret: "client-secret",
    apsCallbackUrl: "http://localhost:3000/auth/callback",
    apsScopes: ["data:read", "account:read"],
    apsAccountId: "account-123",
    apsRegion: "US",
    port: 3000,
    transport: "http"
  };
}

function createTokenResponse(accessToken: string) {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      refresh_token: "refresh-token",
      expires_in: 3_600,
      token_type: "Bearer",
      scope: "data:read account:read"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("apsAuth", () => {
  it("normalizes tokens and evaluates expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const token = normalizeTokenResponse(
      {
        access_token: "access-token",
        expires_in: 60,
        token_type: "Bearer"
      },
      ["data:read"]
    );

    expect(token.scope).toEqual(["data:read"]);
    expect(isTokenExpired(token)).toBe(true);

    vi.useRealTimers();
  });

  it("generates an authorization URL and stores oauth state", async () => {
    const tokenCache = new MemoryTokenCache();
    const stateStore = new MemoryOAuthStateStore();
    const service = createApsAuthService({
      getConfig: createConfig,
      tokenCache,
      stateStore
    });

    const authUrl = await service.getAuthorizationUrl();
    const storedState = await stateStore.get(authUrl.state);

    expect(authUrl.authorizationUrl).toContain("response_type=code");
    expect(authUrl.authorizationUrl).toContain("code_challenge_method=S256");
    expect(storedState?.redirectUri).toBe("http://localhost:3000/auth/callback");
  });

  it("exchanges an auth code and stores the normalized token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createTokenResponse("access-token"));
    const tokenCache = new MemoryTokenCache();
    const stateStore = new MemoryOAuthStateStore();
    const service = createApsAuthService({
      getConfig: createConfig,
      tokenCache,
      stateStore,
      fetchImpl
    });

    const authUrl = await service.getAuthorizationUrl();
    const token = await service.exchangeCodeForToken("auth-code", authUrl.state);

    expect(token.accessToken).toBe("access-token");
    expect((await tokenCache.get("default"))?.accessToken).toBe("access-token");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("refreshes an expired token only once for concurrent requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const fetchImpl = vi.fn().mockResolvedValue(createTokenResponse("refreshed-access-token"));
    const tokenCache = new MemoryTokenCache();
    const stateStore = new MemoryOAuthStateStore();
    const service = createApsAuthService({
      getConfig: createConfig,
      tokenCache,
      stateStore,
      fetchImpl
    });

    await tokenCache.set("default", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: ["data:read", "account:read"],
      obtainedAt: Date.now() - 7_200_000,
      expiresAt: Date.now() - 1_000
    });

    const [first, second] = await Promise.all([
      service.getValidAccessToken(),
      service.getValidAccessToken()
    ]);

    expect(first).toBe("refreshed-access-token");
    expect(second).toBe("refreshed-access-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when no cached token is available", async () => {
    const service = createApsAuthService({
      getConfig: createConfig,
      tokenCache: new MemoryTokenCache(),
      stateStore: new MemoryOAuthStateStore()
    });

    await expect(service.getValidAccessToken()).rejects.toThrow(ApsAuthRequiredError);
  });
});
