import type { OAuthStateStore } from "./oauthStateStore.js";
import type { OAuthStateRecord } from "./models.js";

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly cache = new Map<string, OAuthStateRecord>();

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [state, record] of this.cache.entries()) {
      if (record.expiresAt <= now) {
        this.cache.delete(state);
      }
    }
  }

  async get(state: string): Promise<OAuthStateRecord | null> {
    this.cleanupExpired();
    return this.cache.get(state) ?? null;
  }

  async set(record: OAuthStateRecord): Promise<void> {
    this.cleanupExpired();
    this.cache.set(record.state, record);
  }

  async take(state: string): Promise<OAuthStateRecord | null> {
    this.cleanupExpired();
    const record = this.cache.get(state) ?? null;
    if (record) {
      this.cache.delete(state);
    }
    return record;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

// TODO: Replace this in-memory state store with Redis/DynamoDB for ECS callback safety.
export const defaultOAuthStateStore = new MemoryOAuthStateStore();
