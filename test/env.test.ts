import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { ConfigError } from "../src/utils/errors.js";

const baseEnv = {
  APS_CLIENT_ID: "client-id",
  APS_CLIENT_SECRET: "client-secret",
  APS_CALLBACK_URL: "http://localhost:3000/auth/callback",
  APS_SCOPES: "data:read account:read data:read",
  APS_ACCOUNT_ID: "b.account-123"
};

describe("loadEnv", () => {
  it("parses scopes and default values", () => {
    const config = loadEnv(baseEnv);

    expect(config.apsClientId).toBe("client-id");
    expect(config.apsScopes).toEqual(["data:read", "account:read"]);
    expect(config.port).toBe(3000);
    expect(config.transport).toBe("http");
    expect(config.apsCallbackUrl).toBe("http://localhost:3000/auth/callback");
  });

  it("throws on missing required values", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        APS_CLIENT_SECRET: ""
      })
    ).toThrow(ConfigError);
  });

  it("validates callback URLs", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        APS_CALLBACK_URL: "not-a-url"
      })
    ).toThrow(ConfigError);
  });
});
