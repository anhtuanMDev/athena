import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ASSET_CACHE, ASSET_SEEN_SECONDS, ASSET_VERSION, assetSeenKey, gitBlobSha, serveAsset, type AssetCache } from "../app/lib/asset-headers";

const PICTURE = new TextEncoder().encode("a webp picture");
const OLD_PICTURE = new TextEncoder().encode("the picture before the upload");

/** caches.default with a clock: an entry lives for its max-age. `puts` lists the pictures kept; `seen` what each fetch recorded. */
function memoryCache() {
  let now = 0;
  const entries = new Map<string, { response: Response; expires: number }>();
  const puts: { key: string; cacheControl: string | null }[] = [];
  const seen: { key: string; cacheControl: string | null }[] = [];
  const cache: AssetCache = {
    async match(key) {
      const entry = entries.get(key);
      return entry && entry.expires > now ? entry.response.clone() : undefined;
    },
    async put(key, response) {
      const cacheControl = response.headers.get("Cache-Control");
      (key.startsWith("https://api.internal/asset-seen/") ? seen : puts).push({ key, cacheControl });
      const maxAge = Number(/max-age=(\d+)/.exec(cacheControl ?? "")?.[1] ?? 0);
      entries.set(key, { response, expires: now + maxAge * 1000 });
    },
  };
  return { cache, puts, seen, advance: (seconds: number) => (now += seconds * 1000) };
}

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

const serve = (opts: { cache: AssetCache; fetchAsset: () => Promise<Response>; version?: string; ifNoneMatch?: string | null }) =>
  serveAsset({ path: "assets/overwatch/heroes/ana/portrait_2d.webp", ifNoneMatch: null, ...opts });

const VERSIONED_KEY = (version: string) => `https://api.internal/api/assets/overwatch/heroes/ana/portrait_2d.webp?v=${version}`;
const SEEN = { key: assetSeenKey("assets/overwatch/heroes/ana/portrait_2d.webp"), cacheControl: `max-age=${ASSET_SEEN_SECONDS}` };

