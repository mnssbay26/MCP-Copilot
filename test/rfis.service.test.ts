import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportRfisCsv, getRfisReport } from "../src/mcp-acc-rfis/service.js";
import { clearArtifactsForTests, getArtifact } from "../src/shared/artifacts/store.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";

beforeEach(async () => {
  clearArtifactsForTests();
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
  clearArtifactsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetAuthForTests();
});

describe("rfis service", () => {
  function createFetchMock() {
    return vi
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
  }

  it("builds a safe report with type and custom-attribute enrichment", async () => {
    const fetchImpl = createFetchMock();

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

  it("creates a csv artifact with curated columns and no email exposure", async () => {
    const fetchImpl = createFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await exportRfisCsv({
      projectId: "b.project-1",
      sessionKey: "session-rfis",
      filters: {
        attributeNames: ["Priority"]
      }
    });

    expect(result).toMatchObject({
      ok: true,
      artifactType: "csv",
      fileName: "rfis-project-1.csv",
      rowCount: 1,
      truncated: false
    });
    expect(result.downloadPath).toMatch(/^\/artifacts\/.+/);
    expect(result.retrieval).toMatchObject({
      totalFetched: 1,
      pageCount: 1,
      truncated: false
    });

    const artifactId = result.downloadPath.split("/").pop();
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const csvContent = artifact?.content.toString("utf8") ?? "";

    expect(csvContent).toContain(
      "RFI Number,Title,Status,Type,Assigned To,Due Date,Created At,Updated At,Custom Attributes"
    );
    expect(csvContent).toContain("14,Clarify door hardware,Open,Design,Alex Reviewer");
    expect(csvContent).toContain("Priority: Critical");
    expect(csvContent).not.toContain("alex@example.com");
    expect(csvContent).not.toContain("\"id\":\"rfi-1\"");
  });
});
