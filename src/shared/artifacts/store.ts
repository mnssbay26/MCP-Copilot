import { randomUUID } from "node:crypto";

const DEFAULT_ARTIFACT_TTL_MS = 15 * 60 * 1000;

export interface StoredArtifact {
  artifactId: string;
  fileName: string;
  contentType: string;
  content: Buffer;
  createdAt: number;
  expiresAt: number;
}

function pruneExpiredArtifacts(store: Map<string, StoredArtifact>): void {
  const now = Date.now();

  for (const [artifactId, artifact] of store.entries()) {
    if (artifact.expiresAt <= now) {
      store.delete(artifactId);
    }
  }
}

const artifacts = new Map<string, StoredArtifact>();

export function saveArtifact(input: {
  fileName: string;
  contentType: string;
  content: string | Buffer;
  ttlMs?: number;
}): {
  artifactId: string;
  downloadPath: string;
  expiresAt: string;
} {
  pruneExpiredArtifacts(artifacts);

  const createdAt = Date.now();
  const ttlMs = Math.max(1_000, Math.trunc(input.ttlMs ?? DEFAULT_ARTIFACT_TTL_MS));
  const expiresAt = createdAt + ttlMs;
  const artifactId = randomUUID();

  artifacts.set(artifactId, {
    artifactId,
    fileName: input.fileName,
    contentType: input.contentType,
    content: Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8"),
    createdAt,
    expiresAt
  });

  return {
    artifactId,
    downloadPath: `/artifacts/${artifactId}`,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

export function getArtifact(artifactId: string): StoredArtifact | null {
  pruneExpiredArtifacts(artifacts);
  return artifacts.get(artifactId) ?? null;
}

export function clearArtifactsForTests(): void {
  artifacts.clear();
}
