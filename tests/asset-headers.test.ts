import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSET_CACHE,
  ASSET_GIT_FETCHES_PER_HOUR,
  ASSET_VERSION,
  capGitFetches,
  gitBlobSha,
  serveAsset,
  type AssetCache,
} from "../app/lib/asset-headers";

const PICTURE = new TextEncoder().encode("a webp picture");
const OLD_PICTURE = new TextEncoder().encode("the picture before the upload");

function memoryCache() {
  const entries = new Map<string, Response>();
  const puts: { key: string; cacheControl: string | null }[] = [];
  const cache: AssetCache = {
    async match(key) {
      return entries.get(key)?.clone();
    },
    async put(key, response) {
      puts.push({ key, cacheControl: response.headers.get("Cache-Control") });
      entries.set(key, response);
    },
  };
  return { cache, puts };
}

function memoryKv(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  const ttls: number[] = [];
  const kv = {
    async get(key: string) {
      return entries.get(key) ?? null;
    },
    async put(key: string, value: string, options: { expirationTtl: number }) {
      ttls.push(options.expirationTtl);
      entries.set(key, value);
    },
  };
  return { kv, entries, ttls };
}

const TEN_PAST_TEN = Date.UTC(2026, 10, 1, 10, 10);
const HOUR_KEY = "asset_api_fallback:2026-11-01T10";

/** An upstream serving `bytes`, counting fetches. */
function upstream(bytes: Uint8Array<ArrayBuffer> | null) {
  const calls = { count: 0 };
  return {
    calls,
    fetchAsset: async () => {
      calls.count++;
      return bytes ? new Response(bytes) : new Response("Not Found", { status: 404 });
    },
  };
}

const notAsked = async (): Promise<Response> => {
  throw new Error("GitHub's API shouldn't be asked");
};

const serve = (opts: {
  cache: AssetCache;
  fetchAsset: () => Promise<Response>;
  fetchFromGit?: () => Promise<Response>;
  version?: string;
  ifNoneMatch?: string | null;
}) => serveAsset({ path: "assets/overwatch/heroes/ana/portrait_2d.webp", ifNoneMatch: null, fetchFromGit: notAsked, ...opts });

const VERSIONED_KEY = (version: string) => `https://api.internal/api/assets/overwatch/heroes/ana/portrait_2d.webp?v=${version}`;
const GIT_KEY = "https://api.internal/git/assets/overwatch/heroes/ana/portrait_2d.webp";

