import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { assetSeenKey } from "../app/lib/asset-headers";
import { logout } from "../app/lib/auth";
import { SESSION_TTL_SECONDS, SESSION_VERSION_KEY, createSessionToken } from "../app/lib/session";

// The handler is type-checked with Workers' types (functions/tsconfig.json);
// a computed specifier keeps it out of the app's DOM-typed program.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const SECRET = "test-session-secret";
const ORIGIN = "https://athena.example";

/** A KV that records reads and writes; `failing` makes reads throw, `refusing` writes (KV's 1,000 a day spent). */
function recordingKv(failing = false, refusing = false) {
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    reads,
    writes,
    kv: {
      async get(key: string) {
        reads.push(key);
        if (failing) throw new Error("KV unavailable");
        return null;
      },
      async put(key: string) {
        writes.push(key);
        if (refusing) throw new Error("KV PUT failed: 429 Too Many Requests");
      },
    },
  };
}

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
let github: string[];
let deleted: string[];
/** How GitHub answers a contents PUT, and a contents DELETE. */
let putAnswer: () => Response;
let deleteAnswer: () => Response;
beforeEach(() => {
  github = [];
  deleted = [];
  putAnswer = () => Response.json({ content: { sha: "new-sha" } });
  deleteAnswer = () => Response.json({ commit: { sha: "c" } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    github.push(`${method} ${url.pathname}`);
    if (url.hostname === "api.github.com" && method === "PUT" && url.pathname.startsWith("/repos/o/r/contents/")) return putAnswer();
    if (url.hostname === "api.github.com" && method === "DELETE" && url.pathname.startsWith("/repos/o/r/contents/")) return deleteAnswer();
    throw new Error(`unexpected ${method} ${url.href}`);
  }) as typeof fetch;
  (globalThis as { caches?: unknown }).caches = {
    default: {
      async match() {},
      async put() {},
      async delete(request: Request | string) {
        deleted.push(typeof request === "string" ? request : request.url);
        return true;
      },
    },
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { caches?: unknown }).caches = realCaches;
});

