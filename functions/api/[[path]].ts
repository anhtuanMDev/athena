import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { decodeUtf8Base64, encodeUtf8Base64 } from "../../app/lib/utf8-base64";
import { jsonFileText } from "../../app/lib/json-file";
import { bumpCacheVersion, mobileVersionKeyForPath } from "../../app/lib/mobile-cache-version";
import { APP_POLICY, dataWriteProblems, needsAppPolicy, readAppPolicy } from "../../app/lib/screen-policy";
import { ASSET_VERSION, assetSeenKey, serveAsset } from "../../app/lib/asset-headers";
import { checkLoginAttempts, recordLoginAttempt } from "../../app/lib/login-attempts";
import { SESSION_TTL_SECONDS, createSessionToken, readSessionVersion, revokeSessions, sessionClaims } from "../../app/lib/session";
import { SourceError } from "../../app/lib/importer/fetch-source";
import { RepoError, githubRepo } from "../../app/lib/importer/repo";
import { deletionConflict, deletionRequest, isOwnedAsset, prunePlan, pruneRequest, recordAssetDir, type ScannedRecord } from "../../app/lib/record-assets";
import { assertSafeEntityId, assertSafeGameSlug } from "../../app/lib/safe-path";
import {
  ImportError,
  dismissDraft,
  previewImport,
  publishDraft,
  runImport,
} from "../../app/lib/importer/run";
import { CATEGORIES_PATH, DEFAULT_CATEGORIES, needsCategories, readCategories } from "../../app/lib/categories";
import { githubReader, readJsonFolderCounted, readJsonTogether, type RepoReader } from "../../app/lib/mobile-payload";
import { GraphqlUnavailable, graphqlStatus } from "../../app/lib/github-graphql";
import { templateFieldsByCategory } from "../../app/lib/notify-template";
import { pushAfterWrite, readServiceAccount, type PushEnv } from "../../app/lib/push";

const SESSION_KEY = "__admin_session";

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
  /** A Firebase service account's JSON key; without it, publishing never notifies players. */
  FCM_SERVICE_ACCOUNT?: string;
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

async function verifySession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) {
    throw new Error("Server misconfigured: SESSION_SECRET is missing");
  }
  const value = getSessionCookie(request);
  if (!value) return false;
  // The signature and lifetime first: a junk, forged or expired cookie then
  // costs no KV read (100,000 a day on Workers Free, which sessions need).
  const claims = await sessionClaims(value, env.SESSION_SECRET);
  if (!claims) return false;
  // Fails closed when the session version can't be read (KV unbound or failing):
  // a session that may have been signed out must not count.
  const version = await readSessionVersion(env.RATE_LIMIT_KV);
  return version !== null && claims.v === version;
}

async function createSessionCookie(
  secret: string,
  version: string,
  secure: boolean,
): Promise<string> {
  const value = await createSessionToken(secret, version);
  return `${SESSION_KEY}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; ${secure ? "Secure;" : ""}`;
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
  return verifySession(context.request, context.env).then((ok) => {
    if (!ok) throw new AuthError();
  });
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
    // And what this data center last saw of it (a 404, an older hash), so the
    // new picture shows here at once; elsewhere within a minute.
    urlsToPurge.push(assetSeenKey(`assets/${encodedAssetPath}`));
  }

  // Mobile payloads are cached in every data center, so they are invalidated by
  // bumping the version in their cache key rather than by cache.delete().
  // The webhook bumps it again for the same commit (about 40 writes a day),
  // kept as a safety net for when a delivery fails.
  const versionKey = mobileVersionKeyForPath(path);

  const promise = Promise.all([
    ...urlsToPurge.map(u => cache.delete(u)),
    ...(versionKey ? [bumpCacheVersion(context.env.RATE_LIMIT_KV, versionKey)] : []),
  ]).catch(err => console.error("Cache purge failed:", err));

  if (context.waitUntil) {
    context.waitUntil(promise);
  }
}

