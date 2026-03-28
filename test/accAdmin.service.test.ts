import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProjectCompanies,
  getProjects,
  getUsers
} from "../src/mcp-acc-account-admin/service.js";
import { resetAppAuthForTests } from "../src/shared/auth/apsAppAuth.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { resetConfigForTests } from "../src/shared/config/env.js";

function applyBaseEnv(): void {
  process.env.APS_CLIENT_ID = "client-id";
  process.env.APS_CLIENT_SECRET = "client-secret";
  process.env.APS_CALLBACK_URL = "http://localhost:3000/auth/callback";
  process.env.APS_SCOPES = "data:read account:read";
  process.env.APS_ACCOUNT_ID = "b.account-123";
  process.env.APS_REGION = "EMEA";
  process.env.PORT = "3000";
  process.env.MCP_TRANSPORT = "http";
}

beforeEach(async () => {
  applyBaseEnv();
  resetConfigForTests();
  await resetAuthForTests();
  await resetAppAuthForTests();
  await defaultTokenCache.set("default", {
    accessToken: "access-token",
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
  await resetAppAuthForTests();
});

describe("accAdmin service", () => {
  function createAppTokenResponse() {
    return new Response(
      JSON.stringify({
        access_token: "app-token",
        expires_in: 3_600,
        token_type: "Bearer",
        scope: "account:read"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  it("calls the projects endpoint and normalizes account IDs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "project-1",
              name: "Project One",
              status: "active",
              platform: "acc"
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

    const result = await getProjects({ limit: 10, offset: 0 });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/accounts/account-123/projects");
    expect(
      (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    ).toMatchObject({
      Authorization: "Bearer access-token",
      Region: "EMEA"
    });
    expect(result.results[0]).toMatchObject({
      id: "project-1",
      name: "Project One"
    });
    expect(result.meta.accountId).toBe("account-123");
  });

  it("calls the project users endpoint and normalizes user data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "user-1",
              name: "Jane Doe",
              email: "jane@example.com",
              companyName: "Acme",
              accessLevels: ["project_admin"]
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

    const result = await getUsers({
      projectId: "b.project-1",
      limit: 10,
      offset: 0,
      region: "US"
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/projects/project-1/users");
    expect(
      (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    ).toMatchObject({
      Region: "US"
    });
    expect(result.results[0]).toMatchObject({
      id: "user-1",
      email: "jane@example.com",
      companyName: "Acme"
    });
  });

  it("calls the project companies endpoint with app-context auth and returns curated rows", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createAppTokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "company-1",
                name: "Acme Mechanical",
                trade: "Mechanical",
                status: "active",
                type: "Subcontractor",
                website_url: "https://example.com"
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

    const result = await getProjectCompanies({
      projectId: "b.project-1",
      limit: 10,
      offset: 0
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/authentication/v2/token");
    expect(fetchImpl.mock.calls[1]?.[0]).toContain(
      "/hq/v1/accounts/account-123/projects/project-1/companies"
    );
    expect(
      (fetchImpl.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    ).toMatchObject({
      Authorization: "Bearer app-token",
      Region: "EMEA"
    });
    expect(result.results[0]).toEqual({
      companyName: "Acme Mechanical",
      trade: "Mechanical",
      companyType: "Subcontractor",
      status: "active"
    });
    expect(result.results[0]).not.toHaveProperty("id");
    expect(result.summary.totalCompanies).toBe(1);
    expect(result.breakdowns.byTrade[0]).toMatchObject({
      label: "Mechanical",
      count: 1
    });
  });
});
