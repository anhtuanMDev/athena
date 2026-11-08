import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, mobileDataVersionKey } from "../app/lib/mobile-cache-version";
import { onRequest as mobileData } from "../functions/mobile/data";
import { onRequest as mobileInit } from "../functions/mobile/init";

// /mobile/init and /mobile/data as the app meets them, run against a GitHub of
// in-memory files, a caches.default with a clock and a KV that records what
// it's asked. What they must hold to on the Workers Free plan (50 subrequests,
// 100k KV reads a day): a made-up or inactive game costs no KV read and no
// GitHub request; a failed build or a failing KV never leaves the app with
// nothing when a complete payload was built before; a payload missing files
// says so; and a KV failure never pins a payload in the cache.

const json = (value: unknown) => JSON.stringify(value);
const GAMES = json({ games: [{ slug: "overwatch", name: "Overwatch" }, { slug: "marvel-rivals", name: "Marvel Rivals", active: false }] });
const FILES: Record<string, string> = {
  "data/_meta/games.json": GAMES,
  "data/overwatch/heroes/ana.json": json({ id: "ana", portrait: "/api/assets/overwatch/heroes/ana/portrait.webp" }),
  "data/overwatch/heroes/baptiste.json": json({ id: "baptiste" }),
  "data/overwatch/news/launch.json": json({ id: "launch", title: "Launch" }),
  "data/overwatch/schemas/hero.json": json({ id: "hero" }),
  "data/overwatch/enums/roles.json": json({ id: "roles", values: [] }),
  "data/overwatch/screens/home.json": json({ title: "Home" }),
  "public/assets/overwatch/heroes/ana/portrait.webp": "a picture",
};

/** A GitHub of `files` answering REST contents, the repo tree and GraphQL, as Octokit and github-graphql.ts call them. */
function fakeGitHub(initial: Record<string, string>) {
  const files = { ...initial };
  const calls: string[] = [];
  const state = { down: false, treeFails: false, failing: new Set<string>() };
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");
  const children = (dir: string) => Object.keys(files).filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"));
  const blob = (path: string) => ({ oid: sha(files[path]), byteSize: Buffer.byteLength(files[path]), isBinary: false, isTruncated: false, text: files[path] });
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.github.com") throw new Error(`unexpected request to ${url.href}`);
    if (state.down) {
      calls.push("down");
      throw new TypeError("fetch failed");
    }
    if (url.pathname === "/graphql") {
      calls.push("graphql");
      const variables: Record<string, string> = JSON.parse(String(init?.body)).variables;
      const paths = Object.entries(variables).filter(([k]) => /^p\d+$/.test(k)).map(([k, v]) => [k, v.slice("main:".length)]);
      // A path GitHub can't read makes the whole answer untrusted: github-graphql.ts then reads through REST.
      if (paths.some(([, p]) => state.failing.has(p))) return Response.json({ data: { repository: null }, errors: [{ type: "INTERNAL" }] });
      const repository: Record<string, unknown> = {};
      for (const [name, path] of paths) {
        if (path in files) repository[name] = blob(path);
        else if (children(path).length > 0) repository[name] = { entries: children(path).map((p) => ({ name: p.split("/").pop(), type: "blob", mode: 33188, object: blob(p) })) };
        else repository[name] = null;
      }
      return Response.json({ data: { repository } });
    }
    const contents = /^\/repos\/o\/r\/contents\/(.+)$/.exec(url.pathname);
    if (contents) {
      const path = decodeURIComponent(contents[1]);
      calls.push(`rest ${path}`);
      if (state.failing.has(path)) return Response.json({ message: "Server Error" }, { status: 502 });
      if (path in files) return Response.json({ type: "file", encoding: "base64", content: Buffer.from(files[path]).toString("base64"), path, name: path.split("/").pop(), sha: sha(files[path]) });
      const list = children(path);
      if (list.length === 0) return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(list.map((p) => ({ type: "file", name: p.split("/").pop(), path: p, sha: sha(files[p]) })));
    }
    if (url.pathname.startsWith("/repos/o/r/git/trees/")) {
      calls.push("tree");
      if (state.treeFails) return Response.json({ message: "Server Error" }, { status: 502 });
      return Response.json({ truncated: false, tree: Object.keys(files).filter((p) => p.startsWith("public/assets/")).map((path) => ({ path, type: "blob", sha: sha(files[path]) })) });
    }
    throw new Error(`unexpected request to ${url.href}`);
  };
  return { files, calls, state, fetcher: fetcher as typeof fetch };
}

