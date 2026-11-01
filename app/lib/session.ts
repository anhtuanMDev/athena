// Admin sessions. The session cookie carries a signed claim: when it was
// issued, when it expires, and the session version it was issued under. The
// version lives in KV (RATE_LIMIT_KV); signing out replaces it, which ends
// every session at once. The admin has a single shared password, so there is
// no one else's session to keep. KV changes can take up to a minute to reach
// every Cloudflare location.

/** How long a session lasts after signing in, matching the cookie's Max-Age. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
/** Tolerance for clocks that disagree about when a session was issued. */
const CLOCK_SKEW_MS = 60_000;
export const SESSION_VERSION_KEY = "session:version";

interface SessionClaims {
  iat: number;
  exp: number;
  v: string;
}

interface VersionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** A session token for the current session version, valid for SESSION_TTL_SECONDS from `now`. */
export async function createSessionToken(secret: string, version: string, now = Date.now()): Promise<string> {
  const claims: SessionClaims = { iat: now, exp: now + SESSION_TTL_SECONDS * 1000, v: version };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Whether `token` was signed with `secret`, hasn't expired, and was issued under the current session `version`. */
export async function verifySessionToken(token: string, secret: string, version: string, now = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts.map(fromBase64Url);
  if (!payload || !signature) return false;
  // subtle.verify compares in constant time.
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signature, encoder.encode(parts[0])))) return false;
  let claims: Partial<SessionClaims>;
  try {
    claims = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return false;
  }
  return (
    typeof claims.iat === "number" &&
    typeof claims.exp === "number" &&
    claims.iat <= now + CLOCK_SKEW_MS &&
    now < claims.exp &&
    claims.exp - claims.iat <= SESSION_TTL_SECONDS * 1000 &&
    claims.v === version
  );
}

/**
 * The current session version, or null when it can't be read. Callers fail
 * closed on null: without the version a session can't be checked against
 * sign-outs, and signing in already needs KV for its rate limit.
 */
export async function readSessionVersion(kv: VersionStore | undefined): Promise<string | null> {
  if (!kv) return null;
  try {
    return (await kv.get(SESSION_VERSION_KEY)) ?? "0";
  } catch (err) {
    console.error("Session version read failed:", err);
    return null;
  }
}

/** Ends every admin session by moving to a new session version. */
export async function revokeSessions(kv: VersionStore): Promise<void> {
  await kv.put(SESSION_VERSION_KEY, crypto.randomUUID());
}
