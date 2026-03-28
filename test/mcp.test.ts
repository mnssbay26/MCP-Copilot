import { describe, expect, it, vi } from "vitest";
import { registerAccAccountAdminTools } from "../src/mcp-acc-account-admin/tools.js";
import { registerAccAssetsTools } from "../src/mcp-acc-assets/tools.js";
import { registerAccFormsTools } from "../src/mcp-acc-forms/tools.js";
import { registerAccIssuesTools } from "../src/mcp-acc-issues/tools.js";
import { registerAccRfisTools } from "../src/mcp-acc-rfis/tools.js";
import { registerAccSheetsTools } from "../src/mcp-acc-sheets/tools.js";
import { registerAccSubmittalsTools } from "../src/mcp-acc-submittals/tools.js";

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
    expect(toolNames).toEqual(["get_issues"]);
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
    expect(toolNames).toEqual(["find_sheets", "get_sheet_link", "get_sheet_summary"]);
  });

  it("registers the rfi tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccRfisTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual([
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
    expect(toolNames).toEqual(["find_forms", "get_forms_report", "get_forms_summary"]);
  });
});
