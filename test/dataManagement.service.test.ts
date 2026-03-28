import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findModelFiles,
  getFolderContents,
  getItemVersions,
  getTopFolders
} from "../src/mcp-data-management/service.js";
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
  await defaultTokenCache.set("session-dm", {
    accessToken: "dm-token",
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
});

describe("data management service", () => {
  it("lists project top folders with safe display fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            type: "folders",
            id: "folder-1",
            attributes: {
              displayName: "Project Files",
              extension: { type: "folders:autodesk.core:Folder" },
              objectCount: 4,
              path: "/Project Files",
              createTime: "2026-03-01T00:00:00Z",
              createUserName: "Folder Owner",
              lastModifiedTime: "2026-03-02T00:00:00Z",
              lastModifiedUserName: "Folder Editor",
              hidden: false
            },
            links: {
              webView: {
                href: "https://acc.example/folders/folder-1"
              }
            }
          }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getTopFolders({
      projectId: "project-1",
      sessionKey: "session-dm"
    });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/project/v1/hubs/b.account-123/projects/b.project-1/topFolders"
    );
    expect(result.summary).toEqual({
      totalFolders: 1,
      hiddenFolders: 0
    });
    expect(result.results[0]).toMatchObject({
      folderId: "folder-1",
      name: "Project Files",
      createdBy: "Folder Owner",
      updatedBy: "Folder Editor",
      accUrl: "https://acc.example/folders/folder-1"
    });
  });

  it("normalizes folder contents and pagination details", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            type: "folders",
            id: "folder-2",
            attributes: {
              displayName: "Models",
              extension: { type: "folders:autodesk.core:Folder" },
              path: "/Project Files/Models",
              objectCount: 2,
              createUserName: "Folder Owner",
              lastModifiedUserName: "Folder Editor"
            }
          },
          {
            type: "items",
            id: "item-1",
            attributes: {
              displayName: "Tower.rvt",
              extension: { type: "items:autodesk.bim360:File" },
              createUserName: "Author"
            },
            relationships: {
              tip: {
                data: {
                  id: "urn:adsk.wipprod:fs.file:vf.tower?version=3"
                }
              }
            }
          }
        ],
        included: [
          {
            type: "versions",
            id: "urn:adsk.wipprod:fs.file:vf.tower?version=3",
            attributes: {
              name: "Tower.rvt",
              displayName: "Tower.rvt",
              fileType: "rvt",
              versionNumber: 3,
              lastModifiedTime: "2026-03-03T00:00:00Z",
              lastModifiedUserName: "Model Editor"
            }
          }
        ],
        links: {
          next: {
            href: "https://developer.api.autodesk.com/data/v1/projects/b.project-1/folders/folder-1/contents?page[number]=1&page[limit]=2"
          }
        }
      })
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getFolderContents({
      projectId: "b.project-1",
      folderId: "folder-1",
      sessionKey: "session-dm",
      pagination: {
        pageNumber: 0,
        pageLimit: 2
      }
    });

    expect(result.summary).toEqual({
      totalEntries: 2,
      folderCount: 1,
      itemCount: 1
    });
    expect(result.pagination).toEqual({
      pageNumber: 0,
      pageLimit: 2,
      returned: 2,
      hasNextPage: true,
      nextPageNumber: 1
    });
    expect(result.results[1]).toMatchObject({
      entryType: "item",
      id: "item-1",
      name: "Tower.rvt",
      latestVersionUrn: "urn:adsk.wipprod:fs.file:vf.tower?version=3",
      latestVersionNumber: 3,
      updatedBy: "Model Editor"
    });
  });

  it("lists item versions with curated version metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            type: "versions",
            id: "urn:adsk.wipprod:fs.file:vf.tower?version=3",
            attributes: {
              name: "Tower.rvt",
              displayName: "Tower.rvt",
              fileType: "rvt",
              versionNumber: 3,
              createTime: "2026-03-01T00:00:00Z",
              createUserName: "Author One",
              lastModifiedTime: "2026-03-03T00:00:00Z",
              lastModifiedUserName: "Editor One"
            }
          },
          {
            type: "versions",
            id: "urn:adsk.wipprod:fs.file:vf.tower?version=2",
            attributes: {
              name: "Tower.rvt",
              displayName: "Tower.rvt",
              fileType: "rvt",
              versionNumber: 2,
              createTime: "2026-02-28T00:00:00Z",
              createUserName: "Author Zero",
              lastModifiedTime: "2026-03-01T00:00:00Z",
              lastModifiedUserName: "Editor Zero"
            }
          }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await getItemVersions({
      projectId: "project-1",
      itemId: "item-1",
      sessionKey: "session-dm"
    });

    expect(result.summary).toEqual({
      totalVersions: 2,
      returnedVersions: 2
    });
    expect(result.results[0]).toMatchObject({
      versionId: "urn:adsk.wipprod:fs.file:vf.tower?version=3",
      versionUrn: "urn:adsk.wipprod:fs.file:vf.tower?version=3",
      versionNumber: 3,
      createdBy: "Author One",
      updatedBy: "Editor One"
    });
  });

  it("traverses folders safely and filters model files by extension", async () => {
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
              type: "folders",
              id: "folder-models",
              attributes: {
                displayName: "Models",
                extension: { type: "folders:autodesk.core:Folder" },
                path: "/Project Files/Models"
              }
            },
            {
              type: "items",
              id: "item-rvt",
              attributes: {
                displayName: "Campus.rvt",
                extension: { type: "items:autodesk.bim360:File" }
              },
              relationships: {
                tip: {
                  data: {
                    id: "urn:adsk.wipprod:fs.file:vf.campus?version=7"
                  }
                }
              }
            },
            {
              type: "items",
              id: "item-pdf",
              attributes: {
                displayName: "Campus.pdf",
                extension: { type: "items:autodesk.bim360:File" }
              },
              relationships: {
                tip: {
                  data: {
                    id: "urn:adsk.wipprod:fs.file:vf.campus-pdf?version=1"
                  }
                }
              }
            }
          ],
          included: [
            {
              type: "versions",
              id: "urn:adsk.wipprod:fs.file:vf.campus?version=7",
              attributes: {
                name: "Campus.rvt",
                fileType: "rvt",
                versionNumber: 7,
                lastModifiedTime: "2026-03-05T00:00:00Z",
                lastModifiedUserName: "Model Editor"
              }
            },
            {
              type: "versions",
              id: "urn:adsk.wipprod:fs.file:vf.campus-pdf?version=1",
              attributes: {
                name: "Campus.pdf",
                fileType: "pdf",
                versionNumber: 1,
                lastModifiedTime: "2026-03-01T00:00:00Z",
                lastModifiedUserName: "Document Editor"
              }
            }
          ]
        })
      );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await findModelFiles({
      projectId: "b.project-1",
      extensions: ["rvt"],
      sessionKey: "session-dm",
      traversalOptions: {
        maxResults: 1,
        maxDepth: 1,
        maxFoldersVisited: 10,
        maxPagesPerFolder: 1,
        pageLimit: 50
      }
    });

    expect(result.summary).toMatchObject({
      matchedFiles: 1,
      returnedFiles: 1,
      visitedFolders: 1,
      extensionsMatched: 1
    });
    expect(result.results[0]).toMatchObject({
      itemId: "item-rvt",
      name: "Campus.rvt",
      extension: "rvt",
      folderPath: "/Project Files",
      latestVersionUrn: "urn:adsk.wipprod:fs.file:vf.campus?version=7",
      updatedBy: "Model Editor"
    });
    expect(result.retrieval).toMatchObject({
      totalFetched: 1,
      pageCount: 1,
      sourceTruncated: true,
      truncated: true
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "model_file_results_truncated" })
      ])
    );
  });
});
