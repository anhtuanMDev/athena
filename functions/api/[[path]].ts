import { Octokit } from "@octokit/rest";

const SESSION_KEY = "__admin_session";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_DELAY_MS = 1000;

const attempts = new Map<string, { count: number; firstAt: number; lastAt: number }>();

function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "127.0.0.1";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = attempts.get(ip);
  if (record) {
    if (now - record.firstAt > WINDOW_MS) {
      attempts.delete(ip);
      return { allowed: true };
    }
    if (record.count >= MAX_ATTEMPTS) {
      const excess = record.count - MAX_ATTEMPTS;
      const delay = BASE_DELAY_MS * Math.pow(2, excess);
      const elapsed = now - record.lastAt;
      if (elapsed < delay) {
        return { allowed: false, retryAfter: Math.ceil((delay - elapsed) / 1000) };
      }
    }
  }
  return { allowed: true };
}

function recordAttempt(ip: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    attempts.delete(ip);
    return;
  }
  const record = attempts.get(ip);
  if (record) {
    record.count++;
    record.lastAt = now;
  } else {
    attempts.set(ip, { count: 1, firstAt: now, lastAt: now });
  }
}

function checkAdminRateLimit(request: Request): { allowed: boolean; retryAfter?: number } {
  const ip = getClientIp(request);
  return checkRateLimit(ip);
}

function recordAdminAttempt(request: Request, success: boolean): void {
  const ip = getClientIp(request);
  recordAttempt(ip, success);
}

async function hmacSign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${value}.${sigHex}`;
}

async function hmacUnsign(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const value = signed.slice(0, dot);
  const expectedSig = signed.slice(dot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigHex === expectedSig ? value : null;
}

function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_KEY) return part.slice(eq + 1).trim();
  }
  return null;
}

async function verifySession(request: Request, secret: string): Promise<boolean> {
  if (!secret) {
    throw new Error("Server misconfigured: SESSION_SECRET is missing");
  }
  const value = getSessionCookie(request);
  if (!value) return false;
  const unsigned = await hmacUnsign(value, secret);
  return unsigned === "true";
}

async function createSessionCookie(secret: string, secure: boolean): Promise<string> {
  const value = await hmacSign("true", secret);
  const maxAge = 60 * 60 * 8;
  return `${SESSION_KEY}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${secure ? "Secure;" : ""}`;
}

function destroySessionCookie(): string {
  return `${SESSION_KEY}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Safe path validation allows `data/...` and `public/assets/...`
const SAFE_FILE_PATH = /^(data\/|public\/assets\/)[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\.[a-z0-9]+$/;

function assertSafeFilePath(path: string): void {
  const decoded = decodeURIComponent(path);
  if (decoded.includes("..") || decoded.startsWith("/") || decoded.includes("\0")) {
    throw new Response(null, { status: 400 });
  }
  if (!SAFE_FILE_PATH.test(decoded)) {
    throw new Response(null, { status: 400 });
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class AuthError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "AuthError";
  }
}

function requireAuth(context: PagesFunctionContext): Promise<void> {
  return verifySession(context.request, context.env.SESSION_SECRET).then((ok) => {
    if (!ok) throw new AuthError();
  });
}

interface PagesFunctionContext {
  request: Request;
  env: Record<string, string>;
  params: Record<string, string>;
  next: () => Promise<Response>;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  try {
    if (path === "auth/login" && request.method === "POST") return await handleLogin(request, env);
    if (path === "auth/logout" && request.method === "POST") return await handleLogout(request, env);
    if (path === "auth/check" && request.method === "GET") return await handleCheck(request, env);
    if (path === "data/file" && request.method === "GET") return await handleGetFile(request, env);
    if (path === "data/file" && request.method === "POST") return await handleWriteFile(request, env);
    if (path === "data/file" && request.method === "DELETE") return await handleDeleteFile(request, env);
    if (path === "data/directory" && request.method === "GET") return await handleListDirectory(request, env);
    if (path === "data/games" && request.method === "GET") return await handleListGames(request, env);
    if (path === "data/commits" && request.method === "GET") return await handleCommits(request, env);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

async function handleLogin(request: Request, env: Record<string, string>): Promise<Response> {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = checkRateLimit(ip);
  if (!allowed) {
    return json({ error: "Too many attempts", retryAfter }, 429);
  }

  const body: { password?: string } = await request.json().catch(() => ({}));
  const password = body.password;
  if (!password) {
    return json({ error: "Password is required" }, 400);
  }

  const hash = env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const bcrypt = await import("bcryptjs");
  const valid = bcrypt.compareSync(password, hash);
  if (!valid) {
    recordAttempt(ip, false);
    return json({ error: "Invalid password" }, 401);
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    return json({ error: "Server misconfigured: SESSION_SECRET is not set" }, 500);
  }

  recordAttempt(ip, true);
  const secure = env.COOKIE_SECURE !== "false";
  const cookie = await createSessionCookie(secret, secure);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

async function handleLogout(_request: Request, _env: Record<string, string>): Promise<Response> {
  const cookie = destroySessionCookie();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

async function handleCheck(request: Request, env: Record<string, string>): Promise<Response> {
  const authenticated = await verifySession(request, env.SESSION_SECRET);
  return json({ authenticated });
}

async function handleGetFile(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) return json({ error: "path is required" }, 400);
  assertSafeFilePath(path);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if ("content" in data && "sha" in data) {
      const decoded = atob(data.content);
      return json({ sha: data.sha, content: JSON.parse(decoded) });
    }
    return json(null);
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return json(null);
    }
    throw err;
  }
}

async function handleWriteFile(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const body: { path: string; content: unknown; message?: string; sha?: string; isBase64?: boolean } = await request.json().catch(() => ({}));
  if (!body.path) return json({ error: "path is required" }, 400);
  assertSafeFilePath(body.path);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: body.path,
      message: body.message ?? (body.sha ? `Update ${body.path}` : `Add ${body.path}`),
      content: body.isBase64 ? (body.content as string) : btoa(JSON.stringify(body.content, null, 2)),
      sha: body.sha,
      branch,
    });
    return json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
      return json({ error: `Conflict on ${body.path}: file was modified since loaded.`, conflict: true }, 409);
    }
    throw err;
  }
}

