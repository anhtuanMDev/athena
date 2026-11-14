import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createSessionToken } from "../app/lib/session";
import { listSummary } from "../app/lib/record-columns";
import { directoryPath, entityListKey } from "../app/lib/listing";
import { filledHeroes } from "./fixtures/filled-heroes";

// GET /api/data/directory with shape=summary: each record as its list shows
// it, so a list of 80 filled-in heroes is 158 KB instead of 1.7 MB.

const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const SECRET = "test-session-secret";
const ANA = {
  id: "ana",
  name: "Ana",
  schema_id: "hero-hero",
  health: 250,
  retired: false,
  nickname: null,
  tags: ["sniper", "support"],
  portrait: { "2d": "/api/assets/overwatch/heroes/ana/2d.webp", "3d": "/api/assets/overwatch/heroes/ana/3d.webp" },
  abilities: [{ id: "sleep-dart", name: "Sleep Dart" }],
  stats: { hp: 250, armor: 0 },
  kit: [],
};
const FILES: Record<string, string> = {
  "data/overwatch/heroes/ana.json": JSON.stringify(ANA),
  "data/overwatch/heroes/baptiste.json": JSON.stringify({ id: "baptiste", name: "Baptiste" }),
};

describe("a folder listed as summaries", () => {
  const realFetch = globalThis.fetch;
  let files: Record<string, string>;
  beforeEach(() => {
    files = { ...FILES };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname !== "/graphql") throw new Error(`unexpected request to ${url.href}`);
      const { variables } = JSON.parse(String(init!.body)) as { variables: Record<string, string> };
      const dir = variables.p0.slice(variables.p0.indexOf(":") + 1);
      const entries = Object.entries(files)
        .filter(([path]) => path.startsWith(`${dir}/`))
        .map(([path, text]) => ({
          name: path.slice(dir.length + 1),
          type: "blob",
          mode: 33188,
          object: { oid: createHash("sha1").update(text).digest("hex"), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text },
        }));
      return Response.json({ data: { repository: { p0: entries.length ? { entries } : null } } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const get = async (query: string) => {
    const response = await api({
      request: new Request(`https://athena.example/api/${query}`, { headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } }),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    const text = await response.text();
    return { status: response.status, body: JSON.parse(text || "null") as unknown, text, incomplete: response.headers.get("X-Incomplete") };
  };

  it("gives each record's scalars, lists of scalars and picture variants, without its lists of objects", async () => {
    const res = await get(directoryPath("overwatch", "heroes", { includeContent: true, shape: "summary" }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [
      { id: "ana", name: "Ana", schema_id: "hero-hero", health: 250, retired: false, nickname: null, tags: ["sniper", "support"], portrait: ANA.portrait, kit: [] },
      { id: "baptiste", name: "Baptiste" },
    ]);
    assert.equal(res.incomplete, null);
  });

  it("is a tenth of 80 filled-in heroes", async () => {
    files = filledHeroes(80).files;
    const whole = await get(directoryPath("overwatch", "heroes", { includeContent: true }));
    const summaries = await get(directoryPath("overwatch", "heroes", { includeContent: true, shape: "summary" }));
    assert.equal((summaries.body as unknown[]).length, 80);
    assert.ok(summaries.text.length * 10 < whole.text.length, `${summaries.text.length} bytes against ${whole.text.length}`);
  });

  it("counts the records left out in X-Incomplete, as the whole listing does", async () => {
    files["data/overwatch/heroes/broken.json"] = "{ not json";
    files["data/overwatch/heroes/empty.json"] = "null";
    const realError = console.error;
    console.error = () => {};
    try {
      const summaries = await get(directoryPath("overwatch", "heroes", { includeContent: true, shape: "summary" }));
      const whole = await get(directoryPath("overwatch", "heroes", { includeContent: true }));
      assert.deepEqual([summaries.incomplete, whole.incomplete], ["2", "2"]);
      assert.equal((summaries.body as unknown[]).length, 2);
    } finally {
      console.error = realError;
    }
  });

  it("leaves keysOnly as it was, and refuses another shape or both at once", async () => {
    const keys = await get(directoryPath("overwatch", "heroes", { includeContent: true, keysOnly: ["id", "abilities"] }));
    assert.deepEqual(keys.body, [{ id: "ana", abilities: ANA.abilities }, { id: "baptiste" }]);
    assert.equal((await get("data/directory?game=overwatch&subpath=heroes&includeContent=true&shape=whole")).status, 400);
    assert.equal((await get("data/directory?game=overwatch&subpath=heroes&includeContent=true&shape=summary&keysOnly=id")).status, 400);
  });
});

describe("a record's summary", () => {
  it("keeps what a list's cells and pictures read, and leaves a value that isn't a record as it is", () => {
    assert.deepEqual(listSummary(ANA), { id: "ana", name: "Ana", schema_id: "hero-hero", health: 250, retired: false, nickname: null, tags: ["sniper", "support"], portrait: ANA.portrait, kit: [] });
    assert.deepEqual(listSummary({ mixed: ["a", { b: 1 }], icon: { main: "/x.png", size: 2 }, enumIds: ["tank", null] }), { enumIds: ["tank", null] });
    for (const value of [null, 0, "text", [1, 2]]) assert.deepEqual(listSummary(value), value);
  });
});

describe("the admin's listing requests", () => {
  it("ask for the same paths as before, and for summaries by shape", () => {
    assert.equal(directoryPath("over watch", "heroes"), "data/directory?game=over%20watch&subpath=heroes");
    assert.equal(directoryPath("ow", "schemas", { includeContent: true, keysOnly: ["category", "fields"] }), "data/directory?game=ow&subpath=schemas&includeContent=true&keysOnly=category%2Cfields");
    assert.equal(directoryPath("ow", "heroes", { includeContent: true, shape: "summary" }), "data/directory?game=ow&subpath=heroes&includeContent=true&shape=summary");
  });

  it("keep summaries apart from whole records in the page's cache", () => {
    assert.equal(entityListKey("ow", "heroes"), "ow-heroes-list");
    assert.notEqual(entityListKey("ow", "heroes", "summary"), entityListKey("ow", "heroes"));
  });
});