describe("serving a versioned picture", () => {
  it("keeps it for good once its bytes match the version", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts } = memoryCache();
    const origin = upstream(PICTURE);
    const first = await serve({ cache, fetchAsset: origin.fetchAsset, version });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.equal(first.headers.get("Content-Type"), "image/webp");
    assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), PICTURE);
    assert.deepEqual(puts, [{ key: VERSIONED_KEY(version), cacheControl: ASSET_CACHE.versioned }]);

    const again = await serve({ cache, fetchAsset: origin.fetchAsset, version });
    assert.equal(again.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.deepEqual(new Uint8Array(await again.arrayBuffer()), PICTURE);
    assert.equal(origin.calls.count, 1);
  });

  // Right after an upload, raw.githubusercontent.com can still serve the old file.
  it("takes the file from GitHub's API when raw's copy is stale, and keeps it once it matches", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts } = memoryCache();
    const raw = upstream(OLD_PICTURE);
    const git = upstream(PICTURE);
    const response = await serve({ cache, fetchAsset: raw.fetchAsset, fetchFromGit: git.fetchAsset, version });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PICTURE);
    assert.deepEqual(puts, [
      { key: GIT_KEY, cacheControl: ASSET_CACHE.fromGit },
      { key: VERSIONED_KEY(version), cacheControl: ASSET_CACHE.versioned },
    ]);

    const again = await serve({ cache, fetchAsset: raw.fetchAsset, fetchFromGit: git.fetchAsset, version });
    assert.deepEqual(new Uint8Array(await again.arrayBuffer()), PICTURE);
    assert.deepEqual([raw.calls.count, git.calls.count], [1, 1]);
  });

  it("fails with 503 and keeps nothing under the URL when GitHub's API doesn't have the bytes either", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts } = memoryCache();
    const git = upstream(OLD_PICTURE);
    for (let i = 0; i < 2; i++) {
      const response = await serve({ cache, fetchAsset: upstream(OLD_PICTURE).fetchAsset, fetchFromGit: git.fetchAsset, version });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
    }
    // Only GitHub's copy is kept, for a minute, so the API is asked once.
    assert.deepEqual(puts, [{ key: GIT_KEY, cacheControl: ASSET_CACHE.fromGit }]);
    assert.equal(git.calls.count, 1);
  });

  it("fails with 503 and keeps nothing when GitHub's API can't be reached or refuses", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const failures = [
      async (): Promise<Response> => {
        throw new TypeError("fetch failed");
      },
      async () => new Response("rate limited", { status: 403 }),
    ];
    for (const fetchFromGit of failures) {
      const { cache, puts } = memoryCache();
      const response = await serve({ cache, fetchAsset: upstream(OLD_PICTURE).fetchAsset, fetchFromGit, version });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
      assert.deepEqual(puts, []);
    }
  });

  it("only asks GitHub's API when raw's copy doesn't match, and at most once a minute per file", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const fresh = await serve({ cache: memoryCache().cache, fetchAsset: upstream(PICTURE).fetchAsset, version });
    assert.equal(fresh.status, 200); // notAsked would have thrown

    // Made-up versions can't spend the token's API quota.
    const { cache } = memoryCache();
    const git = upstream(PICTURE);
    for (const madeUp of ["000000000000", "111111111111", "222222222222"]) {
      const response = await serve({ cache, fetchAsset: upstream(PICTURE).fetchAsset, fetchFromGit: git.fetchAsset, version: madeUp });
      assert.equal(response.status, 503);
    }
    assert.equal(git.calls.count, 1);
  });

  it("never answers 2xx with bytes that don't match the version", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const sources = {
      new: () => upstream(PICTURE).fetchAsset,
      old: () => upstream(OLD_PICTURE).fetchAsset,
      missing: () => upstream(null).fetchAsset,
      throws: () => async (): Promise<Response> => {
        throw new TypeError("fetch failed");
      },
      "new, under the cap": () => capGitFetches(memoryKv().kv, upstream(PICTURE).fetchAsset, () => TEN_PAST_TEN),
      "new, over the cap": () =>
        capGitFetches(memoryKv({ [HOUR_KEY]: String(ASSET_GIT_FETCHES_PER_HOUR) }).kv, upstream(PICTURE).fetchAsset, () => TEN_PAST_TEN),
    };
    let checked = 0;
    for (const [rawName, raw] of Object.entries(sources).filter(([name]) => !name.includes("cap"))) {
      for (const [gitName, git] of Object.entries(sources)) {
        const { cache } = memoryCache();
        // Twice, so the second request goes through whatever the first one cached.
        for (let i = 0; i < 2; i++) {
          const response = await serve({ cache, fetchAsset: raw(), fetchFromGit: git(), version }).catch(() => undefined);
          if (!response?.ok) continue;
          const sha = await gitBlobSha(new Uint8Array(await response.arrayBuffer()));
          assert.ok(sha.startsWith(version), `raw ${rawName}, GitHub's API ${gitName}, request ${i + 1}`);
          checked++;
        }
      }
    }
    // Raw fresh (whatever the API does), or raw stale and the API fresh within the cap; twice each.
    assert.equal(checked, 16);
  });

  it("only accepts versions shaped like the payloads write them", () => {
    assert.ok(ASSET_VERSION.test("ce013625030b"));
    for (const value of ["", "CE013625030B", "ce013625030", "ce013625030ba", "../../x", "ce013625030g"]) {
      assert.equal(ASSET_VERSION.test(value), false, value);
    }
  });
});

