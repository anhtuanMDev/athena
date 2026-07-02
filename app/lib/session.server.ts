import { createCookieSessionStorage, redirect, type SessionStorage } from "react-router";
import { getEnv, requireEnv } from "~/lib/env.server";

const SESSION_KEY = "admin_session";

let _storage: SessionStorage | null = null;

function getStorage(): SessionStorage {
  if (!_storage) {
    _storage = createCookieSessionStorage({
      cookie: {
        name: "__admin_session",
        secrets: [requireEnv("SESSION_SECRET")],
        sameSite: "lax",
        path: "/",
        httpOnly: true,
        secure: getEnv("COOKIE_SECURE") !== "false",
        maxAge: 60 * 60 * 8,
      },
    });
  }
  return _storage;
}

export async function getAdminSession(request: Request) {
  const session = await getStorage().getSession(request.headers.get("Cookie"));
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
  const hash = getEnv("ADMIN_PASSWORD_HASH");
  if (!hash) return false;
  const bcrypt = await import("bcryptjs");
  return bcrypt.compareSync(password, hash);
}

export async function createAdminSession(request: Request) {
  const storage = getStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set(SESSION_KEY, true);
  return storage.commitSession(session);
}

export async function destroyAdminSession(request: Request) {
  const storage = getStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  return storage.destroySession(session);
}

export { SESSION_KEY };
