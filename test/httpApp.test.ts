import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createCombinedMcpServer, createRootHttpApp } from "../src/index.js";
import { resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { createHttpApp } from "../src/shared/bootstrap/httpApp.js";
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
  resetConfigForTests();
  await resetAuthForTests();
});

describe("createHttpApp", () => {
  it("serves health and auth endpoints", async () => {
    const app = createHttpApp({
      createServer: createCombinedMcpServer
    });

    const healthResponse = await request(app).get("/health");
    const authUrlResponse = await request(app).get("/auth/url");
    const authStatusResponse = await request(app).get("/auth/status");
    const callbackResponse = await request(app).get("/auth/callback");

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual({ ok: true });
    expect(authUrlResponse.status).toBe(200);
    expect(authUrlResponse.body.authorizationUrl).toContain("developer.api.autodesk.com");
    expect(authStatusResponse.status).toBe(200);
    expect(authStatusResponse.body.loggedIn).toBe(false);
    expect(callbackResponse.status).toBe(400);
  });

  it("mounts the mcp endpoint", async () => {
    const app = createHttpApp({
      createServer: createCombinedMcpServer
    });
    const response = await request(app).post("/mcp").send({});

    expect(response.status).not.toBe(404);
  });

  it("exposes the smoke validation route through the root app", async () => {
    const app = createRootHttpApp();
    const response = await request(app).get("/internal/smoke/projects");

    expect(response.status).toBe(401);
    expect(response.body.error).toContain("No Autodesk token is cached");
  });
});
