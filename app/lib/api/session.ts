import { SESSION_TTL_SECONDS, createSessionToken, readSessionVersion, sessionClaims } from "../session";

import type { ApiContext, Env } from "./env";

// The admin's session cookie, and who may change things.

const SESSION_KEY = "__admin_session";

/** Methods that change something: only the admin's own pages may send them. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A route that needs a session, asked without one. */
export class AuthError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "AuthError";
  }
}

function sessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }
  const found = cookieHeader
    .split(";")
    .map((part) => ({ part, at: part.indexOf("=") }))
    .find(({ part, at }) => at !== -1 && part.slice(0, at).trim() === SESSION_KEY);
  return found ? found.part.slice(found.at + 1).trim() : null;
}

export async function verifySession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) {
    throw new Error("Server misconfigured: SESSION_SECRET is missing");
  }
  const value = sessionCookie(request);
  if (!value) {
    return false;
  }
  // The signature and lifetime first: a junk, forged or expired cookie then
  // costs no KV read (100,000 a day on Workers Free, which sessions need).
  const claims = await sessionClaims(value, env.SESSION_SECRET);
  if (!claims) {
    return false;
  }
  // Fails closed when the session version can't be read (KV unbound or failing):
  // a session that may have been signed out must not count.
  const version = await readSessionVersion(env.RATE_LIMIT_KV);
  return version !== null && claims.v === version;
}

export async function requireAuth(context: Pick<ApiContext, "request" | "env">): Promise<void> {
  if (!(await verifySession(context.request, context.env))) {
    throw new AuthError();
  }
}

export async function createSessionCookie(secret: string, version: string, { isSecure }: { isSecure: boolean }): Promise<string> {
  const value = await createSessionToken(secret, version);
  return `${SESSION_KEY}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(SESSION_TTL_SECONDS)}; ${isSecure ? "Secure;" : ""}`;
}

export function destroySessionCookie(): string {
  return `${SESSION_KEY}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Whether a request was sent by a page of another origin. Browsers send
// Sec-Fetch-Site with every request (older ones at least Origin with these
// methods); a request with neither isn't from a browser page (curl, tests), so
// it carries no admin's cookie by accident. SameSite=Lax already keeps the
// cookie off cross-site POSTs; this also covers same-site origins (another
// subdomain of a custom domain) and requests that need no session, such as
// signing in.
function fromAnotherOrigin(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null) {
    return site !== "same-origin";
  }
  const origin = request.headers.get("Origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

/** A change (POST, PUT, PATCH, DELETE) sent by a page of another origin. */
export function isForeignWrite(request: Request): boolean {
  return WRITE_METHODS.has(request.method) && fromAnotherOrigin(request);
}
