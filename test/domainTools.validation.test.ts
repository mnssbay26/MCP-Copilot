import { describe, expect, it, vi } from "vitest";
import { registerAccAccountAdminTools } from "../src/mcp-acc-account-admin/tools.js";
import { registerAccAssetsTools } from "../src/mcp-acc-assets/tools.js";
import { registerAccFormsTools } from "../src/mcp-acc-forms/tools.js";
import { registerAccRfisTools } from "../src/mcp-acc-rfis/tools.js";
import { registerAccSheetsTools } from "../src/mcp-acc-sheets/tools.js";
import { registerAccSubmittalsTools } from "../src/mcp-acc-submittals/tools.js";
import { registerAccTransmittalsTools } from "../src/mcp-acc-transmittals/tools.js";
import { registerApsViewerTools } from "../src/mcp-aps-viewer/tools.js";
import { registerDataManagementTools } from "../src/mcp-data-management/tools.js";

function getHandler(
  registerTools: (server: never) => void,
  toolName: string
): (args: Record<string, unknown>) => Promise<{ isError?: boolean }> {
  const registerTool = vi.fn();
  const server = { registerTool };
  registerTools(server as never);
  const tool = registerTool.mock.calls.find((call) => call[0] === toolName);
  return tool?.[2] as (args: Record<string, unknown>) => Promise<{ isError?: boolean }>;
}

describe("domain tool validation", () => {
  it("rejects invalid project-companies input", async () => {
    const handler = getHandler(registerAccAccountAdminTools, "get_project_companies");
    const response = await handler({ projectId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid assets input", async () => {
    const handler = getHandler(registerAccAssetsTools, "get_assets_summary");
    const response = await handler({ projectId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid sheet-link input", async () => {
    const handler = getHandler(registerAccSheetsTools, "get_sheet_link");
    const response = await handler({ projectId: "project-1" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid rfi input", async () => {
    const handler = getHandler(registerAccRfisTools, "get_rfis_summary");
    const response = await handler({ projectId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid submittals input", async () => {
    const handler = getHandler(registerAccSubmittalsTools, "get_submittals_summary");
    const response = await handler({ projectId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid forms input", async () => {
    const handler = getHandler(registerAccFormsTools, "get_forms_summary");
    const response = await handler({ projectId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid transmittals input", async () => {
    const handler = getHandler(registerAccTransmittalsTools, "get_transmittal_details");
    const response = await handler({ projectId: "project-1", transmittalId: "" });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid data management input", async () => {
    const handler = getHandler(registerDataManagementTools, "find_model_files");
    const response = await handler({ projectId: "project-1", extensions: [] });

    expect(response.isError).toBe(true);
  });

  it("rejects invalid viewer input", async () => {
    const handler = getHandler(registerApsViewerTools, "build_viewer_payload_from_version");
    const response = await handler({ projectId: "project-1" });

    expect(response.isError).toBe(true);
  });
});
