import { describe, expect, it, vi } from "vitest";
import { registerTools } from "../src/mcp/registerTools.js";

describe("registerTools", () => {
  it("registers the three initial business tools", () => {
    const registerTool = vi.fn();
    const server = {
      registerTool
    };

    registerTools(server as never);

    const toolNames = registerTool.mock.calls.map((call) => call[0]).sort();
    expect(toolNames).toEqual(["get_issues", "get_projects", "get_users"]);
    expect(registerTool.mock.calls[0]?.[1]).toHaveProperty("inputSchema");
  });
});