/** Methods that change something: only the admin's own pages may send them. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Whether a request was sent by a page of another origin. Browsers send
// Sec-Fetch-Site with every request (older ones at least Origin with these
// methods); a request with neither isn't from a browser page (curl, tests), so
// it carries no admin's cookie by accident. SameSite=Lax already keeps the
// cookie off cross-site POSTs; this also covers same-site origins (another
// subdomain of a custom domain) and requests that need no session, such as
// signing in.
function fromAnotherOrigin(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null) return site !== "same-origin";
  const origin = request.headers.get("Origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

export async function onRequest(
  context: PagesFunctionContext,
): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

  try {
    if (WRITE_METHODS.has(request.method) && fromAnotherOrigin(request)) {
      return json({ error: "Changes can only be made from the admin itself." }, 403);
    }
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
    if (path === "data/record-assets" && request.method === "GET")
      return await handleRecordAssets(context);
    if (path === "data/delete-record" && request.method === "POST")
      return await handleDeleteRecord(context);
    if (path === "data/prune-assets" && request.method === "POST")
      return await handlePruneAssets(context);
    if (path === "data/directory" && request.method === "GET")
      return await handleListDirectory(context);
    if (path === "data/folders" && request.method === "GET")
      return await handleListFolders(context);
    if (path === "data/games" && request.method === "GET")
      return await handleListGames(request, env);
    if (path === "data/dashboard" && request.method === "GET")
      return await handleDashboardData(context);
    if (path === "data/commits" && request.method === "GET")
      return await handleCommits(context);
    if (path.startsWith("assets/") && request.method === "GET")
      return await handleGetAsset(context);
    if (path.startsWith("imports/") && request.method === "POST")
      return await handleImport(context, path.slice("imports/".length));
    if (path === "push/status" && request.method === "GET")
      return await handlePushStatus(context);
    if (path === "github/status" && request.method === "GET")
      return await handleGithubStatus(context);
      
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
  // Sessions need KV (their version lives there), so without it nobody signs in.
  if (!env.RATE_LIMIT_KV) {
    console.error("CRITICAL: RATE_LIMIT_KV is not bound. Signing in is refused.");
    return json({ error: "Sessions are unavailable: RATE_LIMIT_KV isn't bound." }, 503);
  }

  // Failed attempts are counted in this data center's cache (see
  // app/lib/login-attempts.ts). Concurrent requests from one IP can race past
  // this check before the count is stored, allowing a few more in a burst.
  const attempts = caches.default;
  const { allowed, retryAfter } = await checkLoginAttempts(attempts, ip);
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
    await recordLoginAttempt(attempts, ip, false);
    return json({ error: "Invalid password" }, 401);
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    return json(
      { error: "Server misconfigured: SESSION_SECRET is not set" },
      500,
    );
  }

  const version = await readSessionVersion(env.RATE_LIMIT_KV);
  if (version === null) {
    return json({ error: "Sessions are unavailable: RATE_LIMIT_KV can't be read." }, 503);
  }

  await recordLoginAttempt(attempts, ip, true);
  const secure = env.COOKIE_SECURE !== "false";
  const cookie = await createSessionCookie(secret, version, secure);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

// Signing out ends every admin session (see app/lib/session.ts), but only for
// a request that has one, so a cross-site or anonymous POST can't sign anyone out.
// This browser is always signed out (a shared computer must be): ending the
// others needs a KV write, which can fail (1,000 a day on Workers Free), and a
// retry would then find no cookie and end nothing. So a failure is a warning
// that says what to do, not an error that asks for a retry.
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Set-Cookie": destroySessionCookie() };
  if (await verifySession(request, env).catch(() => false)) {
    try {
      await revokeSessions(env.RATE_LIMIT_KV!);
    } catch (err) {
      console.error("Session revocation failed:", err);
      const warning = "Signed out here, but other sessions couldn't be ended. Sign in and sign out again later to end them.";
      return new Response(JSON.stringify({ ok: true, warning }), { status: 200, headers });
    }
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function handleCheck(request: Request, env: Env): Promise<Response> {
  const authenticated = await verifySession(request, env);
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
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      let content: unknown = data.content;
      if (path.endsWith(".json")) {
        content = JSON.parse(decodeUtf8Base64(data.content));
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
    notify?: unknown;
  };
  if (!body.path) return json({ error: "path is required" }, 400);
  assertSafeFilePath(body.path);
  // A schema's references must name configured categories, which only then need reading.
  const categories = needsCategories(body.path)
    ? await readCategories((path) => githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH ?? "main").read(path))
    : DEFAULT_CATEGORIES;
  // Screens and navigation drive the mobile app; reject unsafe or unreadable ones
  // here too, not only in the editor, so a tampered client can't save them,
  // whether it sends them as JSON or as base64.
  // Notification templates may only name fields the categories' schemas have.
  const templateFields = body.path === CATEGORIES_PATH ? await schemaTemplateFields(dataReader(env)) : undefined;
  // Their limits and the app's own screens come from the block manifest, as in the editors.
  const policy = needsAppPolicy(body.path) ? await readAppPolicy((path) => dataReader(env).read(path)) : APP_POLICY;
  const problems = dataWriteProblems(body.path, body.content, body.isBase64 === true, categories, templateFields, policy);
  if (problems.length > 0) return json({ error: `This file can't be saved: ${problems.join(" ")}` }, 400);

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const result = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: body.path,
      message:
        body.message ?? (body.sha ? `Update ${body.path}` : `Add ${body.path}`),
      content: body.isBase64
        ? (body.content as string)
        : encodeUtf8Base64(jsonFileText(body.content)),
      sha: body.sha,
      branch,
    });
    triggerCachePurge(context, body.path);
    // Only once the record is saved; a push never fails the save.
    const push = await pushAfterWrite(body, pushEnv(env));
    // The new sha lets an editor keep saving without reloading the file.
    return json({ ok: true, sha: result.data.content?.sha ?? null, ...(push && { push }) });
  } catch (err: unknown) {
    const refused = refusedWrite(err, body.path);
    if (refused) return refused;
    throw err;
  }
}

/** GitHub's reason for refusing a request, on one line, without the link to its docs. */
function githubMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data;
  const message = typeof data?.message === "string" ? data.message : err instanceof Error ? err.message : "";
  return message.replace(/\s*-\s*https:\/\/docs\.github\.com\S*\s*$/, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

// A contents write GitHub refused, as the editor should hear it. 409: the file
// changed since its sha was read. 422 is any request GitHub can't take: "sha"
// wasn't supplied means the file was created meanwhile, and another sha
// problem that it changed or went: conflicts too, to reload. The rest (too
// large, invalid) need a different change, not a reload, so they aren't
// conflicts and say what GitHub said.
function refusedWrite(err: unknown, path: string): Response | null {
  const status = (err as { status?: unknown } | null)?.status;
  const conflict = (error: string) => json({ error: `Conflict on ${path}: ${error}`, conflict: true }, 409);
  if (status === 409) return conflict("the file was modified since it was loaded.");
  if (status !== 422) return null;
  const message = githubMessage(err);
  if (/"sha" wasn't supplied/i.test(message)) return conflict("the file already exists.");
  if (/\bsha\b/i.test(message)) return conflict("the file was modified or removed since it was loaded.");
  if (/too (large|big)|exceeds/i.test(message)) return json({ error: `${path} is too large for GitHub: ${message}` }, 413);
  return json({ error: `GitHub refused ${path}: ${message || "the request isn't valid"}` }, 400);
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

// A record's pictures, for the delete page (app/lib/record-assets.ts): the files
// of its own folder, the record's sha, and the commit they were read at.
async function handleRecordAssets(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const url = new URL(context.request.url);
  const game = url.searchParams.get("game") ?? "";
  const folder = url.searchParams.get("folder") ?? "";
  const id = url.searchParams.get("id") ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  const record = `data/${game}/${folder}/${id}.json`;
  assertSafeFilePath(record);
  const dir = recordAssetDir(game, folder, id);
  try {
    const { head, files } = await githubRepo(context.env).snapshot([record, dir]);
    const assets = Object.entries(files).filter(([p]) => isOwnedAsset(p, dir)).map(([path, sha]) => ({ path, sha }));
    return json({ head, sha: files[record] ?? null, files: assets }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    if (err instanceof RepoError && err.status === 503) return json({ error: err.message }, 503);
    throw err;
  }
}

// Deletes a record and the pictures of its folder the delete page showed, in
// one commit (so the push webhook fires once). Only files of the record's own
// folder, exactly as the page saw them, at the commit it read them at; any
// change since is a conflict to reload. Which pictures other records still use
// is the page's check: the server can't read every record of a game within a
// Function's 50 subrequests (Workers Free).
async function handleDeleteRecord(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const request = deletionRequest(await context.request.json().catch(() => ({})));
  if (typeof request === "string") return json({ error: request }, 400);
  const record = `data/${request.game}/${request.folder}/${request.id}.json`;
  for (const path of [record, ...request.remove.map((f) => f.path), ...request.keep]) assertSafeFilePath(path);
  const repo = githubRepo(context.env);
  const conflict = (error: string) => json({ error, conflict: true }, 409);
  try {
    const snapshot = await repo.snapshot([record, recordAssetDir(request.game, request.folder, request.id)]);
    const problem = deletionConflict(request, snapshot);
    if (problem) return conflict(problem);
    await repo.commitOn(
      snapshot.head,
      [record, ...request.remove.map((f) => f.path)].map((path) => ({ path, content: null })),
      `Delete ${request.folder} ${request.id} and ${request.remove.length} of its pictures`,
    );
  } catch (err) {
    // 422: the branch moved between the check and the commit.
    if (err instanceof RepoError && err.status === 422) return conflict("The data changed while deleting. Reload the page to check again.");
    if (err instanceof RepoError && err.status === 503) return json({ error: err.message }, 503);
    throw err;
  }
  // The record's caches, and the pictures' once, not per file: they share one mobile
  // version key, and KV takes one write a second per key. The other pictures' edge
  // copies expire within 5 minutes (asset-headers.ts).
  triggerCachePurge(context, record);
  triggerCachePurge(context, request.remove[0].path);
  return json({ ok: true });
}

/** Files GraphQL can't give whole (too big, or not UTF-8) that a prune reads through REST before giving up. */
const PRUNE_REST_READS = 10;

/**
 * Every JSON file of a game's data and of data/_meta, as at commit `head`, in
 * one GraphQL request; or why they can't be read (then nothing is removed).
 * `paths` are the repository's files at that commit.
 */
async function recordsAt(env: Env, head: string, game: string, paths: string[]): Promise<ScannedRecord[] | string> {
  const json = paths.filter((p) => (p.startsWith(`data/${game}/`) || p.startsWith("data/_meta/")) && p.endsWith(".json"));
  const dirs = [...new Set(json.map((p) => p.slice(0, p.lastIndexOf("/"))))];
  // Pinned at `head`: what's checked is exactly what the commit below applies to.
  const reader = githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, head, { token: env.GITHUB_TOKEN });
  let texts: { path: string; text?: string }[];
  try {
    texts = (await reader.readMany!(dirs, [])).folders.flatMap((folder) => folder ?? []);
  } catch (err) {
    if (err instanceof GraphqlUnavailable) return "couldn't check what uses it (GitHub GraphQL is unavailable)";
    throw err;
  }
  const whole = texts.filter((t) => t.text === undefined);
  if (whole.length > PRUNE_REST_READS) return "couldn't check what uses it (too many files to read one by one)";
  for (const t of whole) t.text = await reader.read(t.path);
  return texts.map(({ path, text }) => {
    let content: unknown = text;
    try {
      content = JSON.parse(text!);
    } catch {
      // A file that isn't valid JSON is searched as text: it may still point at a picture.
    }
    return { folder: path, id: path.slice(path.lastIndexOf("/") + 1, -".json".length), content };
  });
}

// After a save, the files of the record's own folder the save stopped
// pointing at (record-assets.ts droppedAssets): those that no JSON file of the
// game or of data/_meta points at, the saved record included, are deleted in
// one commit, on the commit everything was read at. Whatever can't be checked
// is kept and said so; the save itself is done already, so this never fails it.
// 8 GitHub requests: the snapshot (3), the records (1 GraphQL), the commit (4).
async function handlePruneAssets(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const request = pruneRequest(await context.request.json().catch(() => ({})));
  if (typeof request === "string") return json({ error: request }, 400);
  for (const path of request.paths) assertSafeFilePath(path);
  const { game, folder, id } = request;
  const dir = recordAssetDir(game, folder, id);
  const repo = githubRepo(context.env);
  const kept = (paths: string[], why: string) => json({ removed: [], kept: paths.map((path) => ({ path, why })) });
  let snapshot: { head: string; files: Record<string, string> };
  try {
    snapshot = await repo.snapshot([`data/${game}/`, "data/_meta/", dir]);
  } catch (err) {
    if (err instanceof RepoError && err.status === 503) return kept(request.paths, "couldn't check what uses it (the data repository is too big to list)");
    throw err;
  }
  // Files already gone need nothing.
  const files = request.paths.filter((path) => snapshot.files[path]).map((path) => ({ path, sha: snapshot.files[path] }));
  if (files.length === 0) return json({ removed: [], kept: [] });
  const records = await recordsAt(context.env, snapshot.head, game, Object.keys(snapshot.files));
  if (typeof records === "string") return kept(files.map((f) => f.path), records);
  const plan = prunePlan(dir, files, records);
  if (plan.remove.length > 0) {
    try {
      await repo.commitOn(
        snapshot.head,
        plan.remove.map((f) => ({ path: f.path, content: null })),
        `Remove ${plan.remove.length} replaced picture${plan.remove.length === 1 ? "" : "s"} of ${folder} ${id}`,
      );
    } catch (err) {
      // 422: the branch moved since it was read, so the check may be out of date.
      if (err instanceof RepoError && err.status === 422) return kept(files.map((f) => f.path), "the data changed meanwhile");
      throw err;
    }
    // One purge for the pictures (they share the mobile assets version); the rest expire (asset-headers.ts).
    triggerCachePurge(context, plan.remove[0].path);
  }
  return json({ removed: plan.remove.map((f) => f.path), kept: plan.keep.map((k) => ({ path: k.path, why: `used by ${k.usedBy.join(", ")}` })) });
}

// Import jobs (app/lib/importer): preview a mapping, run a job now, and the
// reviewer's answers to a draft. Each write is one commit; a published record
// refreshes the mobile caches like any other save.
async function handleImport(context: PagesFunctionContext, action: string): Promise<Response> {
  await requireAuth(context);
  const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
  const game = String(body.game ?? "");
  const jobId = String(body.jobId ?? "");
  const repo = githubRepo(context.env);
  try {
    switch (action) {
      case "preview":
        return json(await previewImport({ repo, game, job: body.job }));
      case "run":
        return json(await runImport({ repo, game, jobId }));
      case "publish": {
        const record = body.record && typeof body.record === "object" ? (body.record as Record<string, unknown>) : {};
        const path = await publishDraft(repo, game, jobId, record);
        triggerCachePurge(context, path);
        const push = await pushAfterWrite({ path, content: record, notify: body.notify }, pushEnv(context.env));
        return json({ ok: true, path, ...(push && { push }) });
      }
      case "dismiss":
        await dismissDraft(repo, game, jobId, String(body.id ?? ""));
        return json({ ok: true });
      default:
        return json({ error: "Not found" }, 404);
    }
  } catch (err) {
    if (err instanceof ImportError) return json({ error: err.message }, err.status);
    if (err instanceof SourceError) return json({ error: err.message }, 502);
    throw err;
  }
}

/** The data repo as the API reads it; folders through GraphQL when the token allows (mobile-payload.ts). */
function dataReader(env: Env): RepoReader {
  return githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH ?? "main", { token: env.GITHUB_TOKEN });
}

function pushEnv(env: Env): PushEnv {
  const reader = dataReader(env);
  return { credentials: env.FCM_SERVICE_ACCOUNT, kv: env.RATE_LIMIT_KV, read: (path) => reader.read(path) };
}

/**
 * Every game's schema fields by category, for checking categories.json's
 * templates. A schema that can't be read refuses the save rather than check
 * against part of them: 1 + games + schemas GitHub reads, on a rare save.
 */
async function schemaTemplateFields(reader: RepoReader): Promise<Record<string, string[]>> {
  const games: { slug?: unknown }[] = JSON.parse(await reader.read("data/_meta/games.json")).games ?? [];
  const slugs = games.map((g) => g.slug).filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9-]+$/.test(slug));
  // Every game's schemas in one request when the reader can.
  const together = readJsonTogether(reader, slugs.map((slug) => `data/${slug}/schemas`), []);
  const folders = await Promise.all(slugs.map((slug) => together.folder(`data/${slug}/schemas`)));
  if (folders.some((f) => f.partial)) {
    throw json({ error: "Some schemas couldn't be read to check the notification templates. Try again." }, 503);
  }
  return templateFieldsByCategory(folders.flatMap((f) => f.files.map((file) => file.content)));
}