async function call(path: string, init: RequestInit & { kv?: unknown; env?: Record<string, unknown> } = {}) {
  const waits: Promise<unknown>[] = [];
  const response = await api({
    request: new Request(`${ORIGIN}${path}`, init),
    env: { RATE_LIMIT_KV: init.kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET, COOKIE_SECURE: "false", ...init.env },
    params: {},
    next: async () => new Response(null),
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  });
  await Promise.all(waits);
  return response;
}
const cookie = (token: string) => ({ Cookie: `__admin_session=${token}` });
/** The first bytes of a PNG, as base64: what an upload must start with. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64");
const authenticated = async (token: string, kv: unknown) => ((await (await call("/api/auth/check", { headers: cookie(token), kv })).json()) as { authenticated: boolean }).authenticated;

describe("checking a session", () => {
  it("costs no KV read for a cookie that isn't signed, is forged or has expired", async () => {
    const { kv, reads } = recordingKv();
    const expired = await createSessionToken(SECRET, "0", Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    const forged = await createSessionToken("another-secret", "0");
    for (const token of ["junk", "junk.junk", "eyJpYXQiOjF9.AAAA", forged, expired]) {
      assert.equal(await authenticated(token, kv), false, token);
    }
    assert.deepEqual(reads, []);
  });

  it("reads the session version once for a valid cookie", async () => {
    const { kv, reads } = recordingKv();
    assert.equal(await authenticated(await createSessionToken(SECRET, "0"), kv), true);
    assert.deepEqual(reads, [SESSION_VERSION_KEY]);
    // Signed out since: another version.
    assert.equal(await authenticated(await createSessionToken(SECRET, "earlier"), kv), false);
  });

  it("still fails closed when KV is unbound or can't be read", async () => {
    const token = await createSessionToken(SECRET, "0");
    assert.equal(await authenticated(token, undefined), false);
    assert.equal(await authenticated(token, recordingKv(true).kv), false);
  });
});

describe("requests that change something", () => {
  it("are refused from another site or origin, before any session, KV or GitHub work", async () => {
    const token = await createSessionToken(SECRET, "0");
    const crossSite: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { "Sec-Fetch-Site": "none" },
      // Browsers without Sec-Fetch-Site still send Origin with these methods.
      { Origin: "https://evil.example" },
      { Origin: "null" },
    ];
    for (const headers of crossSite) {
      const { kv, reads, writes } = recordingKv();
      const logout = await call("/api/auth/logout", { method: "POST", headers: { ...cookie(token), ...headers }, kv });
      assert.equal(logout.status, 403, JSON.stringify(headers));
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        assert.equal((await call("/api/data/file", { method, headers: { ...cookie(token), ...headers }, body: "{}", kv })).status, 403, method);
      }
      assert.deepEqual([reads, writes], [[], []]);
    }
    assert.deepEqual(github, []);
  });

  it("go through from the admin's own pages, and from clients that aren't browsers", async () => {
    const sameOrigin: Record<string, string>[] = [{ "Sec-Fetch-Site": "same-origin", Origin: ORIGIN }, { Origin: ORIGIN }, {}];
    for (const headers of sameOrigin) {
      const { kv, writes } = recordingKv();
      const res = await call("/api/auth/logout", { method: "POST", headers: { ...cookie(await createSessionToken(SECRET, "0")), ...headers }, kv });
      assert.equal(res.status, 200, JSON.stringify(headers));
      assert.deepEqual(writes, [SESSION_VERSION_KEY]);
    }
  });

  it("don't include reads, which other sites may make", async () => {
    const res = await call("/api/auth/check", { headers: { "Sec-Fetch-Site": "cross-site" }, kv: recordingKv().kv });
    assert.equal(res.status, 200);
  });
});

describe("signing out", () => {
  const signOut = async (kv: unknown) =>
    call("/api/auth/logout", { method: "POST", headers: { ...cookie(await createSessionToken(SECRET, "0")), "Sec-Fetch-Site": "same-origin" }, kv });
  const destroysCookie = (res: Response) => assert.match(res.headers.get("Set-Cookie") ?? "", /^__admin_session=;.*Max-Age=0/);

  it("ends every session, and this browser's cookie", async () => {
    const { kv, writes } = recordingKv();
    const res = await signOut(kv);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    destroysCookie(res);
    assert.deepEqual(writes, [SESSION_VERSION_KEY]);
  });

  // A shared computer must be left signed out whatever happens; a retry would
  // find no cookie and end nothing, so the admin is told, not asked to retry.
  it("still signs this browser out when the other sessions can't be ended, and says so", async () => {
    const { kv, writes } = recordingKv(false, true);
    const error = console.error;
    console.error = () => {};
    try {
      const res = await signOut(kv);
      assert.equal(res.status, 200);
      destroysCookie(res);
      const body = (await res.json()) as { ok: boolean; warning?: string };
      assert.equal(body.ok, true);
      assert.equal(body.warning, "Signed out here, but other sessions couldn't be ended. Sign in and sign out again later to end them.");
      assert.deepEqual(writes, [SESSION_VERSION_KEY]);
    } finally {
      console.error = error;
    }
  });
});

describe("logout() in the admin", () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  const realStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map([["has_session", "true"]]);
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { localStorage?: unknown }).localStorage = { removeItem: (key: string) => stored.delete(key) };
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
    (globalThis as { localStorage?: unknown }).localStorage = realStorage;
  });
  const answer = (status: number, body: unknown) => {
    globalThis.fetch = (async () => Response.json(body, { status })) as typeof fetch;
  };

  it("returns nothing when every session ended, and forgets this one", async () => {
    answer(200, { ok: true });
    assert.equal(await logout(), undefined);
    assert.equal(stored.has("has_session"), false);
  });

  it("returns the server's warning when only this one ended, and still forgets it", async () => {
    answer(200, { ok: true, warning: "Signed out here, but other sessions couldn't be ended." });
    assert.equal(await logout(), "Signed out here, but other sessions couldn't be ended.");
    assert.equal(stored.has("has_session"), false);
  });

  it("throws when it couldn't sign out at all, keeping the session it has", async () => {
    answer(403, { error: "Changes can only be made from the admin itself." });
    await assert.rejects(logout(), /Changes can only be made from the admin itself\./);
    answer(500, "not json");
    await assert.rejects(logout(), /Couldn't sign out \(500\)/);
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await assert.rejects(logout(), /Failed to fetch/);
    assert.equal(stored.get("has_session"), "true");
  });
});

describe("a write GitHub refuses", () => {
  const save = async () =>
    call("/api/data/file", {
      method: "POST",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: JSON.stringify({ path: "public/assets/overwatch/x.png", content: PNG, isBase64: true }),
      kv: recordingKv().kv,
    });
  const refused = (status: number, message: string) => () =>
    Response.json({ message, documentation_url: "https://docs.github.com/rest/repos/contents#create-or-update-file-contents" }, { status });

  it("is a conflict to reload when the file changed or was created meanwhile", async () => {
    for (const [status, message, says] of [
      [409, "x.png does not match 0123abc", /modified/],
      [422, 'Invalid request.\n\n"sha" wasn\'t supplied.', /already exists/],
      [422, "Invalid request.\n\nsha is not valid for this file.", /modified or removed/],
    ] as const) {
      putAnswer = refused(status, message);
      const res = await save();
      assert.equal(res.status, 409, message);
      const body = (await res.json()) as { error: string; conflict?: boolean };
      assert.equal(body.conflict, true);
      assert.match(body.error, says);
    }
  });

  it("says why otherwise, in GitHub's words, without claiming a conflict", async () => {
    putAnswer = refused(422, "File is too large. Maximum file size is 100 MB.");
    let res = await save();
    assert.equal(res.status, 413);
    let body = (await res.json()) as { error: string; conflict?: boolean };
    assert.equal(body.conflict, undefined);
    assert.match(body.error, /public\/assets\/overwatch\/x\.png is too large for GitHub: File is too large/);

    putAnswer = refused(422, "Invalid request.\n\nFor 'properties/content', 5 is not a string.");
    res = await save();
    assert.equal(res.status, 400);
    body = (await res.json()) as { error: string; conflict?: boolean };
    assert.equal(body.conflict, undefined);
    assert.equal(body.error, "GitHub refused public/assets/overwatch/x.png: Invalid request. For 'properties/content', 5 is not a string.");
    assert.doesNotMatch(body.error, /docs\.github\.com/);
  });
});

describe("an upload", () => {
  it("forgets this data center's record of the picture, and nothing under /api/data/file", async () => {
    const res = await call("/api/data/file", {
      method: "POST",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: JSON.stringify({ path: "public/assets/overwatch/x.png", content: PNG, isBase64: true }),
      kv: recordingKv().kv,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(deleted.sort(), ["https://api.internal/api/assets/overwatch/x.png", assetSeenKey("assets/overwatch/x.png")].sort());
  });
});

describe("a picture sent to the per-file write (the games page's icon)", () => {
  const send = async (body: Record<string, unknown> | string) =>
    call("/api/data/file", {
      method: "POST",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify({ path: "public/assets/games/overwatch-icon.png", isBase64: true, ...body }),
      kv: recordingKv().kv,
    });

  it("follows the picture rules, refusing before any GitHub request", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1);
    big.set(Buffer.from(PNG, "base64"));
    for (const [what, body, status] of [
      ["one byte over 2 MiB", { content: big.toString("base64") }, 413],
      ["an SVG", { path: "public/assets/games/overwatch-icon.svg", content: Buffer.from("<svg/>").toString("base64") }, 415],
      ["an SVG named .png", { content: Buffer.from("<svg/>").toString("base64") }, 415],
      ["JSON rather than base64", { isBase64: false, content: { not: "a picture" } }, 400],
      ["a body over 3 MiB, before it's parsed", JSON.stringify({ path: "data/overwatch/heroes/ana.json", content: "x".repeat(3 * 1024 * 1024) }), 413],
    ] as const) {
      const res = await send(body);
      assert.equal(res.status, status, what);
      assert.equal(typeof ((await res.json()) as { error?: unknown }).error, "string", what);
    }
    assert.deepEqual(github, []);
  });
});

describe("a delete GitHub refuses", () => {
  const remove = async () =>
    call("/api/data/file", {
      method: "DELETE",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: JSON.stringify({ path: "data/overwatch/screens/home.json", sha: "old-sha" }),
      kv: recordingKv().kv,
    });
  const refused = (status: number, message: string) => () => Response.json({ message, documentation_url: "https://docs.github.com/rest/repos/contents#delete-a-file" }, { status });

  it("is a conflict to reload when the file changed or is gone already", async () => {
    for (const [status, message, says] of [
      [409, "home.json does not match old-sha", /modified/],
      [422, "Invalid request.\n\nsha is not valid for this file.", /modified or removed/],
      [404, "Not Found", /already removed/],
    ] as const) {
      deleteAnswer = refused(status, message);
      const res = await remove();
      assert.equal(res.status, 409, message);
      const body = (await res.json()) as { error: string; conflict?: boolean };
      assert.equal(body.conflict, true);
      assert.match(body.error, says);
      assert.match(body.error, /^Conflict on data\/overwatch\/screens\/home\.json: /);
    }
  });

  it("says why otherwise, in GitHub's words, without claiming a conflict", async () => {
    deleteAnswer = refused(422, "Invalid request.\n\nmessage is too long.");
    const res = await remove();
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; conflict?: boolean };
    assert.equal(body.conflict, undefined);
    assert.equal(body.error, "GitHub refused data/overwatch/screens/home.json: Invalid request. message is too long.");
  });
});

describe("signing in", () => {
  // Test passphrases only. The verifier is made here by its definition
  // (PBKDF2-SHA256, base64url), not with app/lib/password.ts, so the format is pinned.
  const PASS = "test-passphrase-for-the-api-tests";
  const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  async function verifier(passphrase: string, iterations = 20_000) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return `pbkdf2-sha256:${iterations}:${b64url(salt)}:${b64url(new Uint8Array(bits))}`;
  }
  /** The data center's cache, as caches.default keeps the failed attempts. */
  let attempts: Map<string, string>;
  beforeEach(() => {
    attempts = new Map();
    (globalThis as { caches?: unknown }).caches = {
      default: {
        async match(request: Request) {
          const text = attempts.get(request.url);
          return text === undefined ? undefined : new Response(text);
        },
        async put(request: Request, response: Response) {
          attempts.set(request.url, await response.text());
        },
        async delete(request: Request) {
          return attempts.delete(request.url);
        },
      },
    };
    mock.method(console, "warn", () => {});
    mock.method(console, "error", () => {});
  });
  afterEach(() => mock.restoreAll());
  const login = (stored: string, password: string, ip = "203.0.113.7") =>
    call("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ password }),
      kv: recordingKv().kv,
      env: { ADMIN_PASSWORD_HASH: stored },
    });

  it("signs in with a pbkdf2-sha256 verifier", async () => {
    const res = await login(await verifier(PASS), PASS);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Set-Cookie") ?? "", /^__admin_session=/);
  });

  it("answers a bcrypt hash as a setup error, right passphrase or not: not counted, and the log says what to do without showing it", async () => {
    const logged = mock.method(console, "error", () => {});
    // Shaped like a bcrypt hash; not the hash of anything.
    const legacy = "$2b$10$" + "a".repeat(22) + "b".repeat(31);
    for (const password of [PASS, "wrong"]) {
      const res = await login(legacy, password);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "Server misconfigured" });
    }
    assert.equal(attempts.size, 0);
    const lines = logged.mock.calls.map((call) => call.arguments.map(String).join(" "));
    assert.ok(lines.some((line) => line.includes("`npm run admin-password`")));
    assert.ok(!lines.some((line) => line.includes("$2b$") || line.includes("a".repeat(22))), "never logs the hash");
  });

  it("counts a wrong passphrase, and refuses the 6th try before checking it", async () => {
    const stored = await verifier(PASS);
    for (let i = 0; i < 5; i++) assert.equal((await login(stored, `wrong-${i}`)).status, 401);
    const derive = mock.method(crypto.subtle, "deriveBits");
    const res = await login(stored, PASS);
    assert.equal(res.status, 429);
    assert.equal(derive.mock.callCount(), 0);
    // Another address isn't held back.
    assert.equal((await login(stored, PASS, "203.0.113.8")).status, 200);
  });

  it("answers a stored value it can't use as a setup error, and doesn't count it against the user", async () => {
    for (const stored of ["not-a-verifier", `pbkdf2-sha256:5:AAAAAAAAAAAAAAAAAAAAAA:${"A".repeat(43)}`]) {
      const res = await login(stored, PASS);
      assert.equal(res.status, 500, stored);
      assert.deepEqual(await res.json(), { error: "Server misconfigured" });
    }
    assert.equal(attempts.size, 0);
  });
});