/** caches.default with a clock: an entry lives for its max-age. Records each put. */
function clockCache() {
  let now = 0;
  const store = new Map<string, { body: ArrayBuffer; status: number; headers: [string, string][]; expires: number }>();
  const puts: { key: string; cacheControl: string | null }[] = [];
  const cache = {
    async match(request: Request) {
      const entry = store.get(request.url);
      if (!entry || entry.expires <= now) return undefined;
      return new Response(entry.body.slice(0), { status: entry.status, headers: entry.headers });
    },
    async put(request: Request, response: Response) {
      const cacheControl = response.headers.get("Cache-Control");
      puts.push({ key: request.url, cacheControl });
      const maxAge = Number(/max-age=(\d+)/.exec(cacheControl ?? "")?.[1] ?? 0);
      store.set(request.url, { body: await response.arrayBuffer(), status: response.status, headers: [...response.headers], expires: now + maxAge * 1000 });
    },
    async delete(request: Request) {
      return store.delete(request.url);
    },
  };
  return { cache, puts, advance: (ms: number) => (now += ms) };
}

/** A KV that records reads, can fail them, and holds the versions a save bumps. */
function recordingKv() {
  const reads: string[] = [];
  const store = new Map<string, string>();
  const state = { failing: false };
  return {
    reads,
    store,
    state,
    kv: {
      async get(key: string) {
        reads.push(key);
        if (state.failing) throw new Error("KV GET failed: 429 Too Many Requests");
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    },
  };
}

const MINUTE = 60_000;
let github: ReturnType<typeof fakeGitHub>;
let caches: ReturnType<typeof clockCache>;
let kv: ReturnType<typeof recordingKv>;
const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
const realError = console.error;
const realWarn = console.warn;
beforeEach(() => {
  github = fakeGitHub(FILES);
  caches = clockCache();
  kv = recordingKv();
  globalThis.fetch = github.fetcher;
  (globalThis as { caches?: unknown }).caches = { default: caches.cache };
  // Failures are what these tests are about; their logs aren't.
  console.error = () => {};
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { caches?: unknown }).caches = realCaches;
  console.error = realError;
  console.warn = realWarn;
});

const env = () => ({ RATE_LIMIT_KV: kv.kv, GITHUB_TOKEN: "test-token", GITHUB_OWNER: "o", GITHUB_REPO: "r" });
const data = (game: string, entity: string) => mobileData({ env: env(), request: new Request(`https://athena.example/mobile/data?game=${game}&entity=${entity}`) });
const init = () => mobileInit({ env: env(), request: new Request("https://athena.example/mobile/init") });
/** A save: the version bumped, and the memo's minute over so the data centers see it. */
const bump = (key: string) => {
  kv.store.set(key, `v${kv.store.size + 1}-${Math.random()}`);
  caches.advance(MINUTE);
};
const forget = () => {
  github.calls.length = 0;
  kv.reads.length = 0;
  caches.puts.length = 0;
};

