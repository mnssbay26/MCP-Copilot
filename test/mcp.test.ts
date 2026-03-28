import { describe, expect, it, vi } from "vitest";
import { registerAccAccountAdminTools } from "../src/mcp-acc-account-admin/tools.js";
import { registerAccAssetsTools } from "../src/mcp-acc-assets/tools.js";
import { registerAccFormsTools } from "../src/mcp-acc-forms/tools.js";
import { registerAccIssuesTools } from "../src/mcp-acc-issues/tools.js";
import { registerAccRfisTools } from "../src/mcp-acc-rfis/tools.js";
import { registerAccSheetsTools } from "../src/mcp-acc-sheets/tools.js";
import { registerAccSubmittalsTools } from "../src/mcp-acc-submittals/tools.js";
import { registerAccTransmittalsTools } from "../src/mcp-acc-transmittals/tools.js";
import { registerApsViewerTools } from "../src/mcp-aps-viewer/tools.js";
import { registerDataManagementTools } from "../src/mcp-data-management/tools.js";

function getRegisteredTools(registerTools: (server: never) => void) {
  const registerTool = vi.fn();
  const server = {
    registerTool
  };

  registerTools(server as never);

  return registerTool.mock.calls.map((call) => ({
    name: call[0] as string,
    config: call[1] as { inputSchema?: Record<string, unknown> }
  }));
}

describe("registerTools", () => {
  it("registers the account-admin tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccAccountAdminTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual(["get_project_companies", "get_projects", "get_users"]);
    expect(registerTool.mock.calls[0]?.[1]).toHaveProperty("inputSchema");
  });

  it("registers the issues tool", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccIssuesTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_issues_csv",
      "get_issues",
      "get_issues_report",
      "get_issues_summary"
    ]);
    expect(registerTool.mock.calls[0]?.[1]).toHaveProperty("inputSchema");
  });

  it("registers the assets tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccAssetsTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "get_assets_by_category",
      "get_assets_by_status",
      "get_assets_report",
      "get_assets_summary"
    ]);
  });

  it("registers the sheets tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccSheetsTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_sheets_csv",
      "find_sheets",
      "get_sheet_link",
      "get_sheet_summary",
      "get_sheets_report",
      "get_sheets_summary"
    ]);
  });

  it("registers the rfi tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccRfisTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_rfis_csv",
      "find_rfis",
      "get_rfis_by_type",
      "get_rfis_report",
      "get_rfis_summary"
    ]);
  });

  it("registers the submittals tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccSubmittalsTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_submittals_csv",
      "find_submittals",
      "get_submittals_by_spec",
      "get_submittals_report",
      "get_submittals_summary"
    ]);
  });

  it("registers the forms tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccFormsTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_forms_csv",
      "find_forms",
      "get_forms_report",
      "get_forms_summary"
    ]);
  });

  it("registers the transmittals tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccTransmittalsTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "export_transmittals_csv",
      "find_transmittals",
      "get_transmittal_details",
      "get_transmittals_report",
      "get_transmittals_summary"
    ]);
  });

  it("registers the data management tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerDataManagementTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "find_model_files",
      "get_folder_contents",
      "get_item",
      "get_item_versions",
      "get_top_folders"
    ]);
  });

  it("registers the viewer tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerApsViewerTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
      "build_viewer_payload_from_item",
      "build_viewer_payload_from_search",
      "build_viewer_payload_from_version"
    ]);
  });

  it("adds sessionKey to every 3-legged tool schema and keeps project companies app-context only", () => {
    const registrars = [
      registerAccAccountAdminTools,
      registerAccIssuesTools,
      registerAccAssetsTools,
      registerAccSheetsTools,
      registerAccRfisTools,
      registerAccSubmittalsTools,
      registerAccFormsTools,
      registerAccTransmittalsTools,
      registerDataManagementTools,
      registerApsViewerTools
    ];

    const tools = registrars.flatMap((registerTools) => getRegisteredTools(registerTools));
    const threeLeggedToolNames = tools
      .map((tool) => tool.name)
      .filter((name) => name !== "get_project_companies");

    for (const toolName of threeLeggedToolNames) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool?.config.inputSchema).toHaveProperty("sessionKey");
    }

    const projectCompanies = tools.find((tool) => tool.name === "get_project_companies");
    expect(projectCompanies?.config.inputSchema).not.toHaveProperty("sessionKey");
  });
});