async function handleDeleteFile(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const body: { path: string; sha: string; message?: string } = await request.json().catch(() => ({}));
  if (!body.path || !body.sha) return json({ error: "path and sha are required" }, 400);
  assertSafeFilePath(body.path);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: body.path,
      message: body.message ?? `Delete ${body.path}`,
      sha: body.sha,
      branch,
    });
    return json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
      return json({ error: `Conflict on ${body.path}: file was modified since loaded.`, conflict: true }, 409);
    }
    throw err;
  }
}

async function handleListDirectory(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const subpath = url.searchParams.get("subpath");
  if (!game || !subpath) return json({ error: "game and subpath are required" }, 400);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  assertSafeFilePath(`data/${game}/${subpath}/dummy.json`);

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: `data/${game}/${subpath}`,
      ref: branch,
    });
    if (Array.isArray(data)) {
      const files = data.filter((entry) => entry.type === "file" && entry.name.endsWith(".json"));
      const includeContent = url.searchParams.get("includeContent") === "true";

      if (!includeContent) {
        return json(files.map((entry) => entry.name.replace(".json", "")));
      }

      // Fetch the parsed JSON content for all files in parallel, but chunked to respect CF limits (max 50 concurrent) and GitHub limits
      const items = [];
      const CHUNK_SIZE = 10;
      
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map(async (entry) => {
            try {
              const fileReq = await octokit.repos.getContent({ owner, repo, path: entry.path, ref: branch });
              const fileData = fileReq.data;
              if (!Array.isArray(fileData) && fileData.type === "file" && "content" in fileData) {
                const decoded = atob(fileData.content);
                return JSON.parse(decoded);
              }
            } catch (e) {
              console.error(`Failed to fetch content for ${entry.path}`, e);
            }
            return null;
          })
        );
        items.push(...chunkResults);
      }
      
      return json(items.filter(Boolean));
    }
    return json([]);
  } catch {
    return json([]);
  }
}

async function handleListGames(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "data/_meta/games.json", ref: branch });
    if ("content" in data && "sha" in data) {
      const decoded = atob(data.content);
      const parsed = JSON.parse(decoded);
      return json(parsed.games ?? []);
    }
    return json([]);
  } catch {
    console.error("listGames: data/_meta/games.json not found — check GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH env vars");
    return json([]);
  }
}

async function handleCommits(request: Request, env: Record<string, string>): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER ?? "YOUR_ORG";
  const repo = env.GITHUB_REPO ?? "YOUR_REPO";

  if (!token) {
    return json({ commits: [], error: "GITHUB_TOKEN not configured" });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "athena-admin" } }
    );
    if (!response.ok) {
      if (response.status === 409) return json({ commits: [], error: null });
      return json({ commits: [], error: `GitHub API returned ${response.status}` });
    }
    const raw = await response.json();
    const commits = Array.isArray(raw)
      ? raw.map((c: { sha: string; commit: { message: string; committer: { date: string } }; html_url: string }) => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.committer.date,
          url: c.html_url,
        }))
      : [];
    return json({ commits, error: null });
  } catch (err) {
    return json({ commits: [], error: err instanceof Error ? err.message : "Unknown error" });
  }
}