// Whether the server's token can read folders through GitHub GraphQL (one request
// each, see github-graphql.ts), for checking a deploy: only that, nothing about the token.
async function handleGithubStatus(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const { env } = context;
  const graphql = await graphqlStatus({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO });
  return json({ graphql }, 200, { "Cache-Control": "no-store" });
}

// Whether pushes can be sent: only that, never anything about the credentials.
async function handlePushStatus(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const configured = (await readServiceAccount(context.env.FCM_SERVICE_ACCOUNT)) !== null;
  return json({ configured }, 200, { "Cache-Control": "no-store" });
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

  assertSafeFilePath(`data/${game}/${subpath}/dummy.json`);
  const dir = `data/${game}/${subpath}`;

  if (url.searchParams.get("includeContent") === "true") {
    const keysOnly = url.searchParams.get("keysOnly")?.split(",") ?? null;
    // Only the keys asked for, which keeps big records out of the page's memory.
    const shown = (content: unknown) => {
      if (!keysOnly) return content;
      if (content === null || content === undefined) return null;
      const filtered: Record<string, unknown> = {};
      for (const key of keysOnly) {
        const value = (content as Record<string, unknown>)[key];
        if (value !== undefined) filtered[key] = value;
      }
      return filtered;
    };
    try {
      // One GitHub request for the whole folder when the token can use GraphQL
      // (mobile-payload.ts readJsonTogether), else one per file, as before.
      const { files, unread } = await readJsonFolderCounted(dataReader(env), dir);
      const payload = files.map((file) => shown(file.content)).filter(Boolean);
      // Records that couldn't be read are left out; X-Incomplete says how many, so a
      // check that must see them all (the delete page's) knows it didn't.
      const left = unread + files.length - payload.length;
      return json(payload, 200, {
        "Cache-Control": "no-store",
        ...(left > 0 && { "X-Incomplete": String(left) }),
      });
    } catch (err) {
      // The folder couldn't be listed: an empty list that isn't the folder's.
      console.error("handleListDirectory error:", err);
      return json([], 200, { "X-Incomplete": "all" });
    }
  }

  try {
    const { data } = await new Octokit({ auth: env.GITHUB_TOKEN }).repos.getContent({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      path: dir,
      ref: env.GITHUB_BRANCH ?? "main",
      headers: {
        "Cache-Control": "no-cache",
      },
    });
    if (!Array.isArray(data)) return json([]);
    const payload = data.filter((entry) => entry.type === "file" && entry.name.endsWith(".json")).map((entry) => entry.name.replace(".json", ""));
    return json(payload, 200, {
      "Cache-Control": "no-store",
    });
  } catch (err) {
    // A folder that doesn't exist is empty; any other failure is an empty list
    // that isn't the folder's, which X-Incomplete says.
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) return json([]);
    console.error("handleListDirectory error:", err);
    return json([], 200, { "X-Incomplete": "all" });
  }
}