describe("GET /mobile/data: which games it serves", () => {
  it("serves an active game", async () => {
    const res = await data("overwatch", "heroes");
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as unknown[]).length, 2);
  });

  it("refuses a made-up or inactive game with 404, before any KV read, GitHub request or cache entry", async () => {
    await data("overwatch", "heroes");
    forget();
    for (let i = 0; i < 50; i++) assert.equal((await data(`made-up-${i}`, "news")).status, 404);
    assert.equal((await data("marvel-rivals", "heroes")).status, 404);
    assert.deepEqual(kv.reads, []);
    assert.deepEqual(github.calls, []);
    assert.deepEqual(caches.puts, []);
  });

  it("reads the game list at most once a minute in a data center, whatever the slugs", async () => {
    for (let i = 0; i < 20; i++) await data(`made-up-${i}`, "news");
    // categories.json (missing here: the built-in folders) and games.json, once each.
    assert.deepEqual(github.calls.sort(), ["rest data/_meta/categories.json", "rest data/_meta/games.json"]);
    caches.advance(MINUTE);
    await data("made-up-0", "news");
    assert.equal(github.calls.filter((c) => c === "rest data/_meta/games.json").length, 2);
    assert.deepEqual(kv.reads, []);
  });

  it("stops serving a game within a minute of it being deactivated, its stale copy included", async () => {
    assert.equal((await data("overwatch", "news")).status, 200);
    github.files["data/_meta/games.json"] = json({ games: [{ slug: "overwatch", active: false }] });
    assert.equal((await data("overwatch", "news")).status, 200); // this minute's list
    caches.advance(MINUTE);
    assert.equal((await data("overwatch", "news")).status, 404);
    // GitHub down: the list read last still says inactive, so the last good copy stays unserved.
    github.state.down = true;
    bump(mobileDataVersionKey("overwatch", "news"));
    assert.equal((await data("overwatch", "news")).status, 404);
  });

  it("answers 503 when the game list can't be read and none was kept, then waits a minute before asking GitHub again", async () => {
    github.state.down = true;
    const res = await data("overwatch", "heroes");
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Retry-After"), "60");
    forget();
    assert.equal((await data("overwatch", "heroes")).status, 503);
    assert.deepEqual(github.calls, []);
    assert.deepEqual(kv.reads, []);
  });

  it("keeps serving from the list read last while games.json can't be read", async () => {
    await data("overwatch", "heroes");
    github.files["data/_meta/games.json"] = "{ not json";
    caches.advance(MINUTE);
    assert.equal((await data("overwatch", "heroes")).status, 200);
    assert.equal((await data("made-up", "heroes")).status, 404);
  });
});

describe("a payload that can't be built", () => {
  it("is answered with the last complete one, marked X-Stale", async () => {
    const first = await data("overwatch", "heroes");
    const body = await first.text();
    assert.equal(first.headers.get("X-Stale"), null);
    github.state.down = true;
    bump(mobileDataVersionKey("overwatch", "heroes"));
    const res = await data("overwatch", "heroes");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Stale"), "1");
    assert.equal(res.headers.get("X-Incomplete"), null);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal(await res.text(), body);
  });

  it("is still a 500 when no complete payload was built in this data center", async () => {
    await data("overwatch", "heroes"); // the game list, kept
    github.state.down = true;
    bump(mobileDataVersionKey("overwatch", "news"));
    assert.equal((await data("overwatch", "news")).status, 500);
  });

  it("never falls back to a partial payload", async () => {
    const complete = await (await data("overwatch", "heroes")).text();
    github.files["data/overwatch/heroes/baptiste.json"] = "{ broken";
    bump(mobileDataVersionKey("overwatch", "heroes"));
    assert.equal((await data("overwatch", "heroes")).headers.get("X-Incomplete"), "1");
    github.state.down = true;
    bump(mobileDataVersionKey("overwatch", "heroes"));
    const res = await data("overwatch", "heroes");
    assert.equal(res.headers.get("X-Stale"), "1");
    assert.equal(await res.text(), complete);
  });

  it("init: the last complete one too, without the games it lists in a header", async () => {
    const body = await (await init()).text();
    github.state.down = true;
    bump(MOBILE_INIT_VERSION_KEY);
    const res = await init();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Stale"), "1");
    assert.deepEqual([...res.headers.keys()].filter((h) => h.startsWith("x-athena")), []);
    assert.equal(await res.text(), body);
  });

  it("init: not when it lists a game deactivated since", async () => {
    github.files["data/_meta/games.json"] = json({ games: [{ slug: "overwatch" }, { slug: "valorant" }] });
    const listed = (await (await init()).json()) as { games: { slug: string }[] };
    assert.deepEqual(listed.games.map((g) => g.slug), ["overwatch", "valorant"]);
    // Valorant is turned off, and the next build fails (a folder GitHub can't read).
    github.files["data/_meta/games.json"] = json({ games: [{ slug: "overwatch" }, { slug: "valorant", active: false }] });
    github.state.failing.add("data/overwatch/schemas");
    bump(MOBILE_INIT_VERSION_KEY);
    assert.equal((await init()).status, 500);
    // While the same games are active, the stored copy is served.
    github.files["data/_meta/games.json"] = json({ games: [{ slug: "overwatch" }, { slug: "valorant" }] });
    bump(MOBILE_INIT_VERSION_KEY);
    assert.equal((await init()).headers.get("X-Stale"), "1");
  });
});

