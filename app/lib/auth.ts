import { redirect } from "react-router";

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error((data as Record<string, unknown>).error as string ?? "Login failed");
    (err as Record<string, unknown>).retryAfter = (data as Record<string, unknown>).retryAfter;
    throw err;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function checkSession(): Promise<boolean> {
  const res = await fetch("/api/auth/check");
  const data: { authenticated: boolean } = await res.json();
  return data.authenticated;
}

export async function requireAdmin(): Promise<void> {
  const ok = await checkSession();
  if (!ok) throw redirect("/login");
}
