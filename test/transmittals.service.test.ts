import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportTransmittalsCsv,
  getTransmittalDetails,
  getTransmittalsReport,
  getTransmittalsSummary
} from "../src/mcp-acc-transmittals/service.js";
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

beforeEach(async () => {
  applyBaseEnv();
  clearArtifactsForTests();
  resetConfigForTests();
  await resetAuthForTests();
  await defaultTokenCache.set("session-transmittals", {
    accessToken: "transmittals-token",
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

describe("transmittals service", () => {
  function createListFetchMock() {
    return vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/construction/transmittals/v1/projects/project-1/transmittals")) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: "trans-1",
                sequenceId: "TR-001",
                title: "Electrical package",
                status: { displayName: "Sent" },
                sentBy: "user-1",
                documentsCount: 3,
                createdAt: "2026-03-01T00:00:00Z"
              },
              {
                id: "trans-2",
                sequenceId: "TR-002",
                title: "Site photos",
                status: "Draft",
                sender: { displayName: "Inline Sender" },
                documentsCount: 1,
                createdAt: "2026-03-02T00:00:00Z"
              }
            ]
          })
        );
      }

      if (url.includes("/construction/admin/v1/projects/project-1/users")) {
        return Promise.resolve(
          jsonResponse({
            results: [{ userId: "user-1", displayName: "Jane Sender" }]
          })
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
  }

  it("builds a sender-friendly summary without exposing raw user ids", async () => {
    const fetchImpl = createListFetchMock();

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getTransmittalsSummary({
      projectId: "b.project-1",
      sessionKey: "session-transmittals"
    });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/construction/transmittals/v1/projects/project-1/transmittals"
    );
    expect(result.summary).toMatchObject({
      totalTransmittals: 2,
      senderGroupsTracked: 2,
      documentsReferenced: 4
    });
    expect(result.results.bySender).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Jane Sender", count: 1 }),
        expect.objectContaining({ label: "Inline Sender", count: 1 })
      ])
    );
    expect(JSON.stringify(result)).not.toContain("user-1");
  });

  it("builds a bounded report and csv artifact for transmittals", async () => {
    const fetchImpl = createListFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const report = await getTransmittalsReport({
      projectId: "b.project-1",
      sessionKey: "session-transmittals",
      filters: {
        limit: 1
      }
    });
    const exportResult = await exportTransmittalsCsv({
      projectId: "b.project-1",
      sessionKey: "session-transmittals"
    });

    expect(report.summary).toMatchObject({
      totalTransmittals: 2,
      reportRows: 1,
      documentsReferenced: 4
    });
    expect(report.results[0]).toMatchObject({
      sequenceId: "TR-001",
      sentBy: "Jane Sender"
    });
    expect(report.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      rowsTruncated: true,
      truncated: true,
      safeLimitReached: true
    });

    expect(exportResult).toMatchObject({
      ok: true,
      artifactType: "csv",
      fileName: "transmittals-project-1.csv",
      rowCount: 2,
      truncated: false
    });
    const artifactId = exportResult.downloadPath.split("/").pop();
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const csvContent = artifact?.content.toString("utf8") ?? "";

    expect(csvContent).toContain(
      "Transmittal Number,Title,Status,Sent By,Created At,Updated At,Documents Count"
    );
    expect(csvContent).toContain("TR-001,Electrical package,Sent,Jane Sender,2026-03-01T00:00:00Z");
    expect(csvContent).toContain("TR-002,Site photos,Draft,Inline Sender,2026-03-02T00:00:00Z");
    expect(csvContent).not.toContain("user-1");
  });

  it("returns transmittal details with recipient and document display names", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "trans-1",
          sequenceId: "TR-001",
          title: "QA package",
          status: "Sent",
          sentBy: "user-1",
          message: "Package attached",
          createdAt: "2026-03-01T00:00:00Z"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipients: [
            {
              userId: "user-2",
              companyName: "Prime Contractor",
              roleName: "Reviewer"
            }
          ],
          externalMembers: [
            {
              recipientName: "Field Team",
              companyName: "Site Ops"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: "folder-1",
              name: "Shared Docs",
              updatedBy: "user-3",
              updatedAt: "2026-03-02T00:00:00Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: "doc-1",
              name: "Model.rvt",
              version: "5",
              updatedBy: "user-4",
              fileType: "rvt",
              links: {
                webView: {
                  href: "https://acc.example/doc-1"
                }
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { userId: "user-1", displayName: "Jane Sender" },
            { userId: "user-2", displayName: "Alex Reviewer" },
            { userId: "user-3", displayName: "Marta Folder" },
            { userId: "user-4", displayName: "Doc Owner" }
          ]
        })
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getTransmittalDetails({
      projectId: "b.project-1",
      transmittalId: "trans-1",
      sessionKey: "session-transmittals"
    });

    expect(result.summary).toMatchObject({
      found: true,
      recipientCount: 2,
      folderCount: 1,
      documentCount: 1
    });
    expect(result.result).toMatchObject({
      sentBy: "Jane Sender",
      message: "Package attached",
      recipients: [
        {
          name: "Alex Reviewer",
          company: "Prime Contractor",
          role: "Reviewer",
          recipientType: "internal"
        },
        {
          name: "Field Team",
          company: "Site Ops",
          recipientType: "external"
        }
      ],
      folders: [
        {
          id: "folder-1",
          name: "Shared Docs",
          updatedBy: "Marta Folder"
        }
      ],
      documents: [
        {
          id: "doc-1",
          name: "Model.rvt",
          updatedBy: "Doc Owner",
          accUrl: "https://acc.example/doc-1"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("user-4");
  });
});