describe("capping GitHub API fetches", () => {
  it("allows the hourly cap, then answers 503 without calling GitHub", async () => {
    const { kv, entries, ttls } = memoryKv();
    const git = upstream(PICTURE);
    const capped = capGitFetches(kv, git.fetchAsset, () => TEN_PAST_TEN);
    for (let i = 0; i < ASSET_GIT_FETCHES_PER_HOUR; i++) assert.equal((await capped()).status, 200);
    assert.equal(entries.get(HOUR_KEY), String(ASSET_GIT_FETCHES_PER_HOUR));
    assert.ok(ttls.every((ttl) => ttl === 3600));

    assert.equal((await capped()).status, 503);
    // Through serveAsset, a stale picture then fails without asking GitHub.
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const response = await serve({ cache: memoryCache().cache, fetchAsset: upstream(OLD_PICTURE).fetchAsset, fetchFromGit: capped, version });
    assert.equal(response.status, 503);
    assert.equal(git.calls.count, ASSET_GIT_FETCHES_PER_HOUR);
  });

  it("starts counting again in a new hour", async () => {
    const { kv } = memoryKv({ [HOUR_KEY]: String(ASSET_GIT_FETCHES_PER_HOUR) });
    let now = TEN_PAST_TEN;
    const git = upstream(PICTURE);
    const capped = capGitFetches(kv, git.fetchAsset, () => now);
    assert.equal((await capped()).status, 503);
    now = Date.UTC(2026, 10, 1, 11, 0);
    assert.equal((await capped()).status, 200);
    assert.equal(git.calls.count, 1);
  });

  it("answers 503 without calling GitHub when KV is missing or fails", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const git = upstream(PICTURE);
    const failingRead = {
      async get(): Promise<string | null> {
        throw new Error("KV unavailable");
      },
      async put() {},
    };
    const failingWrite = {
      async get() {
        return null;
      },
      async put(): Promise<void> {
        throw new Error("KV PUT failed: 429 Too Many Requests");
      },
    };
    for (const kv of [undefined, failingRead, failingWrite]) {
      const fetchFromGit = capGitFetches(kv, git.fetchAsset);
      const response = await serve({ cache: memoryCache().cache, fetchAsset: upstream(OLD_PICTURE).fetchAsset, fetchFromGit, version });
      assert.equal(response.status, 503);
    }
    assert.equal(git.calls.count, 0);
  });
});

describe("serving a plain picture path", () => {
  it("has browsers check back each time, answering 304 when nothing changed", async () => {
    const { cache, puts } = memoryCache();
    const origin = upstream(PICTURE);
    const first = await serve({ cache, fetchAsset: origin.fetchAsset });
    const etag = first.headers.get("ETag");
    assert.equal(etag, `"${await gitBlobSha(PICTURE)}"`);
    assert.equal(first.headers.get("Cache-Control"), ASSET_CACHE.revalidate);
    assert.deepEqual(puts, [{ key: "https://api.internal/api/assets/overwatch/heroes/ana/portrait_2d.webp", cacheControl: ASSET_CACHE.edge }]);

    const unchanged = await serve({ cache, fetchAsset: origin.fetchAsset, ifNoneMatch: etag });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.body, null);
    const other = await serve({ cache, fetchAsset: origin.fetchAsset, ifNoneMatch: '"something else"' });
    assert.equal(other.status, 200);
    assert.equal(origin.calls.count, 1);
  });

  it("answers 304 on a cache miss too, and 404 without caching a missing file", async () => {
    const etag = `"${await gitBlobSha(PICTURE)}"`;
    const revalidated = await serve({ cache: memoryCache().cache, fetchAsset: upstream(PICTURE).fetchAsset, ifNoneMatch: etag });
    assert.equal(revalidated.status, 304);

    const { cache, puts } = memoryCache();
    const missing = await serve({ cache, fetchAsset: upstream(null).fetchAsset, version: "ce013625030b" });
    assert.equal(missing.status, 404);
    assert.deepEqual(puts, []);
  });
});
