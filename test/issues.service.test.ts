import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportIssuesCsv,
  getIssues,
  getIssuesReport,
  getIssuesSummary
} from "../src/mcp-acc-issues/service.js";
import { clearArtifactsForTests, getArtifact } from "../src/shared/artifacts/store.js";
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createIssuesFetchMock() {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/construction/issues/v1/projects/project-1/issues")) {
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              id: "issue-1",
              displayId: 101,
              title: "Door clash",
              status: "Open",
              assignedTo: "user-1",
              createdBy: "user-2",
              updatedBy: "user-2",
              watchers: ["user-3", "user-2"],
              dueDate: "2026-04-01",
              createdAt: "2026-03-01T00:00:00Z",
              updatedAt: "2026-03-02T00:00:00Z"
            },
            {
              id: "issue-2",
              displayId: 102,
              title: "Missing tag",
              status: "Closed",
              assignedTo: {
                displayName: "Taylor PM",
                email: "taylor@example.com"
              },
              createdBy: "user-2",
              watchers: ["user-3"],
              createdAt: "2026-03-03T00:00:00Z",
              updatedAt: "2026-03-04T00:00:00Z"
            }
          ],
          pagination: {
            hasMore: false
          }
        })
      );
    }

    if (url.includes("/construction/admin/v1/projects/project-1/users")) {
      return Promise.resolve(
        jsonResponse({
          results: [
            { userId: "user-1", displayName: "Alex Reviewer" },
            { userId: "user-2", displayName: "Morgan Creator" },
            { userId: "user-3", displayName: "Casey Watcher" }
          ]
        })
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

beforeEach(async () => {
  applyBaseEnv();
  clearArtifactsForTests();
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
  clearArtifactsForTests();
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

  it("builds summary, report, and csv export outputs with enriched names and truncation metadata", async () => {
    const fetchImpl = createIssuesFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const summary = await getIssuesSummary({
      projectId: "b.project-1",
      sessionKey: "session-issues"
    });
    const report = await getIssuesReport({
      projectId: "b.project-1",
      sessionKey: "session-issues",
      filters: {
        limit: 1
      }
    });
    const exportResult = await exportIssuesCsv({
      projectId: "b.project-1",
      sessionKey: "session-issues"
    });

    expect(summary.summary).toMatchObject({
      totalIssues: 2,
      statusesTracked: 2,
      assigneeGroupsTracked: 2
    });
    expect(summary.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      truncated: false
    });

    expect(report.summary).toMatchObject({
      totalIssues: 2,
      reportRows: 1
    });
    expect(report.results[0]).toMatchObject({
      issueNumber: "101",
      assignedTo: "Alex Reviewer",
      createdBy: "Morgan Creator",
      watchers: ["Casey Watcher", "Morgan Creator"]
    });
    expect(report.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      rowsTruncated: true,
      truncated: true,
      safeLimitReached: true
    });
    expect(JSON.stringify(report)).not.toContain("user-1");
    expect(JSON.stringify(report)).not.toContain("taylor@example.com");

    expect(exportResult).toMatchObject({
      ok: true,
      artifactType: "csv",
      fileName: "issues-project-1.csv",
      rowCount: 2,
      truncated: false,
      safeLimitReached: false
    });
    expect(exportResult.downloadPath).toMatch(/^\/artifacts\/.+/);

    const artifactId = exportResult.downloadPath.split("/").pop();
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const csvContent = artifact?.content.toString("utf8") ?? "";

    expect(csvContent).toContain(
      "Issue Number,Title,Status,Assigned To,Created By,Updated By,Opened By,Closed By,Deleted By,Watchers,Due Date,Created At,Updated At"
    );
    expect(csvContent).toContain("Alex Reviewer");
    expect(csvContent).toContain("Casey Watcher; Morgan Creator");
    expect(csvContent).not.toContain("user-1");
    expect(csvContent).not.toContain("taylor@example.com");
  });
});
