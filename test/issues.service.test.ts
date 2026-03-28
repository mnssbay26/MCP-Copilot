import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIssues } from "../src/mcp-acc-issues/service.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { resetConfigForTests } from "../src/shared/config/env.js";

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

beforeEach(async () => {
  applyBaseEnv();
  resetConfigForTests();
  await resetAuthForTests();
  await defaultTokenCache.set("default", {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    scope: ["data:read", "account:read"],
    obtainedAt: Date.now(),
    expiresAt: Date.now() + 300_000
  });
  await defaultTokenCache.set("session-issues", {
    accessToken: "issues-token",
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

describe("issues service", () => {
  it("calls the issues endpoint and normalizes issue data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "issue-1",
              displayId: 42,
              title: "Door clash",
              status: "open",
              assignedTo: {
                name: "Jane Doe"
              }
            }
          ],
          pagination: {
            totalResults: 1,
            returned: 1,
            hasMore: false,
            nextOffset: null
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getIssues({
      projectId: "b.project-1",
      limit: 10,
      offset: 0,
      sessionKey: "session-issues"
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/projects/project-1/issues");
    expect(
      (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    ).toMatchObject({
      Authorization: "Bearer issues-token"
    });
    expect(result.results[0]).toMatchObject({
      id: "issue-1",
      displayId: "42",
      title: "Door clash",
      assignedTo: "Jane Doe"
    });
  });
});