/** Folders data/folders reads at once: what one page needs together, and no more. */
const MAX_FOLDERS = 4;

// Several folders of a game at once, as data/directory reads one (with
// includeContent), for a page that needs them together, such as a list's
// schemas and enums: one GitHub request for them all when the token can use
// GraphQL. X-Incomplete counts the records left out ("all" when a folder
// couldn't even be listed).
async function handleListFolders(context: PagesFunctionContext): Promise<Response> {
  await requireAuth(context);
  const url = new URL(context.request.url);
  const game = url.searchParams.get("game") ?? "";
  const subpaths = (url.searchParams.get("subpaths") ?? "").split(",");
  if (!game || subpaths.some((s) => !s) || subpaths.length > MAX_FOLDERS || new Set(subpaths).size !== subpaths.length) {
    return json({ error: `game and 1 to ${MAX_FOLDERS} different subpaths are required` }, 400);
  }
  for (const subpath of subpaths) assertSafeFilePath(`data/${game}/${subpath}/dummy.json`);
  const dirs = subpaths.map((subpath) => `data/${game}/${subpath}`);
  const together = readJsonTogether(dataReader(context.env), dirs, []);
  let left = 0;
  let unlisted = false;
  const folders = await Promise.all(
    dirs.map((dir) =>
      together.folder(dir).then(
        ({ files, unread }) => {
          const items = files.map((file) => file.content).filter(Boolean);
          left += unread + files.length - items.length;
          return items;
        },
        (err) => {
          console.error(`handleListFolders: ${dir} couldn't be listed:`, err);
          unlisted = true;
          return [];
        },
      ),
    ),
  );
  return json(Object.fromEntries(subpaths.map((subpath, i) => [subpath, folders[i]])), 200, {
    "Cache-Control": "no-store",
    ...((unlisted || left > 0) && { "X-Incomplete": unlisted ? "all" : String(left) }),
  });
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
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      const decoded = decodeUtf8Base64(data.content);
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
        "Cache-Control": "no-cache",
      },
    });
    let games = [];
    if ("content" in data && "sha" in data) {
      games = JSON.parse(decodeUtf8Base64(data.content)).games ?? [];
    }

    const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
    const treeSha = branchData.commit.commit.tree.sha;
    
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
    });

    // Records per configured category, inactive games included: the Categories
    // page locks a category's folder while any game has records in it.
    const categories = await readCategories((path) => githubReader(octokit, owner, repo, branch).read(path));
    const gameStats = games.map((game: any) => {
      const count = (folder: string) =>
        treeData.tree.filter((t) => t.type === "blob" && t.path?.startsWith(`data/${game.slug}/${folder}/`) && t.path?.endsWith(".json")).length;
      return { ...game, counts: Object.fromEntries(categories.map((c) => [c.folder, count(c.folder)])) };
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
        "Cache-Control": "no-cache",
      },
    });
    if ("content" in data && "sha" in data) {
      const content = JSON.parse(decodeUtf8Base64(data.content));
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
  const headers: Record<string, string> = { "User-Agent": "athena-admin" };
  if (token) headers["Authorization"] = `token ${token}`;
  const version = url.searchParams.get("v") ?? "";
  const cache = caches.default;

  try {
    return await serveAsset({
      path,
      // Anything but a payload's version is ignored, so it can't mint cache keys.
      version: ASSET_VERSION.test(version) ? version : undefined,
      ifNoneMatch: request.headers.get("If-None-Match"),
      cache: {
        match: (key) => cache.match(new Request(key)),
        put: (key, response) => cache.put(new Request(key), response),
      },
      fetchAsset: () => fetch(rawUrl, { headers }),
    });
  } catch (err) {
    return new Response("Internal error", { status: 500 });
  }
}
