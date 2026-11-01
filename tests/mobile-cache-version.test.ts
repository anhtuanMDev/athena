import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  MOBILE_ASSETS_VERSION_KEY,
  MOBILE_INIT_VERSION_KEY,
  VERSION_MEMO_SECONDS,
  bumpCacheVersion,
  mobileDataVersionKey,
  mobileVersionKeyForPath,
} from "../app/lib/mobile-cache-version";
import { onRequestPost as githubWebhook, type Env as WebhookEnv } from "../functions/api/webhooks/github";
import { onRequest as mobileData } from "../functions/mobile/data";
import { onRequest as mobileInit } from "../functions/mobile/init";

/** A KV namespace that records every read and write. */
function recordingKv(failReads = false) {
  const reads: string[] = [];
  const writes: string[] = [];
  const store = new Map<string, string>();
  const kv = {
    async get(key: string) {
      reads.push(key);
      if (failReads) throw new Error("KV unavailable");
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      writes.push(key);
      store.set(key, value);
    },
  };
  return { kv, reads, writes };
}

/**
 * caches.default with a clock: memo entries live for their max-age, and every
 * payload lookup is a hit, so nothing reaches GitHub.
 */
function fakeCaches() {
  let now = 0;
  const memo = new Map<string, { body: string; expires: number }>();
  const payloadKeys: string[] = [];
  const cache = {
    async match(request: Request) {
      if (request.url.includes("/cache-version/")) {
        const entry = memo.get(request.url);
        return entry && entry.expires > now ? new Response(entry.body) : undefined;
      }
      // The category folders /mobile/data serves, kept like the versions.
      if (request.url.endsWith("/mobile/category-folders")) return new Response(JSON.stringify(["heroes", "maps", "modes"]));
      payloadKeys.push(request.url);
      return new Response("[]");
    },
    async put(request: Request, response: Response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 0);
      memo.set(request.url, { body: await response.text(), expires: now + maxAge * 1000 });
    },
  };
  return { cache, payloadKeys, advance: (ms: number) => (now += ms) };
}

const countBy = (keys: string[]) => keys.reduce<Record<string, number>>((counts, key) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }), {});
const request = (kv: unknown, path: string) => ({ env: { RATE_LIMIT_KV: kv }, request: new Request(`https://athena.example${path}`) });
const init = (kv: unknown) => mobileInit(request(kv, "/mobile/init"));
const list = (kv: unknown, entity: string) => mobileData(request(kv, `/mobile/data?game=overwatch&entity=${entity}`));

describe("KV reads for mobile requests", () => {
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let fake: ReturnType<typeof fakeCaches>;
  beforeEach(() => {
    fake = fakeCaches();
    (globalThis as { caches?: unknown }).caches = { default: fake.cache };
  });
  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  it("are one per version key in a data center within the memo's minute, however many requests", async () => {
    const { kv, reads } = recordingKv();
    const lists = ["heroes", "maps", "modes"];
    for (let i = 0; i < 100; i++) {
      const res = i % 4 === 0 ? await init(kv) : await list(kv, lists[i % 3]);
      assert.equal(res.status, 200);
    }
    assert.deepEqual(countBy(reads), {
      [MOBILE_INIT_VERSION_KEY]: 1,
      [MOBILE_ASSETS_VERSION_KEY]: 1,
      [mobileDataVersionKey("overwatch", "heroes")]: 1,
      [mobileDataVersionKey("overwatch", "maps")]: 1,
      [mobileDataVersionKey("overwatch", "modes")]: 1,
    });
  });

  it("happen again once the memo expires, which is when a bump shows", async () => {
    const { kv, reads } = recordingKv();
    await init(kv);
    await bumpCacheVersion(kv, MOBILE_INIT_VERSION_KEY);
    fake.advance(VERSION_MEMO_SECONDS * 1000 - 1);
    await init(kv);
    assert.equal(reads.length, 2); // init and assets, once
    assert.match(fake.payloadKeys.at(-1)!, /init_v4\?v=0&/); // still the memoized version

    fake.advance(1);
    await init(kv);
    assert.deepEqual(reads.slice(2), [MOBILE_INIT_VERSION_KEY, MOBILE_ASSETS_VERSION_KEY]);
    assert.doesNotMatch(fake.payloadKeys.at(-1)!, /init_v4\?v=0&/);
  });

  it("aren't memoized when KV fails, so the next request tries again", async () => {
    const { kv, reads } = recordingKv(true);
    const logError = console.error;
    console.error = () => {};
    try {
      await init(kv);
      await init(kv);
    } finally {
      console.error = logError;
    }
    assert.deepEqual(countBy(reads), { [MOBILE_INIT_VERSION_KEY]: 2, [MOBILE_ASSETS_VERSION_KEY]: 2 });
  });

  it("don't happen for a request that is refused", async () => {
    const { kv, reads } = recordingKv();
    assert.equal((await list(kv, "cron_jobs")).status, 400);
    assert.deepEqual(reads, []);
  });
});

describe("KV writes for an asset change", () => {
  it("are one: the assets version, from the admin save or the webhook", async () => {
    assert.equal(mobileVersionKeyForPath("public/assets/overwatch/heroes/ana/portrait_2d.webp"), MOBILE_ASSETS_VERSION_KEY);

    const { kv, reads, writes } = recordingKv();
    const secret = "test-webhook-secret";
    const body = JSON.stringify({
      ref: "refs/heads/main",
      repository: { full_name: "anhtuanMDev/zero-backend" },
      commits: [{ added: ["public/assets/overwatch/heroes/ana/portrait_2d.webp", "public/assets/overwatch/heroes/ana/icon.webp"], modified: [], removed: [] }],
    });
    const env = { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "anhtuanMDev", GITHUB_REPO: "zero-backend", GITHUB_WEBHOOK_SECRET: secret } as WebhookEnv;
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const res = await githubWebhook({
      request: new Request("https://athena.example/api/webhooks/github", {
        method: "POST",
        headers: { "X-GitHub-Event": "push", "X-Hub-Signature-256": signature, "Content-Type": "application/json" },
        body,
      }),
      env,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(writes, [MOBILE_ASSETS_VERSION_KEY]);
    assert.deepEqual(reads, []);
  });
});
