import { checkLoginAttempts, recordLoginAttempt } from "../login-attempts";
import { PasswordConfigError, verifyAdminPassword } from "../password";
import { readSessionVersion, revokeSessions } from "../session";

import { edgeCache, type ApiContext, type Env } from "./env";
import { SMALL_BODY_LIMIT, STATUS, fieldsOf, json, readJsonBody } from "./http";
import { createSessionCookie, destroySessionCookie, verifySession } from "./session";

import type { KVNamespace } from "@cloudflare/workers-types";

// Signing in and out (POST /api/auth/login, /api/auth/logout), and whether a session is on (GET /api/auth/check).

const MISCONFIGURED = "Server misconfigured";
const LOCAL_IP = "127.0.0.1";
const JSON_HEADERS = { "Content-Type": "application/json" };

/** Who's signing in: their address, and the cache this data center counts failed attempts in. */
interface Attempt {
  cache: Cache;
  ip: string;
}

function clientIp(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) {
    return ip;
  }
  return LOCAL_IP;
}

/** Whether the password is the admin's; an answer when it can't be checked (a setup problem, not a wrong password: not counted). */
async function passwordCheck(password: string, hash: string | undefined): Promise<boolean | Response> {
  if (!hash) {
    return json({ error: MISCONFIGURED }, STATUS.serverError);
  }
  // A PBKDF2 verifier (app/lib/password.ts); a bcrypt hash is no longer accepted.
  try {
    return await verifyAdminPassword(password, hash);
  } catch (error) {
    if (!(error instanceof PasswordConfigError)) {
      throw error;
    }
    console.error(error.message);
    return json({ error: MISCONFIGURED }, STATUS.serverError);
  }
}

/** A session's cookie, once the password checked out. */
async function signIn(env: Env, kv: KVNamespace, attempt: Attempt): Promise<Response> {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    return json({ error: "Server misconfigured: SESSION_SECRET is not set" }, STATUS.serverError);
  }
  const version = await readSessionVersion(kv);
  if (version === null) {
    return json({ error: "Sessions are unavailable: RATE_LIMIT_KV can't be read." }, STATUS.unavailable);
  }
  await recordLoginAttempt(attempt.cache, attempt.ip, true);
  const cookie = await createSessionCookie(secret, version, { isSecure: env.COOKIE_SECURE !== "false" });
  return new Response(JSON.stringify({ ok: true }), { status: STATUS.ok, headers: { ...JSON_HEADERS, "Set-Cookie": cookie } });
}

async function checkedSignIn(env: Env, kv: KVNamespace, { attempt, password }: { attempt: Attempt; password: string }): Promise<Response> {
  const isValid = await passwordCheck(password, env.ADMIN_PASSWORD_HASH);
  if (isValid instanceof Response) {
    return isValid;
  }
  if (!isValid) {
    await recordLoginAttempt(attempt.cache, attempt.ip, false);
    return json({ error: "Invalid password" }, STATUS.unauthorized);
  }
  return signIn(env, kv, attempt);
}

export async function handleLogin({ request, env }: ApiContext): Promise<Response> {
  const attempt: Pick<Attempt, "ip"> = { ip: clientIp(request) };
  const kv = env.RATE_LIMIT_KV;
  // Sessions need KV (their version lives there), so without it nobody signs in.
  if (!kv) {
    console.error("CRITICAL: RATE_LIMIT_KV is not bound. Signing in is refused.");
    return json({ error: "Sessions are unavailable: RATE_LIMIT_KV isn't bound." }, STATUS.unavailable);
  }
  // Failed attempts are counted in this data center's cache (see
  // app/lib/login-attempts.ts). Concurrent requests from one IP can race past
  // this check before the count is stored, allowing a few more in a burst.
  const counted: Attempt = { ...attempt, cache: edgeCache() };
  const { allowed: isAllowed, retryAfter } = await checkLoginAttempts(counted.cache, counted.ip);
  if (!isAllowed) {
    return json({ error: "Too many attempts", retryAfter }, STATUS.tooManyRequests);
  }
  const { password } = fieldsOf(await readJsonBody(request, SMALL_BODY_LIMIT));
  if (typeof password !== "string" || !password) {
    return json({ error: "Password is required" }, STATUS.badRequest);
  }
  return checkedSignIn(env, kv, { attempt: counted, password });
}

/** Whether the request has a session; without a session secret, nobody is signed in. */
async function hasSession(request: Request, env: Env): Promise<boolean> {
  try {
    return await verifySession(request, env);
  } catch {
    // The only failure is a missing SESSION_SECRET: then no session counts, and this browser is signed out anyway.
  }
  return false;
}

/** Signed out here, but the other sessions are still on: a warning that says what to do; the error in the log. */
function revocationWarning(error: unknown, headers: Record<string, string>): Response {
  console.error("Session revocation failed:", error);
  const warning = "Signed out here, but other sessions couldn't be ended. Sign in and sign out again later to end them.";
  return new Response(JSON.stringify({ ok: true, warning }), { status: STATUS.ok, headers });
}

// Signing out ends every admin session (see app/lib/session.ts), but only for
// a request that has one, so a cross-site or anonymous POST can't sign anyone out.
// This browser is always signed out (a shared computer must be): ending the
// others needs a KV write, which can fail (1,000 a day on Workers Free), and a
// retry would then find no cookie and end nothing. So a failure is a warning
// that says what to do, not an error that asks for a retry.
export async function handleLogout({ request, env }: ApiContext): Promise<Response> {
  const headers = { ...JSON_HEADERS, "Set-Cookie": destroySessionCookie() };
  const kv = env.RATE_LIMIT_KV;
  if (kv && (await hasSession(request, env))) {
    try {
      await revokeSessions(kv);
    } catch (error) {
      return revocationWarning(error, headers);
    }
  }
  return new Response(JSON.stringify({ ok: true }), { status: STATUS.ok, headers });
}

export async function handleCheck({ request, env }: ApiContext): Promise<Response> {
  const isAuthenticated = await verifySession(request, env);
  return json({ authenticated: isAuthenticated });
}
