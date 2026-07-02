import { createCookieSessionStorage, redirect } from "react-router";

const SESSION_KEY = "admin_session";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET env var is required — set a random string for cookie signing");
}

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    secrets: [process.env.SESSION_SECRET],
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  },
});

export async function getAdminSession(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  return session;
}

export async function requireAdmin(request: Request) {
  const session = await getAdminSession(request);
  const authenticated = session.get(SESSION_KEY);
  if (!authenticated) {
    throw redirect("/login");
  }
  return session;
}

export async function login(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  const bcrypt = await import("bcryptjs");
  return bcrypt.compareSync(password, hash);
}

export async function createAdminSession(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set(SESSION_KEY, true);
  return commitSession(session);
}

export async function destroyAdminSession(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  return destroySession(session);
}

export { SESSION_KEY };
