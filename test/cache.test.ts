import { describe, expect, it, vi } from "vitest";
import { MemoryOAuthStateStore } from "../src/auth/memoryOAuthStateStore.js";
import { MemoryTokenCache } from "../src/auth/memoryTokenCache.js";

describe("memory caches", () => {
  it("stores and deletes tokens", async () => {
    const cache = new MemoryTokenCache();

    await cache.set("default", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: ["data:read"],
      obtainedAt: 100,
      expiresAt: 1_000
    });

    expect(await cache.get("default")).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });

    await cache.delete("default");
    expect(await cache.get("default")).toBeNull();
  });

  it("expires oauth state records", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const store = new MemoryOAuthStateStore();
    await store.set({
      state: "state-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:3000/auth/callback",
      scopes: ["data:read"],
      sessionKey: "default",
      createdAt: Date.now(),
      expiresAt: Date.now() + 1_000
    });

    expect(await store.get("state-1")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1_001);
    expect(await store.get("state-1")).toBeNull();

    vi.useRealTimers();
  });
});
