import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAssetsReport } from "../src/mcp-acc-assets/service.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  await resetAuthForTests();
  await defaultTokenCache.set("session-assets", {
    accessToken: "assets-token",
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
  await resetAuthForTests();
});

describe("assets service", () => {
  it("builds a safe report with category, status, and custom-attribute enrichment", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "asset-1",
                name: "AHU-01",
                categoryId: "cat-1",
                statusId: "status-1",
                assignedTo: {
                  displayName: "Jane Manager",
                  email: "jane@example.com"
                },
                company: {
                  name: "Acme Mechanical"
                },
                locationPath: "Level 02",
                customAttributes: {
                  serial_number: "SN-42"
                },
                createdAt: "2026-01-01T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "cat-1", name: "HVAC" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "status-1", label: "Installed" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ name: "serial_number", displayName: "Serial Number" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getAssetsReport({
      projectId: "b.project-1",
      sessionKey: "session-assets",
      filters: {
        attributeNames: ["Serial Number"],
        limit: 10
      }
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init?.headers as Record<string, string>;

    expect(headers.Authorization).toBe("Bearer assets-token");
    expect(result.summary.totalAssets).toBe(1);
    expect(result.results[0]).toMatchObject({
      assetName: "AHU-01",
      category: "HVAC",
      status: "Installed",
      assignedTo: "Jane Manager",
      company: "Acme Mechanical",
      customAttributes: {
        "Serial Number": "SN-42"
      }
    });
    expect(JSON.stringify(result)).not.toContain("jane@example.com");
    expect(JSON.stringify(result)).not.toContain("\"id\":\"asset-1\"");
  });
});
