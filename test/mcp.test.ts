import { describe, expect, it, vi } from "vitest";
import { registerAccAccountAdminTools } from "../src/mcp-acc-account-admin/tools.js";
import { registerAccIssuesTools } from "../src/mcp-acc-issues/tools.js";

describe("registerTools", () => {
  it("registers the account-admin tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerAccAccountAdminTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual(["get_projects", "get_users"]);
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
});
