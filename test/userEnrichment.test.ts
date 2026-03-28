import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { resetConfigForTests } from "../src/shared/config/env.js";
import { createProjectUserEnricher } from "../src/shared/users/enrichment.js";

function applyBaseEnv(): void {
  process.env.APS_CLIENT_ID = "client-id";
  process.env.APS_CLIENT_SECRET = "client-secret";
  process.env.APS_CALLBACK_URL = "http://localhost:3000/auth/callback";
  process.env.APS_SCOPES = "data:read account:read";
  process.env.APS_ACCOUNT_ID = "account-123";
  process.env.PORT = "3000";
  process.env.MCP_TRANSPORT = "http";
  delete process.env.APS_REGION;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(async () => {
  applyBaseEnv();
  resetConfigForTests();
  await resetAuthForTests();
  await defaultTokenCache.set("session-users", {
    accessToken: "users-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    scope: ["data:read", "account:read"],
    obtainedAt: Date.now(),
    expiresAt: Date.now() + 300_000
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetConfigForTests();
  await resetAuthForTests();
});

describe("project user enrichment", () => {
  it("resolves user identifiers to display names and caches the lookup", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { userId: "user-1", displayName: "Jane Doe" },
          { autodeskId: "adsk-2", displayName: "Bob Smith" }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchImpl);

    const enricher = createProjectUserEnricher({
      projectId: "b.project-1",
      sessionKey: "session-users"
    });

    await enricher.prime(["user-1", { autodeskId: "adsk-2" }]);
    await enricher.prime(["user-1"]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/construction/admin/v1/projects/project-1/users"
    );
    expect(enricher.resolveDisplayName("user-1")).toBe("Jane Doe");
    expect(enricher.resolveDisplayName({ autodeskId: "adsk-2" })).toBe("Bob Smith");
    expect(enricher.resolveDisplayNames(["user-1", "adsk-2"])).toEqual([
      "Jane Doe",
      "Bob Smith"
    ]);
  });

  it("degrades gracefully when the project user lookup is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: "forbidden"
        },
        403
      )
    );

    vi.stubGlobal("fetch", fetchImpl);

    const enricher = createProjectUserEnricher({
      projectId: "b.project-1",
      sessionKey: "session-users"
    });

    await enricher.prime(["user-404"]);

    expect(enricher.warnings[0]?.code).toBe("project_user_lookup_unavailable");
    expect(enricher.resolveDisplayName({ displayName: "Inline Name", email: "inline@example.com" })).toBe(
      "Inline Name"
    );
    expect(enricher.resolveDisplayName("Plain English")).toBe("Plain English");
    expect(enricher.resolveDisplayName("user-404")).toBeUndefined();
  });
});
