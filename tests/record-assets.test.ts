import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createSessionToken } from "../app/lib/session";
import {
  deletionConflict,
  deletionPlan,
  deletionRequest,
  dependents,
  isOwnedAsset,
  recordAssetDir,
  scanRecords,
  type DeletionRequest,
  type ScannedRecord,
} from "../app/lib/record-assets";

// The handler is type-checked with Workers' types (functions/tsconfig.json);
// a computed specifier keeps it out of the app's DOM-typed program.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const DIR = recordAssetDir("overwatch", "heroes", "ana");
const file = (name: string, sha = `sha-${name}`) => ({ path: `${DIR}${name}`, sha });
const FILES = [file("portrait_2d.webp"), file("portrait_3d.webp"), file("abilities/sleep-dart.png"), file("minor_perks/groggy.png")];
const SELF = { folder: "heroes", id: "ana" };
const record = (folder: string, id: string, content: unknown): ScannedRecord => ({ folder, id, content });

describe("a record's own pictures", () => {
  it("are the files under its folder, and only those", () => {
    assert.equal(DIR, "public/assets/overwatch/heroes/ana/");
    assert.ok(isOwnedAsset(`${DIR}portrait_2d.webp`, DIR));
    assert.ok(isOwnedAsset(`${DIR}abilities/sleep-dart.png`, DIR));
    assert.ok(isOwnedAsset(`${recordAssetDir("overwatch", "patches", "patch-2026.10")}notes.png`, recordAssetDir("overwatch", "patches", "patch-2026.10")));
    for (const outside of [
      "public/assets/overwatch/heroes/ana-2/portrait.webp",
      "public/assets/overwatch/heroes/ana.webp",
      "public/assets/overwatch/heroes/portrait.webp",
      `${DIR}../baptiste/portrait.webp`,
      `${DIR}`,
      `${DIR}a//b.png`,
      "public/assets/games/overwatch-icon.webp",
    ]) {
      assert.equal(isOwnedAsset(outside, DIR), false, outside);
    }
  });
});

describe("which pictures a deleted record takes along", () => {
  it("all of them when no other record points at them", () => {
    const plan = deletionPlan(DIR, FILES, [record("heroes", "ana", { portrait: { "2d": "/api/assets/overwatch/heroes/ana/portrait_2d.webp" } }), record("heroes", "baptiste", { name: "Baptiste" })], SELF);
    assert.deepEqual(plan.remove, FILES);
    assert.deepEqual(plan.keep, []);
  });

  it("none that another record still points at, in any form", () => {
    const records = [
      record("heroes", "baptiste", { portrait: "/api/assets/overwatch/heroes/ana/portrait_2d.webp?v=0123456789ab" }),
      record("screens", "home", { blocks: [{ props: { image: "assets/overwatch/heroes/ana/abilities/sleep-dart.png" } }] }),
      record("news", "n1", { body: "https://athena.example/api/assets/overwatch/heroes/ana/minor%5Fperks/groggy.png#x" }),
    ];
    const plan = deletionPlan(DIR, FILES, records, SELF);
    assert.deepEqual(plan.remove, [file("portrait_3d.webp")]);
    assert.deepEqual(plan.keep.map((k) => [k.path, k.usedBy]), [
      [`${DIR}portrait_2d.webp`, ["heroes/baptiste"]],
      [`${DIR}abilities/sleep-dart.png`, ["screens/home"]],
      [`${DIR}minor_perks/groggy.png`, ["news/n1"]],
    ]);
  });

  it("none of a folder another record names, and nothing of another record's folder", () => {
    assert.deepEqual(deletionPlan(DIR, FILES, [record("screens", "s", { base: "/api/assets/overwatch/heroes/ana/" })], SELF).remove, []);
    const abilities = deletionPlan(DIR, FILES, [record("screens", "s", { base: "/api/assets/overwatch/heroes/ana/abilities/" })], SELF);
    assert.deepEqual(abilities.keep.map((k) => k.path), [`${DIR}abilities/sleep-dart.png`]);
    // ana-2's pictures and a "groggy.png" elsewhere aren't ana's.
    const others = [record("heroes", "ana-2", { icon: "/api/assets/overwatch/heroes/ana-2/abilities/sleep-dart.png" }), record("modes", "m", { icon: "/api/assets/overwatch/modes/m/minor_perks/groggy.png" })];
    assert.deepEqual(deletionPlan(DIR, FILES, others, SELF).remove, FILES);
  });

  it("counts a record of another folder with the same id as any other record", () => {
    const plan = deletionPlan(DIR, FILES, [record("modes", "ana", { icon: "/api/assets/overwatch/heroes/ana/portrait_3d.webp" })], SELF);
    assert.deepEqual(plan.keep.map((k) => k.usedBy), [["modes/ana"]]);
  });
});

