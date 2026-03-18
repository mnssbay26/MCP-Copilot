import type { CachedAccessToken } from "./models.js";
import type { TokenCache } from "./tokenCache.js";

export class MemoryTokenCache implements TokenCache {
  private readonly cache = new Map<string, CachedAccessToken>();

  async get(sessionKey: string): Promise<CachedAccessToken | null> {
    return this.cache.get(sessionKey) ?? null;
  }

  async set(sessionKey: string, token: CachedAccessToken): Promise<void> {
    this.cache.set(sessionKey, token);
  }

  async delete(sessionKey: string): Promise<void> {
    this.cache.delete(sessionKey);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

// TODO: Replace this in-memory cache with a shared backend for ECS production.
export const defaultTokenCache = new MemoryTokenCache();