describe("serving a versioned picture", () => {
  it("keeps it for good once its bytes match the version", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts, seen } = memoryCache();
    const origin = upstream(PICTURE);
    const first = await serve({ cache, fetchAsset: origin.fetchAsset, version });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.equal(first.headers.get("Content-Type"), "image/webp");
    assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), PICTURE);
    assert.deepEqual(puts, [{ key: VERSIONED_KEY(version), cacheControl: ASSET_CACHE.versioned }]);
    assert.deepEqual(seen, [SEEN]);

    const again = await serve({ cache, fetchAsset: origin.fetchAsset, version });
    assert.equal(again.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.deepEqual(new Uint8Array(await again.arrayBuffer()), PICTURE);
    assert.equal(origin.calls.count, 1);
  });

  // Right after a picture is replaced, raw.githubusercontent.com can still serve the old file.
  it("answers 503, never kept, while the bytes don't match the version, fetching them again a minute later", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts, seen, advance } = memoryCache();
    const stale = upstream(OLD_PICTURE);
    for (let i = 0; i < 3; i++) {
      const response = await serve({ cache, fetchAsset: stale.fetchAsset, version });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
    }
    assert.deepEqual(puts, []);
    // One fetch a minute, however often the app asks.
    assert.equal(stale.calls.count, 1);
    assert.deepEqual(seen, [SEEN]);

    // Once raw serves the new file, it's verified and kept.
    advance(ASSET_SEEN_SECONDS);
    const fresh = await serve({ cache, fetchAsset: upstream(PICTURE).fetchAsset, version });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.deepEqual(puts, [{ key: VERSIONED_KEY(version), cacheControl: ASSET_CACHE.versioned }]);
  });

  it("refuses, without fetching, any version that isn't what the path served within the minute", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, advance } = memoryCache();
    const origin = upstream(PICTURE);
    // A plain request reads the file, and with it its hash.
    assert.equal((await serve({ cache, fetchAsset: origin.fetchAsset })).status, 200);
    for (let i = 0; i < 20; i++) {
      const madeUp = (BigInt("0x" + version) + BigInt(i + 1)).toString(16).padStart(12, "0").slice(-12);
      const response = await serve({ cache, fetchAsset: origin.fetchAsset, version: madeUp });
      assert.equal(response.status, 503, madeUp);
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
    }
    assert.equal(origin.calls.count, 1);
    // The version it did serve is fetched, checked and kept.
    assert.equal((await serve({ cache, fetchAsset: origin.fetchAsset, version })).status, 200);
    assert.equal(origin.calls.count, 2);
    // A minute on, an unknown version is fetched again (the file may have been replaced).
    advance(ASSET_SEEN_SECONDS);
    assert.equal((await serve({ cache, fetchAsset: origin.fetchAsset, version: "000000000000" })).status, 503);
    assert.equal(origin.calls.count, 3);
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
    };
    let checked = 0;
    // Every pair of upstream answers through one cache, so the second request
    // also goes through whatever the first one kept.
    for (const [firstName, first] of Object.entries(sources)) {
      for (const [secondName, second] of Object.entries(sources)) {
        const { cache } = memoryCache();
        for (const [i, fetchAsset] of [first(), second()].entries()) {
          const response = await serve({ cache, fetchAsset, version }).catch(() => undefined);
          if (!response?.ok) continue;
          const sha = await gitBlobSha(new Uint8Array(await response.arrayBuffer()));
          assert.ok(sha.startsWith(version), `${firstName} then ${secondName}, request ${i + 1}`);
          checked++;
        }
      }
    }
    // The fresh file first (then kept, whatever comes next: 4 × 2), or second
    // after a fetch that failed outright (1). After the old file or a 404, the
    // path's record refuses the version for a minute without fetching.
    assert.equal(checked, 9);
  });

  it("only accepts versions shaped like the payloads write them", () => {
    assert.ok(ASSET_VERSION.test("ce013625030b"));
    for (const value of ["", "CE013625030B", "ce013625030", "ce013625030ba", "../../x", "ce013625030g"]) {
      assert.equal(ASSET_VERSION.test(value), false, value);
    }
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

  it("answers 304 on a cache miss too", async () => {
    const etag = `"${await gitBlobSha(PICTURE)}"`;
    const revalidated = await serve({ cache: memoryCache().cache, fetchAsset: upstream(PICTURE).fetchAsset, ifNoneMatch: etag });
    assert.equal(revalidated.status, 304);
  });
});

describe("a picture that isn't there", () => {
  it("is a 404 for a minute, whatever the version, without fetching it again", async () => {
    const { cache, puts, seen, advance } = memoryCache();
    const missing = upstream(null);
    for (const version of [undefined, "ce013625030b", "000000000000", undefined]) {
      const response = await serve({ cache, fetchAsset: missing.fetchAsset, version });
      assert.equal(response.status, 404, String(version));
    }
    assert.equal(missing.calls.count, 1);
    assert.deepEqual(puts, []);
    assert.deepEqual(seen, [SEEN]);
    advance(ASSET_SEEN_SECONDS);
    assert.equal((await serve({ cache, fetchAsset: missing.fetchAsset })).status, 404);
    assert.equal(missing.calls.count, 2);
  });

  it("is a 503 asked again each time when raw fails some other way", async () => {
    const { cache, puts, seen } = memoryCache();
    let calls = 0;
    const failing = async () => {
      calls++;
      return new Response("Too Many Requests", { status: 429 });
    };
    for (const version of [undefined, "ce013625030b"]) {
      const response = await serve({ cache, fetchAsset: failing, version });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
    }
    assert.equal(calls, 2);
    assert.deepEqual([puts, seen], [[], []]);
  });
});
