/**
 * HMAC-SHA256 signing for the Worker ↔ Next.js bridge. Both sides sign
 * every request body with the same shared secret; constant-time hex
 * compare on receive. Cloudflare-Workers-safe (uses Web Crypto only).
 */

export const SIGNATURE_HEADER = "x-worker-signature";

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signBody(secret: string, body: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyBody(
  secret: string,
  body: string,
  hexSig: string,
): Promise<boolean> {
  if (hexSig.length !== 64) return false;
  const expected = await signBody(secret, body);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hexSig.charCodeAt(i);
  }
  return diff === 0;
}
