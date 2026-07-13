import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";

const SESSION_KEY = "__admin_session";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_DELAY_MS = 1000;

interface RateLimitRecord {
  count: number;
  firstAt: number;
  lastAt: number;
}

export interface Env {
  RATE_LIMIT_KV?: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET: string;
  COOKIE_SECURE?: string;
  WORKER_PURGE_URL?: string;
  WORKER_PURGE_SECRET?: string;
}

async function checkRateLimit(
  ip: string,
  env: Env,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) {
    console.error(
      "CRITICAL: RATE_LIMIT_KV is not bound. Failing closed to prevent brute force.",
    );
    return { allowed: false, retryAfter: 3600 };
  }
  const now = Date.now();
  const raw = await kv.get(`rate_limit:${ip}`);
  if (!raw) return { allowed: true };

  const record: RateLimitRecord = JSON.parse(raw);
  if (now - record.lastAt > WINDOW_MS) return { allowed: true };

  if (record.count >= MAX_ATTEMPTS) {
    const excess = record.count - MAX_ATTEMPTS;
    const delay = BASE_DELAY_MS * Math.pow(2, excess);
    const elapsed = now - record.lastAt;
    if (elapsed < delay) {
      return {
        allowed: false,
        retryAfter: Math.ceil((delay - elapsed) / 1000),
      };
    }
  }
  return { allowed: true };
}

async function recordAttempt(
  ip: string,
  success: boolean,
  env: Env,
): Promise<void> {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) {
    console.warn("RATE_LIMIT_KV is not bound");
    return;
  }
  const now = Date.now();

  if (success) {
    await kv.delete(`rate_limit:${ip}`);
    return;
  }

  const raw = await kv.get(`rate_limit:${ip}`);
  let record: RateLimitRecord;
  if (raw) {
    const existing: RateLimitRecord = JSON.parse(raw);
    const expired = now - existing.lastAt > WINDOW_MS;
    record = expired
      ? { count: 1, firstAt: now, lastAt: now }
      : { ...existing, count: existing.count + 1, lastAt: now };
  } else {
    record = { count: 1, firstAt: now, lastAt: now };
  }

  await kv.put(`rate_limit:${ip}`, JSON.stringify(record), {
    expirationTtl: 900,
  });
}

async function hmacSign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${value}.${sigHex}`;
}

async function hmacUnsign(
  signed: string,
  secret: string,
): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const value = signed.slice(0, dot);
  const expectedSig = signed.slice(dot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (sigHex.length !== expectedSig.length) return null;
  let result = 0;
  for (let i = 0; i < sigHex.length; i++) {
    result |= sigHex.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return result === 0 ? value : null;
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

async function verifySession(
  request: Request,
  secret: string,
): Promise<boolean> {
  if (!secret) {
    throw new Error("Server misconfigured: SESSION_SECRET is missing");
  }
  const value = getSessionCookie(request);
  if (!value) return false;
  const unsigned = await hmacUnsign(value, secret);
  return unsigned === "true";
}

async function createSessionCookie(
  secret: string,
  secure: boolean,
): Promise<string> {
  const value = await hmacSign("true", secret);
  const maxAge = 60 * 60 * 8;
  return `${SESSION_KEY}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${secure ? "Secure;" : ""}`;
}

function destroySessionCookie(): string {
  return `${SESSION_KEY}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Safe path validation allows `data/...` and `public/assets/...`
const SAFE_FILE_PATH =
  /^(data\/|public\/assets\/)[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.[A-Za-z0-9]+$/;

function assertSafeFilePath(path: string): void {
  const decoded = decodeURIComponent(path);
  if (
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("\0")
  ) {
    throw new Response(null, { status: 400 });
  }
  if (!SAFE_FILE_PATH.test(decoded)) {
    throw new Response(null, { status: 400 });
  }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

class AuthError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "AuthError";
  }
}

function requireAuth(context: PagesFunctionContext): Promise<void> {
  return verifySession(context.request, context.env.SESSION_SECRET).then(
    (ok) => {
      if (!ok) throw new AuthError();
    },
  );
}

interface PagesFunctionContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  next: () => Promise<Response>;
  waitUntil?: (promise: Promise<any>) => void;
}

