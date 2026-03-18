import type { CachedAccessToken } from "./models.js";

export interface TokenCache {
  get(sessionKey: string): Promise<CachedAccessToken | null>;
  set(sessionKey: string, token: CachedAccessToken): Promise<void>;
  delete(sessionKey: string): Promise<void>;
  clear(): Promise<void>;
}