describe("what uses a record by its id (4.3)", () => {
  it("is any record holding the id, but not one that merely has the same id in another folder", () => {
    const records = [
      record("heroes", "ana", { id: "ana", name: "Ana" }),
      record("modes", "ana", { id: "ana", name: "A mode called ana" }),
      record("maps", "kings-row", { id: "kings-row", heroes: ["ana"] }),
      record("items", "x", { id: "x", overrides: { ana: { damage: 1 } } }),
      record("modes", "push", { id: "push" }),
    ];
    assert.deepEqual(dependents(records, SELF).map((r) => `${r.folder}/${r.id}`), ["maps/kings-row", "items/x"]);
    // The same-id mode is found when it does use the hero.
    assert.deepEqual(dependents([record("modes", "ana", { id: "ana", hero: "ana" })], SELF).map((r) => r.folder), ["modes"]);
  });

  it("can't be known when a folder fails to load, or loads only partly", async () => {
    const scan = await scanRecords(["heroes", "maps", "news"], async (folder) => {
      if (folder === "maps") throw new Error("GitHub said 502");
      return { items: [{ id: `${folder}-1` }], complete: folder !== "news" };
    });
    assert.deepEqual(scan.unread, ["maps", "news"]);
    assert.deepEqual(scan.records.map((r) => `${r.folder}/${r.id}`), ["heroes/heroes-1", "news/news-1"]);
  });
});

const REQUEST: DeletionRequest = {
  game: "overwatch",
  folder: "heroes",
  id: "ana",
  sha: "sha-record",
  head: "commit-1",
  remove: [file("portrait_3d.webp")],
  keep: [`${DIR}portrait_2d.webp`],
};
const SNAPSHOT = {
  head: "commit-1",
  files: { "data/overwatch/heroes/ana.json": "sha-record", [`${DIR}portrait_2d.webp`]: "sha-portrait_2d.webp", [`${DIR}portrait_3d.webp`]: "sha-portrait_3d.webp" },
};

