import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportSheetsCsv,
  getSheetSummary,
  getSheetsReport
} from "../src/mcp-acc-sheets/service.js";
import { clearArtifactsForTests, getArtifact } from "../src/shared/artifacts/store.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  clearArtifactsForTests();
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
  clearArtifactsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetAuthForTests();
});

describe("sheets service", () => {
  function createFetchMock() {
    return vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "sheet-1",
                number: "A101",
                title: "Architectural Plan",
                viewerUrl: "https://acc.example.com/sheets/A101",
                versionSetName: "Permit",
                tags: ["Permit", "Level 1"],
                updatedAt: "2026-03-03T00:00:00Z"
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
      )
    );
  }

  it("summarizes sheets by discipline and tracks link availability", async () => {
    const fetchImpl = createFetchMock();

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
    expect(result.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      truncated: false
    });
  });

  it("builds a bounded report and csv artifact for sheets", async () => {
    const fetchImpl = createFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const report = await getSheetsReport({
      projectId: "b.project-1",
      sessionKey: "session-sheets",
      filters: {
        limit: 1
      }
    });
    const exportResult = await exportSheetsCsv({
      projectId: "b.project-1",
      sessionKey: "session-sheets"
    });

    expect(report.summary).toMatchObject({
      totalSheets: 2,
      reportRows: 1,
      disciplinesTracked: 2,
      linkReadySheets: 1
    });
    expect(report.results[0]).toMatchObject({
      sheetNumber: "A101",
      discipline: "A",
      linkAvailable: true
    });
    expect(report.retrieval).toMatchObject({
      totalFetched: 2,
      rowsTruncated: true,
      truncated: true,
      safeLimitReached: true
    });

    expect(exportResult).toMatchObject({
      ok: true,
      artifactType: "csv",
      fileName: "sheets-project-1.csv",
      rowCount: 2,
      truncated: false
    });
    const artifactId = exportResult.downloadPath.split("/").pop();
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const csvContent = artifact?.content.toString("utf8") ?? "";

    expect(csvContent).toContain(
      "Sheet Number,Title,Discipline,Version Set,Tags,Updated At,Published At,ACC Link Available"
    );
    expect(csvContent).toContain("A101,Architectural Plan,A,Permit,Permit; Level 1,2026-03-03T00:00:00Z,,Yes");
    expect(csvContent).toContain("S201,Structural Section,S");
  });
});
