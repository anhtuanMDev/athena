import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ASSET_CACHE, ASSET_VERSION, gitBlobSha, serveAsset, type AssetCache } from "../app/lib/asset-headers";

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

  // Right after a picture is replaced, raw.githubusercontent.com can still serve the old file.
  it("answers 503 and keeps nothing while the bytes don't match the version", async () => {
    const version = (await gitBlobSha(PICTURE)).slice(0, 12);
    const { cache, puts } = memoryCache();
    const stale = upstream(OLD_PICTURE);
    for (let i = 0; i < 2; i++) {
      const response = await serve({ cache, fetchAsset: stale.fetchAsset, version });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.equal(response.headers.get("Cache-Control"), ASSET_CACHE.unavailable);
    }
    assert.deepEqual(puts, []);
    assert.equal(stale.calls.count, 2);

    // Once raw serves the new file, it's verified and kept.
    const fresh = await serve({ cache, fetchAsset: upstream(PICTURE).fetchAsset, version });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("Cache-Control"), ASSET_CACHE.versioned);
    assert.deepEqual(puts, [{ key: VERSIONED_KEY(version), cacheControl: ASSET_CACHE.versioned }]);
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
    // The fresh file first (then kept, whatever comes next: 4 × 2), or second (3).
    assert.equal(checked, 11);
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
