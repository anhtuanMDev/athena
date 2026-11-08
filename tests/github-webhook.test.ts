import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { SAME_KEY_RETRY_MS, bumpVersions, changedPaths, isPushTo, verifyGithubSignature, versionKeysToBump } from "../app/lib/github-webhook";
import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, mobileDataVersionKey } from "../app/lib/mobile-cache-version";
import { DEFAULT_CATEGORIES } from "../app/lib/categories";

const FOLDERS = DEFAULT_CATEGORIES.map((c) => c.folder);
import { onRequestPost, type Env } from "../functions/api/webhooks/github";

const SECRET = "test-webhook-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const push = (commits: unknown, extra: Record<string, unknown> = {}) => ({
  ref: "refs/heads/main",
  repository: { full_name: "anhtuanMDev/zero-backend" },
  commits,
  ...extra,
});

describe("verifyGithubSignature", () => {
  it("accepts GitHub's HMAC of the exact body", async () => {
    assert.equal(await verifyGithubSignature('{"a":1}', sign('{"a":1}'), SECRET), true);
    assert.equal(await verifyGithubSignature("é", sign("é"), SECRET), true);
  });

  it("rejects other bodies, secrets and malformed headers", async () => {
    const body = '{"a":1}';
    for (const header of [sign('{"a":2}'), sign(body, "other"), null, "", "sha1=abc", `sha256=${"z".repeat(64)}`, sign(body).slice(0, -2)]) {
      assert.equal(await verifyGithubSignature(body, header, SECRET), false, String(header));
    }
    assert.equal(await verifyGithubSignature(body, sign(body, ""), ""), false);
  });
});

describe("isPushTo", () => {
  it("matches the data repo's branch only", () => {
    assert.equal(isPushTo(push([]), "anhtuanMDev", "zero-backend", "main"), true);
    assert.equal(isPushTo(push([], { repository: { full_name: "AnhTuanMDev/Zero-Backend" } }), "anhtuanMDev", "zero-backend", "main"), true);
    assert.equal(isPushTo(push([], { ref: "refs/heads/feat/x" }), "anhtuanMDev", "zero-backend", "main"), false);
    assert.equal(isPushTo(push([], { ref: "refs/tags/main" }), "anhtuanMDev", "zero-backend", "main"), false);
    assert.equal(isPushTo(push([], { repository: { full_name: "someone/zero-backend" } }), "anhtuanMDev", "zero-backend", "main"), false);
    assert.equal(isPushTo(push([], { deleted: true }), "anhtuanMDev", "zero-backend", "main"), false);
  });
});

describe("changedPaths and versionKeysToBump", () => {
  it("collects added, modified and removed files across commits, once each", () => {
    const paths = changedPaths(
      push([
        { added: ["data/overwatch/screens/maps.json"], modified: ["data/overwatch/heroes/ana.json"], removed: [] },
        { added: [], modified: ["data/overwatch/screens/maps.json", "README.md"], removed: ["data/overwatch/maps/old.json"] },
      ]),
    );
    assert.deepEqual(paths, ["data/overwatch/screens/maps.json", "data/overwatch/heroes/ana.json", "README.md", "data/overwatch/maps/old.json"]);
    assert.deepEqual(versionKeysToBump(paths, [], FOLDERS), [
      MOBILE_INIT_VERSION_KEY,
      mobileDataVersionKey("overwatch", "heroes"),
      mobileDataVersionKey("overwatch", "maps"),
    ]);
  });

  it("rebuilds the payloads' picture versions when an asset changes", () => {
    const paths = changedPaths(push([{ added: ["public/assets/overwatch/heroes/ana/portrait_2d.webp"], modified: [], removed: [] }]));
    assert.deepEqual(versionKeysToBump(paths, [], FOLDERS), [MOBILE_ASSETS_VERSION_KEY]);
  });

  it("bumps nothing for files the app doesn't read", () => {
    assert.deepEqual(versionKeysToBump(changedPaths(push([{ added: ["docs/x.md"], modified: [], removed: [] }])), ["overwatch"], FOLDERS), []);
  });

  it("can't tell for force pushes, missing file lists or too many commits", () => {
    assert.equal(changedPaths(push([], { forced: true })), undefined);
    assert.equal(changedPaths(push([{ added: [] }])), undefined);
    assert.equal(changedPaths(push("nope")), undefined);
    assert.equal(changedPaths(push(Array.from({ length: 2048 }, () => ({ added: [], modified: [], removed: [] })))), undefined);
  });

  it("names each key once, even when games.json or the categories repeat one", () => {
    const keys = versionKeysToBump(undefined, ["overwatch", "overwatch"], [...FOLDERS, "heroes"]);
    assert.deepEqual(keys, [...new Set(keys)]);
    assert.ok(keys.includes(mobileDataVersionKey("overwatch", "heroes")));
  });

  it("refreshes every payload of every valid game when the files are unknown", () => {
    const keys = versionKeysToBump(undefined, ["overwatch", "../evil", "Bad Slug"], FOLDERS);
    assert.equal(keys[0], MOBILE_INIT_VERSION_KEY);
    assert.ok(keys.includes(mobileDataVersionKey("overwatch", "maps")));
    assert.ok(keys.includes(MOBILE_ASSETS_VERSION_KEY));
    assert.ok(keys.every((key) => key === MOBILE_INIT_VERSION_KEY || key === MOBILE_ASSETS_VERSION_KEY || key.includes(":overwatch:")));
  });
});

