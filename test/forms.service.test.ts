import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportFormsCsv,
  findForms,
  getFormsReport,
  getFormsSummary
} from "../src/mcp-acc-forms/service.js";
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
});

afterEach(async () => {
  clearArtifactsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetConfigForTests();
  await resetAuthForTests();
});

describe("forms service", () => {
  function createFetchMock() {
    return vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/form-templates")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: "template-1",
                  name: "Safety Walk",
                  templateType: "Safety",
                  isActive: true
                },
                {
                  id: "template-2",
                  name: "Archived Daily Log",
                  templateType: "Daily Log",
                  status: "inactive"
                }
              ]
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      if (url.includes("/forms")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: "form-1",
                  name: "Level 2 Safety Walk",
                  formNumber: "FORM-001",
                  status: "Open",
                  templateId: "template-1",
                  formDate: "2026-03-01",
                  updatedAt: "2026-03-02T10:00:00.000Z"
                },
                {
                  id: "form-2",
                  name: "Archived Daily Log 12",
                  formNumber: "FORM-002",
                  status: "Draft",
                  templateId: "template-2",
                  updatedAt: "2026-03-04T10:00:00.000Z",
                  createdBy: {
                    displayName: "Jordan",
                    email: "jordan@example.com"
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
  }

  it("builds a summary and excludes inactive templates by default", async () => {
    const fetchImpl = createFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await getFormsSummary({
      projectId: "b.project-1",
      filters: {
        query: "safety"
      }
    });

    expect(result.summary.totalForms).toBe(1);
    expect(result.results.byStatus).toEqual([
      {
        label: "Open",
        count: 1,
        percentage: 100
      }
    ]);
    expect(result.results.byTemplateName[0]).toMatchObject({
      label: "Safety Walk",
      count: 1
    });
    expect(result.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      truncated: false
    });
  });

  it("returns safe report rows and supports query lookups", async () => {
    const fetchImpl = createFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const report = await getFormsReport({
      projectId: "project-1",
      filters: {
        includeInactiveFormTemplates: true,
        limit: 1
      }
    });
    const lookup = await findForms({
      projectId: "project-1",
      query: "daily",
      filters: {
        includeInactiveFormTemplates: true
      }
    });

    expect(report.summary.totalForms).toBe(2);
    expect(report.summary.reportRows).toBe(1);
    expect(report.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      rowsTruncated: true,
      truncated: true
    });
    expect(report.results[0]).toEqual({
      formName: "Level 2 Safety Walk",
      reference: "FORM-001",
      templateName: "Safety Walk",
      templateType: "Safety",
      status: "Open",
      formDate: "2026-03-01",
      updatedAt: "2026-03-02T10:00:00.000Z"
    });
    expect(JSON.stringify(report)).not.toContain("jordan@example.com");
    expect(JSON.stringify(lookup.results)).not.toContain("form-2");
    expect(lookup.results[0]).toMatchObject({
      formName: "Archived Daily Log 12",
      templateName: "Archived Daily Log",
      templateType: "Daily Log"
    });
    expect(lookup.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      truncated: false
    });
  });

  it("creates a csv artifact for deeper form review without returning the raw payload", async () => {
    const fetchImpl = createFetchMock();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await exportFormsCsv({
      projectId: "project-1",
      filters: {
        includeInactiveFormTemplates: true
      }
    });

    expect(result).toMatchObject({
      ok: true,
      artifactType: "csv",
      fileName: "forms-project-1.csv",
      rowCount: 2,
      truncated: false
    });
    expect(result.retrieval).toMatchObject({
      totalFetched: 2,
      pageCount: 1,
      truncated: false
    });

    const artifactId = result.downloadPath.split("/").pop();
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const csvContent = artifact?.content.toString("utf8") ?? "";

    expect(csvContent).toContain(
      "Form Name,Reference,Template Name,Template Type,Status,Form Date,Updated At"
    );
    expect(csvContent).toContain(
      "Level 2 Safety Walk,FORM-001,Safety Walk,Safety,Open,2026-03-01,2026-03-02T10:00:00.000Z"
    );
    expect(csvContent).toContain(
      "Archived Daily Log 12,FORM-002,Archived Daily Log,Daily Log,Draft,,2026-03-04T10:00:00.000Z"
    );
    expect(csvContent).not.toContain("jordan@example.com");
  });
});
