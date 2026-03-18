import type { OAuthStateRecord } from "./models.js";

export interface OAuthStateStore {
  get(state: string): Promise<OAuthStateRecord | null>;
  set(record: OAuthStateRecord): Promise<void>;
  take(state: string): Promise<OAuthStateRecord | null>;
  clear(): Promise<void>;
}
