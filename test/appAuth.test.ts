import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApsAppAuthService,
  defaultAppTokenCache,
  getValidAppContextAccessToken,
  resetAppAuthForTests
} from "../src/shared/auth/apsAppAuth.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { resetConfigForTests } from "../src/shared/config/env.js";
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

function applyBaseEnv(): void {
  process.env.APS_CLIENT_ID = "client-id";
  process.env.APS_CLIENT_SECRET = "client-secret";
  process.env.APS_CALLBACK_URL = "http://localhost:3000/auth/callback";
  process.env.APS_SCOPES = "data:read account:read";
  process.env.APS_ACCOUNT_ID = "account-123";
  process.env.PORT = "3000";
  process.env.MCP_TRANSPORT = "http";
}

function createTokenResponse(accessToken: string) {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      expires_in: 3_600,
      token_type: "Bearer",
      scope: "account:read"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

beforeEach(async () => {
  applyBaseEnv();
  resetConfigForTests();
  await resetAuthForTests();
  await resetAppAuthForTests();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetConfigForTests();
  await resetAuthForTests();
  await resetAppAuthForTests();
});

describe("apsAppAuth", () => {
  it("requests and caches a 2-legged app-context token with minimal scopes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createTokenResponse("app-token"));
    const service = createApsAppAuthService({
      getConfig: createConfig,
      tokenCache: defaultAppTokenCache,
      fetchImpl
    });

    const accessToken = await service.getValidAppContextAccessToken();
    const cachedToken = await service.getCachedAppContextToken(["account:read"]);
    const requestBody = String(fetchImpl.mock.calls[0]?.[1]?.body);

    expect(accessToken).toBe("app-token");
    expect(cachedToken?.accessToken).toBe("app-token");
    expect(requestBody).toContain("grant_type=client_credentials");
    expect(requestBody).toContain("scope=account%3Aread");
  });

  it("keeps the app-context cache isolated from the existing 3-legged token cache", async () => {
    await defaultTokenCache.set("default", {
      accessToken: "user-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: ["data:read", "account:read"],
      obtainedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    });

    const fetchImpl = vi.fn().mockResolvedValue(createTokenResponse("fresh-app-token"));
    vi.stubGlobal("fetch", fetchImpl);

    const accessToken = await getValidAppContextAccessToken();

    expect(accessToken).toBe("fresh-app-token");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect((await defaultAppTokenCache.get("account:read"))?.accessToken).toBe("fresh-app-token");
  });
});
