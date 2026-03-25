import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApsAuthTools } from "../src/mcp-auth/tools.js";
import { resetAuthForTests } from "../src/shared/auth/apsAuth.js";
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
  resetConfigForTests();
  await resetAuthForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetConfigForTests();
  await resetAuthForTests();
});

describe("auth tools", () => {
  it("returns the backend auth-start URL without exposing the raw Autodesk authorization URL", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };

    registerApsAuthTools(server as never);
    const authTool = registerTool.mock.calls.find((call) => call[0] === "get_autodesk_auth_url");
    const handler = authTool?.[2] as ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

    expect(handler).toBeDefined();
    const response = (await handler?.({ sessionKey: "session-a" })) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };

    expect(String(response.structuredContent.authStartUrl)).toContain("/auth/start");
    expect(response.structuredContent).not.toHaveProperty("rawAuthorizationUrl");
    expect(response.content[0]?.text).toContain("/auth/start");
    expect(response.content[0]?.text).not.toContain("response_type=code");
  });
});