describe("bumpVersions", () => {
  /** A KV refusing writes to `refused` keys `times` times each, as KV does a second write to a key within a second (429). */
  const refusing = (refused: string[], times: number) => {
    const writes: string[] = [];
    const left = new Map(refused.map((key) => [key, times]));
    return {
      writes,
      kv: {
        async get() {
          return null;
        },
        async put(key: string) {
          writes.push(key);
          const n = left.get(key) ?? 0;
          if (n > 0) {
            left.set(key, n - 1);
            throw new Error("KV PUT failed: 429 Too Many Requests");
          }
        },
      },
    };
  };
  const quiet = async <T>(run: () => Promise<T>) => {
    const [error, warn] = [console.error, console.warn];
    const logged: string[] = [];
    console.error = console.warn = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    try {
      return { result: await run(), logged };
    } finally {
      [console.error, console.warn] = [error, warn];
    }
  };

  it("writes each key once when KV takes them", async () => {
    const { kv, writes } = refusing([], 0);
    const waits: number[] = [];
    assert.deepEqual(await bumpVersions(kv, ["a", "b"], async (ms) => void waits.push(ms)), []);
    assert.deepEqual(writes, ["a", "b"]);
    assert.deepEqual(waits, []);
  });

  it("tries a refused key once more, a second later, and logs the refusal", async () => {
    const { kv, writes } = refusing(["b"], 1);
    const waits: number[] = [];
    const { result, logged } = await quiet(() => bumpVersions(kv, ["a", "b"], async (ms) => void waits.push(ms)));
    assert.deepEqual(result, []);
    assert.deepEqual(writes, ["a", "b", "b"]);
    assert.deepEqual(waits, [SAME_KEY_RETRY_MS]);
    assert.ok(SAME_KEY_RETRY_MS >= 1000);
    assert.equal(logged.length, 1);
  });

  it("returns the keys still refused, logging each failure", async () => {
    const { kv, writes } = refusing(["b", "c"], 2);
    const { result, logged } = await quiet(() => bumpVersions(kv, ["a", "b", "c"], async () => {}));
    assert.deepEqual(result, ["b", "c"]);
    assert.deepEqual(writes, ["a", "b", "c", "b", "c"]);
    assert.equal(logged.length, 4);
  });
});

