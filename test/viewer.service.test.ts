import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildViewerPayloadFromItem,
  buildViewerPayloadFromSearch,
  buildViewerPayloadFromVersion
} from "../src/mcp-aps-viewer/service.js";
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
  resetConfigForTests();
  await resetAuthForTests();
  await defaultTokenCache.set("session-viewer", {
    accessToken: "viewer-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    scope: ["data:read", "viewables:read", "account:read"],
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

describe("viewer service", () => {
  it("builds a viewer payload directly from a version URN", async () => {
    const versionUrn = "urn:adsk.wipprod:fs.file:vf.abc123?version=2";
    const expectedEncodedUrn = Buffer.from(versionUrn, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await buildViewerPayloadFromVersion({
      projectId: "project-1",
      versionUrn,
      sessionKey: "session-viewer"
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      found: true,
      sourceType: "version",
      alternativeCount: 0
    });
    expect(result.result).toMatchObject({
      projectId: "b.project-1",
      versionId: versionUrn,
      versionUrn,
      encodedUrn: expectedEncodedUrn,
      viewerDocumentId: `urn:${expectedEncodedUrn}`,
      manifestPath:
        `https://developer.api.autodesk.com/modelderivative/v2/designdata/${expectedEncodedUrn}/manifest`
    });
  });

  it("builds a viewer payload from the latest version of an item", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          type: "items",
          id: "item-1",
          attributes: {
            displayName: "Tower.rvt",
            extension: { type: "items:autodesk.bim360:File" }
          },
          relationships: {
            tip: {
              data: {
                id: "urn:adsk.wipprod:fs.file:vf.tower?version=5"
              }
            }
          }
        },
        included: [
          {
            type: "versions",
            id: "urn:adsk.wipprod:fs.file:vf.tower?version=5",
            attributes: {
              name: "Tower.rvt",
              displayName: "Tower.rvt",
              fileType: "rvt",
              versionNumber: 5,
              lastModifiedTime: "2026-03-05T00:00:00Z"
            }
          }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await buildViewerPayloadFromItem({
      projectId: "b.project-1",
      itemId: "item-1",
      sessionKey: "session-viewer"
    });

    expect(result.summary).toEqual({
      found: true,
      sourceType: "item",
      alternativeCount: 0
    });
    expect(result.result).toMatchObject({
      itemId: "item-1",
      versionId: "urn:adsk.wipprod:fs.file:vf.tower?version=5",
      versionUrn: "urn:adsk.wipprod:fs.file:vf.tower?version=5",
      displayName: "Tower.rvt",
      versionNumber: 5,
      fileType: "rvt"
    });
  });

  it("builds a search-based viewer payload with alternatives and default extension warnings", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              type: "folders",
              id: "folder-top",
              attributes: {
                displayName: "Project Files",
                extension: { type: "folders:autodesk.core:Folder" },
                path: "/Project Files"
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              type: "items",
              id: "item-a",
              attributes: {
                displayName: "Tower.rvt",
                extension: { type: "items:autodesk.bim360:File" }
              },
              relationships: {
                tip: {
                  data: {
                    id: "urn:adsk.wipprod:fs.file:vf.tower?version=9"
                  }
                }
              }
            },
            {
              type: "items",
              id: "item-b",
              attributes: {
                displayName: "Tower Annex.rvt",
                extension: { type: "items:autodesk.bim360:File" }
              },
              relationships: {
                tip: {
                  data: {
                    id: "urn:adsk.wipprod:fs.file:vf.tower-annex?version=4"
                  }
                }
              }
            }
          ],
          included: [
            {
              type: "versions",
              id: "urn:adsk.wipprod:fs.file:vf.tower?version=9",
              attributes: {
                name: "Tower.rvt",
                fileType: "rvt",
                versionNumber: 9,
                lastModifiedTime: "2026-03-06T00:00:00Z"
              }
            },
            {
              type: "versions",
              id: "urn:adsk.wipprod:fs.file:vf.tower-annex?version=4",
              attributes: {
                name: "Tower Annex.rvt",
                fileType: "rvt",
                versionNumber: 4,
                lastModifiedTime: "2026-03-01T00:00:00Z"
              }
            }
          ]
        })
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await buildViewerPayloadFromSearch({
      projectId: "project-1",
      query: "Tower",
      sessionKey: "session-viewer"
    });

    expect(result.summary).toEqual({
      found: true,
      sourceType: "search",
      alternativeCount: 1
    });
    expect(result.result).toMatchObject({
      itemId: "item-a",
      versionUrn: "urn:adsk.wipprod:fs.file:vf.tower?version=9",
      displayName: "Tower.rvt",
      fileType: "rvt"
    });
    expect(result.result?.alternatives).toEqual([
      expect.objectContaining({
        itemId: "item-b",
        name: "Tower Annex.rvt",
        latestVersionUrn: "urn:adsk.wipprod:fs.file:vf.tower-annex?version=4"
      })
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "viewer_search_default_extensions" })
      ])
    );
  });
});
