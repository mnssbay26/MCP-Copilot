import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSheetSummary } from "../src/mcp-acc-sheets/service.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  await resetAuthForTests();
  await defaultTokenCache.set("session-sheets", {
    accessToken: "sheets-token",
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

describe("sheets service", () => {
  it("summarizes sheets by discipline and tracks link availability", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "sheet-1",
              number: "A101",
              title: "Architectural Plan",
              viewerUrl: "https://acc.example.com/sheets/A101"
            },
            {
              id: "sheet-2",
              number: "S201",
              title: "Structural Section"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getSheetSummary({
      projectId: "b.project-1",
      sessionKey: "session-sheets"
    });

    expect(result.summary.totalSheets).toBe(2);
    expect(result.summary.disciplinesTracked).toBe(2);
    expect(result.summary.linkReadySheets).toBe(1);
    expect(result.results).toEqual([
      { label: "A", count: 1, percentage: 50 },
      { label: "S", count: 1, percentage: 50 }
    ]);
  });
});
