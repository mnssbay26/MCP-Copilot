import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRfisReport } from "../src/mcp-acc-rfis/service.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  await resetAuthForTests();
  await defaultTokenCache.set("session-rfis", {
    accessToken: "rfis-token",
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

describe("rfis service", () => {
  it("builds a safe report with type and custom-attribute enrichment", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "rfi-1",
                displayId: 14,
                title: "Clarify door hardware",
                status: "Open",
                typeId: "type-1",
                assignedTo: {
                  displayName: "Alex Reviewer",
                  email: "alex@example.com"
                },
                attributes: {
                  priority_label: "Critical"
                },
                createdAt: "2026-02-01T00:00:00Z"
              }
            ],
            pagination: {
              hasMore: false
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "type-1", name: "Design" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ name: "priority_label", displayName: "Priority" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getRfisReport({
      projectId: "b.project-1",
      sessionKey: "session-rfis",
      filters: {
        attributeNames: ["Priority"],
        limit: 10
      }
    });

    expect(result.summary.totalRfis).toBe(1);
    expect(result.results[0]).toMatchObject({
      rfiNumber: "14",
      title: "Clarify door hardware",
      status: "Open",
      type: "Design",
      assignedTo: "Alex Reviewer",
      customAttributes: {
        Priority: "Critical"
      }
    });
    expect(JSON.stringify(result)).not.toContain("alex@example.com");
    expect(JSON.stringify(result)).not.toContain("\"id\":\"rfi-1\"");
  });
});