function triggerCachePurge(context: PagesFunctionContext, path: string) {
  const cache = caches.default;
  const url = new URL(context.request.url);

  const urlsToPurge: string[] = [];
  
  // Use a constant origin to bypass any Vite proxy Host header discrepancies
  const internalOrigin = "https://api.internal";

  if (path.startsWith("public/assets/")) {
    const assetPath = path.slice("public/assets/".length);
    const encodedAssetPath = assetPath.split('/').map(encodeURIComponent).join('/');
    urlsToPurge.push(`${internalOrigin}/api/assets/${encodedAssetPath}`);
  }

  urlsToPurge.push(`${internalOrigin}/api/data/file?path=${encodeURIComponent(path)}`);

  // Invalidate mobile cache when global data changes
  if (path === "data/_meta/games.json" || path.includes("/schemas/") || path.includes("/enums/")) {
    urlsToPurge.push(`${internalOrigin}/mobile/init_v2`);
  }

  const promise = Promise.all(
    urlsToPurge.map(u => cache.delete(u))
  ).catch(err => console.error("Cache purge failed:", err));

  if (context.waitUntil) {
    context.waitUntil(promise);
  }
}

export async function onRequest(
  context: PagesFunctionContext,
): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  try {
    if (path === "auth/login" && request.method === "POST")
      return await handleLogin(request, env);
    if (path === "auth/logout" && request.method === "POST")
      return await handleLogout(request, env);
    if (path === "auth/check" && request.method === "GET")
      return await handleCheck(request, env);
    if (path === "data/file" && request.method === "GET")
      return await handleGetFile(context);
    if (path === "data/file" && request.method === "POST")
      return await handleWriteFile(context);
    if (path === "data/file" && request.method === "DELETE")
      return await handleDeleteFile(context);
    if (path === "data/directory" && request.method === "GET")
      return await handleListDirectory(context);
    if (path === "data/games" && request.method === "GET")
      return await handleListGames(request, env);
    if (path === "data/dashboard" && request.method === "GET")
      return await handleDashboardData(context);
    if (path === "data/commits" && request.method === "GET")
      return await handleCommits(context);
    if (path.startsWith("assets/") && request.method === "GET")
      return await handleGetAsset(context);
      
    const enumMatch = path.match(/^([^\/]+)\/enums\/([^\/]+)$/);
    if (enumMatch && request.method === "GET") {
      return await handleGetEnum(context, enumMatch[1], enumMatch[2]);
    }
    
    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof Response) return err;
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "127.0.0.1";
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const ip = getClientIp(request);

  // Note: There is a known TOCTOU (Time-of-Check to Time-of-Use) gap here.
  // Concurrent requests from the same IP can race past this check before
  // recordAttempt persists, allowing more than MAX_ATTEMPTS in a burst.
  // This is an accepted risk given the latency of Cloudflare KV.
  const { allowed, retryAfter } = await checkRateLimit(ip, env);
  if (!allowed) {
    return json({ error: "Too many attempts", retryAfter }, 429);
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
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
    await recordAttempt(ip, false, env);
    return json({ error: "Invalid password" }, 401);
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    return json(
      { error: "Server misconfigured: SESSION_SECRET is not set" },
      500,
    );
  }

  await recordAttempt(ip, true, env);
  const secure = env.COOKIE_SECURE !== "false";
  const cookie = await createSessionCookie(secret, secure);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

async function handleLogout(_request: Request, _env: Env): Promise<Response> {
  const cookie = destroySessionCookie();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

async function handleCheck(request: Request, env: Env): Promise<Response> {
  const authenticated = await verifySession(request, env.SESSION_SECRET);
  return json({ authenticated });
}

async function handleGetFile(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) return json({ error: "path is required" }, 400);

  assertSafeFilePath(path);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
      headers: {
        "If-None-Match": "",
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      let content: unknown = data.content;
      if (path.endsWith(".json")) {
        content = JSON.parse(atob(data.content));
      }
      const payload = { sha: data.sha, content };
      return json(payload, 200, {
        "Cache-Control": "no-store",
      });
    }
    return json(null);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "status" in err &&
      (err as { status: number }).status === 404
    ) {
      return json(null);
    }
    throw err;
  }
}

