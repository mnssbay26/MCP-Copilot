import crypto from "node:crypto";

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomVerifier(bytes = 32): string {
  return toBase64Url(crypto.randomBytes(bytes));
}

function createChallenge(verifier: string): string {
  return toBase64Url(crypto.createHash("sha256").update(verifier).digest());
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomVerifier();
  return {
    verifier,
    challenge: createChallenge(verifier)
  };
}