describe("the server's check of a delete", () => {
  it("accepts only pictures of the record's own folder", () => {
    assert.deepEqual(deletionRequest(REQUEST), REQUEST);
    assert.match(deletionRequest({ ...REQUEST, remove: [{ path: "public/assets/overwatch/heroes/baptiste/portrait_2d.webp", sha: "s" }] }) as string, /isn't in .*ana\//);
    assert.match(deletionRequest({ ...REQUEST, keep: ["data/overwatch/heroes/baptiste.json"] }) as string, /isn't in/);
    assert.match(deletionRequest({ ...REQUEST, remove: [] }) as string, /No pictures/);
    assert.match(deletionRequest({ ...REQUEST, keep: [REQUEST.remove[0].path] }) as string, /twice/);
    assert.match(deletionRequest({ ...REQUEST, folder: "schemas" }) as string, /folder/);
    assert.match(deletionRequest({ ...REQUEST, id: "../ana" }) as string, /id/);
    const enumIcon = { path: "public/assets/overwatch/enums/sub-role/medic.png", sha: "s" };
    assert.equal((deletionRequest({ ...REQUEST, folder: "enums", id: "sub-role", remove: [enumIcon], keep: [] }) as DeletionRequest).folder, "enums");
  });

  it("goes ahead only on exactly what the page showed, at the commit it read", () => {
    assert.equal(deletionConflict(REQUEST, SNAPSHOT), null);
    assert.match(deletionConflict(REQUEST, { ...SNAPSHOT, head: "commit-2" })!, /data changed/);
    assert.match(deletionConflict(REQUEST, { ...SNAPSHOT, files: { ...SNAPSHOT.files, "data/overwatch/heroes/ana.json": "sha-other" } })!, /record changed/);
    assert.match(deletionConflict(REQUEST, { ...SNAPSHOT, files: { ...SNAPSHOT.files, [`${DIR}new.png`]: "s" } })!, /pictures changed/);
    assert.match(deletionConflict(REQUEST, { ...SNAPSHOT, files: { ...SNAPSHOT.files, [`${DIR}portrait_3d.webp`]: "sha-new" } })!, /pictures changed/);
    const { [`${DIR}portrait_2d.webp`]: _gone, ...without } = SNAPSHOT.files;
    assert.match(deletionConflict(REQUEST, { ...SNAPSHOT, files: without })!, /pictures changed/);
  });
});

describe("the API's record delete", () => {
  // GitHub's git data API, the Workers cache and KV, in memory; any other request fails the test.
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let head: string;
  let tree: Record<string, string>;
  let calls: string[];
  let commits: { parents: string[]; deleted: string[] }[];
  let kvPuts: string[];
  let moveBranchBeforePatch: boolean;

  beforeEach(() => {
    head = "commit-1";
    tree = { ...SNAPSHOT.files, "data/overwatch/heroes/baptiste.json": "sha-b", "public/assets/overwatch/heroes/baptiste/p.webp": "sha-bp" };
    calls = [];
    commits = [];
    kvPuts = [];
    moveBranchBeforePatch = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url.pathname}`);
      const route = url.pathname.replace(/^\/repos\/o\/r/, "");
      if (url.hostname !== "api.github.com" || route === url.pathname) throw new Error(`unexpected request to ${url.href}`);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: head } });
      if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: `tree-of-${route.split("/").pop()}` } });
      if (method === "GET" && route.startsWith("/git/trees/")) return Response.json({ truncated: false, tree: Object.entries(tree).map(([path, sha]) => ({ path, type: "blob", sha })) });
      if (method === "POST" && route === "/git/trees") return Response.json({ sha: "tree-new", deleted: body.tree.map((t: { path: string }) => t.path) });
      if (method === "POST" && route === "/git/commits") {
        commits.push({ parents: body.parents, deleted: [] });
        return Response.json({ sha: "commit-new" });
      }
      if (method === "PATCH" && route === "/git/refs/heads/main") {
        if (moveBranchBeforePatch) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
        head = body.sha;
        return Response.json({ object: { sha: head } });
      }
      throw new Error(`unexpected ${method} ${url.href}`);
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: { async match() {}, async put() {}, async delete() { return true; } } };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  const kv = { async get() { return null; }, async put(key: string) { kvPuts.push(key); } };
  const waits: Promise<unknown>[] = [];
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await api({
      request: new Request(`https://athena.example/api/${path}`, { method, headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits.splice(0));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it("lists the record's own pictures, its sha and the commit they were read at", async () => {
    const res = await call("GET", "data/record-assets?game=overwatch&folder=heroes&id=ana");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { head: "commit-1", sha: "sha-record", files: [file("portrait_2d.webp"), file("portrait_3d.webp")] });
  });

  it("deletes the record and the confirmed pictures in one commit on the commit the page read", async () => {
    const res = await call("POST", "data/delete-record", REQUEST);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0].parents, ["commit-1"]);
    const treePosts = calls.filter((c) => c === "POST /repos/o/r/git/trees");
    assert.equal(treePosts.length, 1);
    assert.equal(head, "commit-new");
    // The pictures' mobile version key is bumped once, whatever their number.
    assert.deepEqual(kvPuts.filter((k) => k.includes("asset")).length, 1);
  });

  it("refuses, without writing, when anything changed since the page read it", async () => {
    head = "commit-2";
    assert.equal((await call("POST", "data/delete-record", REQUEST)).status, 409);
    head = "commit-1";
    tree[`${DIR}new.png`] = "s";
    assert.equal((await call("POST", "data/delete-record", REQUEST)).status, 409);
    assert.equal(commits.length, 0);
  });

  it("reports a branch that moved between the check and the commit as a conflict", async () => {
    moveBranchBeforePatch = true;
    const res = await call("POST", "data/delete-record", REQUEST);
    assert.equal(res.status, 409);
    assert.equal(res.body.conflict, true);
    assert.equal(head, "commit-1");
  });

  it("refuses paths outside the record's folder", async () => {
    const res = await call("POST", "data/delete-record", { ...REQUEST, remove: [{ path: "public/assets/overwatch/heroes/baptiste/p.webp", sha: "sha-bp" }] });
    assert.equal(res.status, 400);
    assert.equal(commits.length, 0);
    assert.ok(!calls.some((c) => c.startsWith("POST")));
  });
});

describe("the API's folder listing", () => {
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  let answers: Record<string, number>;

  beforeEach(() => {
    answers = {};
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const path = decodeURIComponent(url.pathname.replace(/^\/repos\/o\/r\/contents\//, ""));
      if (url.hostname !== "api.github.com") throw new Error(`unexpected request to ${url.href}`);
      const status = answers[path] ?? 200;
      if (status !== 200) return Response.json({ message: "nope" }, { status });
      if (path === "data/overwatch/heroes") return Response.json(["ana", "baptiste"].map((id) => ({ type: "file", name: `${id}.json`, path: `${path}/${id}.json`, sha: id })));
      return Response.json({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify({ id: path.split("/").pop()!.slice(0, -5) })).toString("base64"), sha: "s", path });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const list = async (folder: string) => {
    const response = await api({
      request: new Request(`https://athena.example/api/data/directory?game=overwatch&subpath=${folder}&includeContent=true`, { headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } }),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    return { ids: ((await response.json()) as { id: string }[]).map((r) => r.id), incomplete: response.headers.get("X-Incomplete") };
  };

  it("says how many records it left out, so a check that needs them all knows (4.3)", async () => {
    assert.deepEqual(await list("heroes"), { ids: ["ana", "baptiste"], incomplete: null });
    answers["data/overwatch/heroes/baptiste.json"] = 502;
    assert.deepEqual(await list("heroes"), { ids: ["ana"], incomplete: "1" });
    answers["data/overwatch/heroes"] = 502;
    assert.deepEqual(await list("heroes"), { ids: [], incomplete: "all" });
    // A folder that doesn't exist is simply empty.
    answers["data/overwatch/items"] = 404;
    assert.deepEqual(await list("items"), { ids: [], incomplete: null });
  });
});