async function handleWriteFile(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);
  const body = (await request.json().catch(() => ({}))) as {
    path: string;
    content: unknown;
    message?: string;
    sha?: string;
    isBase64?: boolean;
  };
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
      message:
        body.message ?? (body.sha ? `Update ${body.path}` : `Add ${body.path}`),
      content: body.isBase64
        ? (body.content as string)
        : btoa(JSON.stringify(body.content, null, 2)),
      sha: body.sha,
      branch,
    });
    triggerCachePurge(context, body.path);
    return json({ ok: true });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "status" in err &&
      ((err as { status: number }).status === 409 ||
        (err as { status: number }).status === 422)
    ) {
      return json(
        {
          error: `Conflict on ${body.path}: file already exists or was modified.`,
          conflict: true,
        },
        409,
      );
    }
    throw err;
  }
}

async function handleDeleteFile(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);
  const body = (await request
    .json()
    .catch(() => ({}))) as { path: string; sha: string; message?: string };
  if (!body.path || !body.sha)
    return json({ error: "path and sha are required" }, 400);
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
    triggerCachePurge(context, body.path);
    return json({ ok: true });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "status" in err &&
      (err as { status: number }).status === 409
    ) {
      return json(
        {
          error: `Conflict on ${body.path}: file was modified since loaded.`,
          conflict: true,
        },
        409,
      );
    }
    throw err;
  }
}

async function handleListDirectory(
  context: PagesFunctionContext,
): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);

  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const subpath = url.searchParams.get("subpath");
  if (!game || !subpath)
    return json({ error: "game and subpath are required" }, 400);

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
      headers: {
        "If-None-Match": "",
        "Cache-Control": "no-cache",
      },
    });
    if (Array.isArray(data)) {
      const files = data.filter(
        (entry) => entry.type === "file" && entry.name.endsWith(".json"),
      );
      const includeContent = url.searchParams.get("includeContent") === "true";
      const keysOnlyStr = url.searchParams.get("keysOnly");
      const keysOnly = keysOnlyStr ? keysOnlyStr.split(",") : null;

      if (!includeContent) {
        const payload = files.map((entry) => entry.name.replace(".json", ""));
        return json(payload, 200, {
          "Cache-Control": "no-store",
        });
      }

      // Fetch the parsed JSON content for all files in parallel, but chunked to respect CF limits (max 50 concurrent) and GitHub limits
      const items = [];
      const CHUNK_SIZE = 10;

      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map(async (entry) => {
            try {
              const fileReq = await octokit.repos.getContent({
                owner,
                repo,
                path: entry.path,
                ref: branch,
                headers: {
                  "If-None-Match": "",
                  "Cache-Control": "no-cache",
                },
              });
              const fileData = fileReq.data;
              if (
                !Array.isArray(fileData) &&
                fileData.type === "file" &&
                "content" in fileData
              ) {
                const decoded = atob(fileData.content);
                const parsed = JSON.parse(decoded);
                if (keysOnly) {
                  const filtered: Record<string, unknown> = {};
                  for (const key of keysOnly) {
                    if (parsed[key] !== undefined) filtered[key] = parsed[key];
                  }
                  return filtered;
                }
                return parsed;
              }
            } catch (e) {
              console.error(`Failed to fetch content for ${entry.path}`, e);
            }
            return null;
          }),
        );
        items.push(...chunkResults);
      }

      const payload = items.filter(Boolean);
      return json(payload, 200, {
        "Cache-Control": "no-store",
      });
    }
    return json([]);
  } catch {
    return json([]);
  }
}

async function handleListGames(request: Request, env: Env): Promise<Response> {
  await requireAuth({ request, env } as PagesFunctionContext);
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "data/_meta/games.json",
      ref: branch,
      headers: {
        "If-None-Match": "",
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      const decoded = atob(data.content);
      const parsed = JSON.parse(decoded);
      return json(parsed.games ?? []);
    }
    return json([]);
  } catch {
    console.error(
      "listGames: data/_meta/games.json not found - check GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH env vars",
    );
    return json([]);
  }
}