describe("X-Incomplete", () => {
  it("counts the records left out, on the build and on each cached copy, and is absent when nothing is", async () => {
    assert.equal((await data("overwatch", "heroes")).headers.get("X-Incomplete"), null);
    forget();
    github.files["data/overwatch/heroes/ana.json"] = "{ broken";
    github.files["data/overwatch/heroes/baptiste.json"] = "not json either";
    bump(mobileDataVersionKey("overwatch", "heroes"));
    const res = await data("overwatch", "heroes");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Incomplete"), "2");
    assert.deepEqual(await res.json(), []);
    // Kept a minute, not until the next save, and never as the last good copy.
    assert.deepEqual(
      caches.puts.filter(({ key }) => key.includes("entity=heroes")).map(({ cacheControl }) => cacheControl),
      ["public, max-age=60, s-maxage=60"],
    );
    forget();
    const again = await data("overwatch", "heroes");
    assert.equal(again.headers.get("X-Incomplete"), "2");
    assert.deepEqual(github.calls, []);
  });

  it("counts the picture versions as one when the repo tree can't be read", async () => {
    github.state.treeFails = true;
    const res = await data("overwatch", "heroes");
    assert.equal(res.headers.get("X-Incomplete"), "1");
    assert.equal(((await res.json()) as unknown[]).length, 2);
  });

  it("init: counts files left out and an unreadable categories.json", async () => {
    github.files["data/_meta/categories.json"] = "{ broken";
    github.files["data/overwatch/screens/home.json"] = "{ broken";
    const res = await init();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Incomplete"), "2");
  });

  it("is never on a stale copy, nor with X-Stale", async () => {
    await init();
    github.state.down = true;
    bump(MOBILE_INIT_VERSION_KEY);
    const res = await init();
    assert.equal(res.headers.get("X-Stale"), "1");
    assert.equal(res.headers.get("X-Incomplete"), null);
  });
});

describe("a cache version KV can't read", () => {
  const year = (cacheControl: string | null) => /max-age=31536000/.test(cacheControl ?? "");

  it("never caches a payload under a version, nor for long except as the last good copy", async () => {
    kv.state.failing = true;
    for (const res of [await init(), await data("overwatch", "heroes")]) assert.equal(res.status, 200);
    assert.ok(caches.puts.length > 0);
    for (const { key, cacheControl } of caches.puts) {
      assert.doesNotMatch(key, /[?&]v=/, key);
      if (year(cacheControl)) assert.match(key, /\/last-good\//, key);
    }
  });

  it("serves the last complete payload, marked stale, without asking GitHub", async () => {
    const body = await (await data("overwatch", "heroes")).text();
    kv.state.failing = true;
    caches.advance(MINUTE);
    forget();
    const res = await data("overwatch", "heroes");
    assert.equal(res.headers.get("X-Stale"), "1");
    assert.equal(await res.text(), body);
    assert.deepEqual(github.calls.filter((c) => !c.startsWith("rest data/_meta/")), []);
  });

  it("builds once when nothing was kept, then serves that", async () => {
    kv.state.failing = true;
    const first = await data("overwatch", "news");
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("X-Stale"), null);
    forget();
    const second = await data("overwatch", "news");
    assert.equal(second.status, 200);
    assert.deepEqual(github.calls, []);
  });

  it("keeps a partial payload a minute at most", async () => {
    kv.state.failing = true;
    github.files["data/overwatch/news/launch.json"] = "{ broken";
    assert.equal((await data("overwatch", "news")).headers.get("X-Incomplete"), "1");
    forget();
    assert.equal((await data("overwatch", "news")).headers.get("X-Incomplete"), "1");
    assert.equal(github.calls.length, 0);
    caches.advance(MINUTE);
    await data("overwatch", "news");
    assert.ok(github.calls.includes("graphql"));
  });

  it("is tried again on the next request, and the versioned cache is used once it reads", async () => {
    kv.state.failing = true;
    await data("overwatch", "heroes");
    kv.state.failing = false;
    forget();
    await data("overwatch", "heroes");
    assert.deepEqual(kv.reads.sort(), [MOBILE_ASSETS_VERSION_KEY, mobileDataVersionKey("overwatch", "heroes")].sort());
    assert.ok(caches.puts.some(({ key }) => /[?&]v=0&a=0$/.test(key)));
  });
});