describe("POST /api/webhooks/github", () => {
  const kvWith = () => {
    const store = new Map<string, string>();
    return { store, kv: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) } };
  };
  const envWith = (kv: unknown, extra: Partial<Env> = {}) =>
    ({ RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "anhtuanMDev", GITHUB_REPO: "zero-backend", GITHUB_WEBHOOK_SECRET: SECRET, ...extra }) as Env;
  const deliver = (env: Env, body: string, event = "push", signature = sign(body)) =>
    onRequestPost({
      request: new Request("https://athena.example/api/webhooks/github", {
        method: "POST",
        headers: { "X-GitHub-Event": event, "X-Hub-Signature-256": signature, "Content-Type": "application/json" },
        body,
      }),
      env,
    });

  it("refreshes the payloads a signed push touched", async () => {
    const { store, kv } = kvWith();
    const body = JSON.stringify(push([{ added: ["data/overwatch/screens/maps.json"], modified: [], removed: [] }]));
    const res = await deliver(envWith(kv), body);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { refreshed: [MOBILE_INIT_VERSION_KEY] });
    assert.ok(store.has(MOBILE_INIT_VERSION_KEY));
  });

  it("changes nothing for unsigned, misconfigured, foreign or non-push deliveries", async () => {
    const { store, kv } = kvWith();
    const body = JSON.stringify(push([{ added: ["data/overwatch/screens/maps.json"], modified: [], removed: [] }]));
    assert.equal((await deliver(envWith(kv), body, "push", sign(body, "guess"))).status, 401);
    assert.equal((await deliver(envWith(kv, { GITHUB_WEBHOOK_SECRET: "" }), body)).status, 503);
    assert.equal((await deliver(envWith(undefined), body)).status, 503);
    assert.equal((await deliver(envWith(kv), body, "ping")).status, 200);
    assert.equal((await deliver(envWith(kv), body, "issues")).status, 200);
    assert.equal((await deliver(envWith(kv, { GITHUB_BRANCH: "release" }), body)).status, 200);
    assert.equal((await deliver(envWith(kv), "payload=%7B%7D")).status, 400);
    assert.equal((await deliver(envWith(kv), "null")).status, 400);
    const huge = await onRequestPost({
      request: new Request("https://athena.example/api/webhooks/github", { method: "POST", headers: { "Content-Length": String(26 * 1024 * 1024) }, body }),
      env: envWith(kv),
    });
    assert.equal(huge.status, 413);
    assert.equal(store.size, 0);
  });

  it("survives KV refusing a key once (an admin save bumped it a moment before), still refreshing every key", async () => {
    const store = new Map<string, string>();
    let refusals = 1;
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        if (k === MOBILE_INIT_VERSION_KEY && refusals-- > 0) throw new Error("KV PUT failed: 429 Too Many Requests");
        store.set(k, v);
      },
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      const body = JSON.stringify(push([{ added: ["data/overwatch/screens/maps.json", "data/overwatch/heroes/ana.json"], modified: [], removed: [] }]));
      const res = await deliver(envWith(kv), body);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { refreshed: [MOBILE_INIT_VERSION_KEY, mobileDataVersionKey("overwatch", "heroes")] });
      assert.ok(store.has(MOBILE_INIT_VERSION_KEY));
    } finally {
      console.warn = warn;
    }
  });

  it("still bumps the other keys, and fails the delivery for redelivery, when KV keeps refusing one", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        if (k === MOBILE_INIT_VERSION_KEY) throw new Error("KV PUT failed: 429 Too Many Requests");
        store.set(k, v);
      },
    };
    const [error, warn] = [console.error, console.warn];
    console.error = console.warn = () => {};
    try {
      const body = JSON.stringify(push([{ added: ["data/overwatch/screens/maps.json", "data/overwatch/heroes/ana.json"], modified: [], removed: [] }]));
      const res = await deliver(envWith(kv), body);
      assert.equal(res.status, 502);
      const answer = (await res.json()) as { refreshed: string[]; failed: string[]; error: string };
      assert.deepEqual(answer.refreshed, [mobileDataVersionKey("overwatch", "heroes")]);
      assert.deepEqual(answer.failed, [MOBILE_INIT_VERSION_KEY]);
      assert.match(answer.error, /cache_version:mobile_init/);
      assert.deepEqual([...store.keys()], [mobileDataVersionKey("overwatch", "heroes")]);
    } finally {
      [console.error, console.warn] = [error, warn];
    }
  });

  it("still refreshes the screens and pictures, and reports a failure, when games.json can't be read", async () => {
    const { store, kv } = kvWith();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    try {
      const res = await deliver(envWith(kv), JSON.stringify(push([], { forced: true })));
      assert.equal(res.status, 502);
      assert.deepEqual([...store.keys()], [MOBILE_INIT_VERSION_KEY, MOBILE_ASSETS_VERSION_KEY]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