async function handleDashboardData(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "data/_meta/games.json",
      ref: branch,
      headers: {
        "If-None-Match": "",
        "Cache-Control": "no-cache",
      },
    });
    let games = [];
    if ("content" in data && "sha" in data) {
      games = JSON.parse(atob(data.content)).games ?? [];
    }

    const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
    const treeSha = branchData.commit.commit.tree.sha;
    
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
    });

    const gameStats = games.map((game: any) => {
      if (!game.active) return { ...game, heroCount: 0, patchCount: 0 };
      const heroPrefix = `data/${game.slug}/heroes/`;
      const patchPrefix = `data/${game.slug}/patches/`;
      
      const heroCount = treeData.tree.filter((t) => t.type === "blob" && t.path?.startsWith(heroPrefix) && t.path?.endsWith(".json")).length;
      const patchCount = treeData.tree.filter((t) => t.type === "blob" && t.path?.startsWith(patchPrefix) && t.path?.endsWith(".json")).length;

      return { ...game, heroCount, patchCount };
    });

    return json({ games: gameStats }, 200, {
      "Cache-Control": "no-store",
    });
  } catch (err) {
    console.error("handleDashboardData error:", err);
    return json({ games: [] });
  }
}

async function handleCommits(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);

  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER ?? "YOUR_ORG";
  const repo = env.GITHUB_REPO ?? "YOUR_REPO";

  if (!token) {
    return json({ commits: [], error: "GITHUB_TOKEN not configured" });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "athena-admin",
        },
      },
    );
    if (!response.ok) {
      if (response.status === 409) return json({ commits: [], error: null });
      return json({
        commits: [],
        error: `GitHub API returned ${response.status}`,
      });
    }
    const raw = await response.json();
    const commits = Array.isArray(raw)
      ? raw.map(
          (c: {
            sha: string;
            commit: { message: string; committer: { date: string } };
            html_url: string;
          }) => ({
            sha: c.sha,
            message: c.commit.message,
            date: c.commit.committer.date,
            url: c.html_url,
          }),
        )
      : [];
    return json({ commits, error: null }, 200, {
      "Cache-Control": "no-store",
    });
  } catch (err) {
    return json({
      commits: [],
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

async function handleGetEnum(context: PagesFunctionContext, game: string, enumId: string): Promise<Response> {
  const { request, env } = context;
  await requireAuth(context);

  assertSafeFilePath(`data/${game}/enums/${enumId}.json`);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";
  const path = `data/${game}/enums/${enumId}.json`;

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
      headers: {
        "If-None-Match": "",
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      const content = JSON.parse(atob(data.content));
      return json(content, 200, {
        "Cache-Control": "no-store",
      });
    }
    return json({ error: "Not found" }, 404);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "status" in err &&
      (err as { status: number }).status === 404
    ) {
      return json({ error: "Not found" }, 404);
    }
    throw err;
  }
}

async function handleGetAsset(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  const cache = caches.default;
  const internalOrigin = "https://api.internal";
  const cacheKey = new Request(`${internalOrigin}/api/${path}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // path is "assets/..."
  const githubPath = `public/${path}`;

  assertSafeFilePath(githubPath);

  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${githubPath}`;

  try {
    const headers: Record<string, string> = { "User-Agent": "athena-admin" };
    if (token) headers["Authorization"] = `token ${token}`;

    const response = await fetch(rawUrl, { headers });

    if (!response.ok) {
      return new Response("Asset not found", { status: 404 });
    }

    const cacheableHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) cacheableHeaders.set("Content-Type", contentType);
    cacheableHeaders.set("Cache-Control", "public, max-age=3600");

    const cacheableResponse = new Response(response.clone().body, {
      status: 200,
      headers: cacheableHeaders,
    });
    context.waitUntil?.(cache.put(cacheKey, cacheableResponse));

    const clientHeaders = new Headers(cacheableHeaders);
    clientHeaders.set("Cache-Control", "no-store");

    return new Response(response.body, {
      status: 200,
      headers: clientHeaders,
    });
  } catch (err) {
    return new Response("Internal error", { status: 500 });
  }
}
