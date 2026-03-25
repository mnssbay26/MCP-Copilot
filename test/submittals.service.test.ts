import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubmittalsReport } from "../src/mcp-acc-submittals/service.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  await resetAuthForTests();
  await defaultTokenCache.set("session-submittals", {
    accessToken: "submittals-token",
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

describe("submittals service", () => {
  it("builds a safe report with spec-section enrichment", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "sub-1",
                identifier: "033000-01",
                title: "Water Closet",
                status: "Open",
                specId: "spec-1",
                manager: {
                  displayName: "Marta PM",
                  email: "marta@example.com"
                },
                response: {
                  value: "Approved"
                },
                dueDate: "2026-04-01"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "spec-1",
                identifier: "033000",
                title: "Cast-in-Place Concrete"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getSubmittalsReport({
      projectId: "b.project-1",
      sessionKey: "session-submittals",
      filters: {
        limit: 10
      }
    });

    expect(result.summary.totalSubmittals).toBe(1);
    expect(result.results[0]).toMatchObject({
      identifier: "033000-01",
      title: "Water Closet",
      status: "Open",
      specSection: "033000 - Cast-in-Place Concrete",
      manager: "Marta PM",
      response: "Approved"
    });
    expect(JSON.stringify(result)).not.toContain("marta@example.com");
    expect(JSON.stringify(result)).not.toContain("\"id\":\"sub-1\"");
  });
});