describe("saving games.json", () => {
  const GAMES = "data/_meta/games.json";
  // Games the app shows: a developer and the 14 dark colors (games.json's own checks).
  const dark = JSON.parse(readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8")).dark as Record<string, string>;
  const game = (slug: string, name: string, active: boolean) => ({ slug, name, developer: "", active, ...dark });
  const games = [game("overwatch", "Overwatch", true), game("marvel-rivals", "Marvel Rivals", false)];
  const text = `${JSON.stringify({ games }, null, 2)}\n`;
  /** GitHub with games.json and data/overwatch/ (marvel-rivals has no folder yet); every request is logged. */
  function gamesGitHub(graphql: boolean) {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const path = decodeURIComponent(url.pathname.replace(/^\/repos\/o\/r\/contents\//, ""));
      if (url.pathname === "/graphql") {
        calls.push("graphql");
        if (!graphql) return Response.json({ message: "Bad credentials" }, { status: 401 });
        const variables = JSON.parse(String(init?.body)).variables as Record<string, string>;
        assert.deepEqual(variables, { owner: "o", name: "r", p0: `main:${GAMES}`, l0: "main:data" });
        const blob = { oid: "x", byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text };
        const entries = [
          { name: "_meta", type: "tree", mode: 16384 },
          { name: "overwatch", type: "tree", mode: 16384 },
          { name: "README.json", type: "blob", mode: 33188 },
        ];
        return Response.json({ data: { repository: { p0: blob, l0: { entries } } } });
      }
      calls.push(`${method} ${path}`);
      if (method === "GET" && path === GAMES) return Response.json({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64"), sha: "games-sha" });
      if (method === "GET" && path === "data")
        return Response.json([
          { name: "_meta", path: "data/_meta", type: "dir" },
          { name: "overwatch", path: "data/overwatch", type: "dir" },
        ]);
      if (method === "PUT" || method === "DELETE") return Response.json({ content: { sha: "new-sha" } });
      throw new Error(`unexpected ${method} ${url.href}`);
    }) as typeof fetch;
    return calls;
  }
  const save = async (content: unknown, extra: Record<string, unknown> = {}) =>
    call("/api/data/file", {
      method: "POST",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: JSON.stringify({ path: GAMES, content, sha: "games-sha", ...extra }),
      kv: recordingKv().kv,
    });

  it("refuses renaming or removing a game whose data folder exists, before writing anything", async () => {
    for (const next of [
      { games: [{ ...games[0], slug: "overwatch-2" }, games[1]] },
      { games: [games[1]] },
      { nope: true },
    ]) {
      const calls = gamesGitHub(true);
      const res = await save(next);
      assert.equal(res.status, 400);
      const { error } = (await res.json()) as { error: string };
      assert.match(error, /"overwatch"/);
      assert.match(error, /data\/overwatch\//);
      assert.deepEqual(calls, ["graphql"]);
    }
  });

  it("lets any other change through after one read", async () => {
    for (const next of [
      { games: [games[0]] },
      { games: [...games, game("valorant", "Valorant", true)] },
      { games: [{ ...games[0], name: "Overwatch 2" }, games[1]] },
    ]) {
      const calls = gamesGitHub(true);
      assert.equal((await save(next)).status, 200);
      assert.deepEqual(calls, ["graphql", `PUT ${GAMES}`]);
    }
  });

  it("checks games.json the same way sent as base64, or under an encoded path", async () => {
    gamesGitHub(true);
    const renamed = { games: [{ ...games[0], slug: "ow" }, games[1]] };
    assert.equal((await save(Buffer.from(JSON.stringify(renamed)).toString("base64"), { isBase64: true })).status, 400);
    const calls = gamesGitHub(true);
    assert.equal((await save(renamed, { path: "data/_meta/games%2Ejson" })).status, 400);
    assert.deepEqual(calls, ["graphql"]);
  });

  it("reads through REST when GraphQL can't", async () => {
    mock.method(console, "warn", () => {});
    const calls = gamesGitHub(false);
    assert.equal((await save({ games: [games[1]] })).status, 400);
    assert.deepEqual(calls, ["graphql", `GET ${GAMES}`, "GET data"]);
    mock.restoreAll();
  });

  it("can't delete it, and asks GitHub nothing", async () => {
    const calls = gamesGitHub(true);
    const res = await call("/api/data/file", {
      method: "DELETE",
      headers: { ...cookie(await createSessionToken(SECRET, "0")), "Content-Type": "application/json" },
      body: JSON.stringify({ path: GAMES, sha: "games-sha" }),
      kv: recordingKv().kv,
    });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /can't be deleted/);
    assert.deepEqual(calls, []);
  });
});
