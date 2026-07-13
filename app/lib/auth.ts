import { redirect } from "react-router";

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json() as { error?: string; retryAfter?: number };
  if (!res.ok) {
    const err = new Error(data.error ?? "Login failed");
    (err as Error & { retryAfter?: number }).retryAfter = data.retryAfter;
    throw err;
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("has_session", "true");
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  if (typeof window !== "undefined") {
    localStorage.removeItem("has_session");
  }
}

export async function checkSession(): Promise<boolean> {
  const res = await fetch("/api/auth/check");
  const data: { authenticated: boolean } = await res.json();
  if (!data.authenticated && typeof window !== "undefined") {
    if (localStorage.getItem("has_session") === "true") {
      window.dispatchEvent(new CustomEvent("AUTH_EXPIRED"));
    }
  }
  return data.authenticated;
}

export async function requireAdmin(): Promise<void> {
  const ok = await checkSession();
  if (!ok) throw redirect("/login");
}
