import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createSessionToken } from "../app/lib/session";

// GET /api/data/folders: several folders of a game in one request, which the
// server reads with one GitHub GraphQL query (HeroesList: the schemas and enums).

const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const SECRET = "test-session-secret";
const FILES: Record<string, unknown> = {
  "data/overwatch/schemas/hero-hero.json": { id: "hero-hero", category: "hero", fields: [] },
  "data/overwatch/schemas/map-base.json": { id: "map-base", category: "map", fields: [] },
  "data/overwatch/enums/role.json": { id: "role", options: [{ id: "tank", name: "Tank" }] },
};

describe("the API's reading of several folders at once", () => {
  const realFetch = globalThis.fetch;
  let calls: string[];
  let graphql: boolean;
  let broken: Set<string>;

  beforeEach(() => {
    calls = [];
    graphql = true;
    broken = new Set();
    const text = (path: string) => (broken.has(path) ? "{ not json" : JSON.stringify(FILES[path]));
    const blob = (path: string) => {
      const t = text(path);
      return { oid: createHash("sha1").update(t).digest("hex"), byteSize: Buffer.byteLength(t), isBinary: false, isTruncated: false, text: t };
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "api.github.com") throw new Error(`unexpected request to ${url.href}`);
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/graphql") {
        if (!graphql) return Response.json({ message: "Bad credentials" }, { status: 401 });
        const { variables } = JSON.parse(String(init!.body));
        const repository: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(variables as Record<string, string>)) {
          if (!/^p\d+$/.test(name)) continue;
          const dir = value.slice(value.indexOf(":") + 1);
          const names = Object.keys(FILES).filter((p) => p.startsWith(`${dir}/`));
          repository[name] = names.length === 0 ? null : { entries: names.map((p) => ({ name: p.slice(dir.length + 1), type: "blob", mode: 33188, object: blob(p) })) };
        }
        return Response.json({ data: { repository } });
      }
      const path = decodeURIComponent(url.pathname.replace(/^\/repos\/o\/r\/contents\//, ""));
      if (path in FILES) return Response.json({ type: "file", encoding: "base64", content: Buffer.from(text(path)).toString("base64"), sha: "s", path });
      const names = Object.keys(FILES).filter((p) => p.startsWith(`${path}/`));
      if (names.length === 0) return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(names.map((p) => ({ type: "file", name: p.slice(path.length + 1), path: p, sha: "s" })));
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const get = async (query: string, signedIn = true) => {
    const response = await api({
      request: new Request(`https://athena.example/api/data/folders?${query}`, { headers: signedIn ? { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } : {} }),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    // An unsafe path is refused with an empty 400 (assertSafeFilePath).
    const body = (await response.text()) || "null";
    return { status: response.status, body: JSON.parse(body) as Record<string, { id: string }[]>, incomplete: response.headers.get("X-Incomplete") };
  };

  it("gives each folder's records, read in one GraphQL request", async () => {
    const res = await get("game=overwatch&subpaths=schemas,enums");
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ["schemas", "enums"]);
    assert.deepEqual(res.body.schemas.map((s) => s.id), ["hero-hero", "map-base"]);
    assert.deepEqual(res.body.enums.map((e) => e.id), ["role"]);
    assert.equal(res.incomplete, null);
    assert.deepEqual(calls, ["POST /graphql"]);
  });

  it("reads through REST when GraphQL can't, and says what it left out", async () => {
    graphql = false;
    broken.add("data/overwatch/enums/role.json");
    const res = await get("game=overwatch&subpaths=schemas,enums,items");
    assert.deepEqual(res.body.schemas.map((s) => s.id), ["hero-hero", "map-base"]);
    assert.deepEqual(res.body.enums, []);
    // A folder that doesn't exist is empty, as data/directory has it.
    assert.deepEqual(res.body.items, []);
    assert.equal(res.incomplete, "1");
  });

  it("is for signed-in admins only, and only for a game's own folders, at most 4", async () => {
    assert.equal((await get("game=overwatch&subpaths=schemas", false)).status, 401);
    for (const query of [
      "game=overwatch",
      "subpaths=schemas",
      "game=overwatch&subpaths=schemas,enums,screens,syncs,news",
      "game=overwatch&subpaths=../_meta",
      "game=..&subpaths=schemas",
      "game=overwatch&subpaths=schemas,schemas",
      "game=overwatch&subpaths=schemas,",
    ]) {
      assert.equal((await get(query)).status, 400, query);
    }
    assert.deepEqual(calls, []);
  });
});
