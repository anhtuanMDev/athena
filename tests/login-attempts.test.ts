import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";

import { MAX_ATTEMPTS, WINDOW_MS, checkLoginAttempts, recordLoginAttempt } from "../app/lib/login-attempts";
import { SESSION_VERSION_KEY } from "../app/lib/session";

// Loaded by URL so the root typecheck doesn't pull the handler in: there DOM's
// CacheStorage has no `default`. tsconfig.json in functions/ checks it.
const { onRequest } = await import(new URL("../functions/api/[[path]].ts", import.meta.url).href);

/** caches.default with a clock: entries live for their max-age. */
function fakeCache() {
  let now = 0;
  const entries = new Map<string, { body: string; expires: number }>();
  const cache = {
    async match(request: Request) {
      const entry = entries.get(request.url);
      return entry && entry.expires > now ? new Response(entry.body) : undefined;
    },
    async put(request: Request, response: Response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 0);
      entries.set(request.url, { body: await response.text(), expires: now + maxAge * 1000 });
    },
    async delete(request: Request) {
      return entries.delete(request.url);
    },
  };
  return { cache, entries, advance: (ms: number) => (now += ms), now: () => now };
}

describe("failed sign-ins", () => {
  const IP = "203.0.113.7";

  it("back off exponentially after five, per IP", async () => {
    const { cache, advance, now } = fakeCache();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: true });
      await recordLoginAttempt(cache, IP, false, now());
    }
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: false, retryAfter: 1 });
    assert.deepEqual(await checkLoginAttempts(cache, "198.51.100.1", now()), { allowed: true });

    advance(1000);
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: true });
    await recordLoginAttempt(cache, IP, false, now());
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: false, retryAfter: 2 });
    advance(2000);
    await recordLoginAttempt(cache, IP, false, now());
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: false, retryAfter: 4 });
  });

  it("are forgotten after a right password", async () => {
    const { cache, entries, now } = fakeCache();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await recordLoginAttempt(cache, IP, false, now());
    await recordLoginAttempt(cache, IP, true, now());
    assert.equal(entries.size, 0);
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: true });
  });

  it("start a new window once the last one is a window old", async () => {
    const { cache, advance, now } = fakeCache();
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await recordLoginAttempt(cache, IP, false, now());
    assert.equal((await checkLoginAttempts(cache, IP, now())).allowed, false);

    advance(WINDOW_MS + 1); // the cache entry has expired
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: true });
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await recordLoginAttempt(cache, IP, false, now());
    assert.deepEqual(await checkLoginAttempts(cache, IP, now()), { allowed: true }); // counting from 1 again
  });
});

describe("POST /api/auth/login", () => {
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let fake: ReturnType<typeof fakeCache>;
  beforeEach(() => {
    fake = fakeCache();
    (globalThis as { caches?: unknown }).caches = { default: fake.cache };
  });
  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  const ADMIN_PASSWORD_HASH = bcrypt.hashSync("right password", 4);
  function recordingKv() {
    const ops: string[] = [];
    const kv = {
      async get(key: string) {
        ops.push(`get ${key}`);
        return null;
      },
      async put(key: string) {
        ops.push(`put ${key}`);
      },
      async delete(key: string) {
        ops.push(`delete ${key}`);
      },
    };
    return { kv, ops };
  }
  const login = (env: Record<string, unknown>, password: string, ip = "203.0.113.7") =>
    onRequest({
      request: new Request("https://athena.example/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
        body: JSON.stringify({ password }),
      }),
      env: { SESSION_SECRET: "test-session-secret", ADMIN_PASSWORD_HASH, GITHUB_TOKEN: "", GITHUB_OWNER: "", GITHUB_REPO: "", ...env },
      params: {},
      next: async () => new Response(null, { status: 404 }),
    }) as Promise<Response>;

  it("spend no KV writes on wrong passwords, however many", async () => {
    const { kv, ops } = recordingKv();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await login({ RATE_LIMIT_KV: kv }, "guess")).status);
    assert.deepEqual(statuses.slice(0, MAX_ATTEMPTS), Array(MAX_ATTEMPTS).fill(401));
    assert.ok(statuses.slice(MAX_ATTEMPTS).every((status) => status === 429));
    assert.deepEqual(ops, []);
  });

  it("forget an IP's failures when it signs in, reading only the session version", async () => {
    const { kv, ops } = recordingKv();
    await login({ RATE_LIMIT_KV: kv }, "guess");
    const res = await login({ RATE_LIMIT_KV: kv }, "right password");
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("Set-Cookie"));
    assert.equal(fake.entries.size, 0);
    assert.deepEqual(ops, [`get ${SESSION_VERSION_KEY}`]);
  });

  it("refuse everyone without KV, which sessions need", async () => {
    const res = await login({}, "right password");
    assert.equal(res.status, 503);
    assert.equal(fake.entries.size, 0);
  });
});
