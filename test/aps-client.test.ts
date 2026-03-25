import { afterEach, describe, expect, it, vi } from "vitest";
import { requestApsJson } from "../src/shared/aps/client.js";
import { defaultTokenCache, resetAuthForTests } from "../src/shared/auth/apsAuth.js";
import { ApsHttpError } from "../src/shared/utils/errors.js";

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await resetAuthForTests();
});

describe("requestApsJson", () => {
  it("injects bearer headers and parses JSON responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const response = await requestApsJson<{ ok: boolean }>("https://example.test/resource", {
      token: "access-token",
      fetchImpl,
      serviceName: "test"
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init?.headers as Record<string, string>;

    expect(response).toEqual({ ok: true });
    expect(headers.Authorization).toBe("Bearer access-token");
    expect(headers["x-correlation-id"]).toBeTruthy();
  });

  it("retries retryable responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const response = await requestApsJson<{ ok: boolean }>("https://example.test/retry", {
      token: "access-token",
      fetchImpl,
      retries: 1,
      baseDelayMs: 1,
      serviceName: "test"
    });

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws a typed error for non-retryable failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("bad request", {
        status: 400
      })
    );

    await expect(
      requestApsJson("https://example.test/error", {
        token: "access-token",
        fetchImpl,
        retries: 0,
        serviceName: "test"
      })
    ).rejects.toBeInstanceOf(ApsHttpError);
  });

  it("aborts slow requests on timeout", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("request aborted")),
          { once: true }
        );
      });
    });

    const requestPromise = requestApsJson("https://example.test/timeout", {
      token: "access-token",
      fetchImpl: fetchImpl as typeof fetch,
      retries: 0,
      timeoutMs: 1_000,
      serviceName: "test"
    });

    const expectation = expect(requestPromise).rejects.toBeInstanceOf(ApsHttpError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });

  it("uses the session-specific Autodesk token when sessionKey is provided", async () => {
    await defaultTokenCache.set("session-a", {
      accessToken: "session-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      scope: ["data:read"],
      obtainedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    });

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await requestApsJson("https://example.test/session", {
      sessionKey: "session-a",
      fetchImpl,
      serviceName: "test"
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init?.headers as Record<string, string>;

    expect(headers.Authorization).toBe("Bearer session-token");
  });
});
