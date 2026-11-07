import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createSessionToken } from "../app/lib/session";
import { droppedAssets, pruneNote, prunePlan, pruneRequest, recordAssetDir, type PruneRequest, type ScannedRecord } from "../app/lib/record-assets";

// A save that replaces a record's picture under another name (portrait_2d.webp
// by portrait_2d.png), drops a picture, or renames an ability, left the old file
// in public/assets for good. After the save, the editor names the record's own
// files the save stopped pointing at; the server deletes those nothing uses.

const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const DIR = recordAssetDir("overwatch", "heroes", "ana");
const url = (name: string) => `/api/assets/overwatch/heroes/ana/${name}`;
const record = (folder: string, id: string, content: unknown): ScannedRecord => ({ folder, id, content });

describe("what a save leaves behind", () => {
  it("is each file of the record's own folder it pointed at and no longer does", () => {
    const stored = {
      portrait: { "2d": url("portrait_2d.webp"), "3d": url("portrait_3d.webp") },
      abilities: [{ id: "sleep-dart", icon: url("abilities/sleep-dart.png") }, { id: "nano", icon: url("abilities/nano.png") }],
      icon: url("icon.png"),
    };
    const saved = {
      // Replaced under another extension, and one key kept as it was.
      portrait: { "2d": url("portrait_2d.png"), "3d": url("portrait_3d.webp") },
      // An ability renamed, one removed.
      abilities: [{ id: "sleep-dart-2", icon: url("abilities/sleep-dart-2.png") }],
      // A lone icon now keyed.
      icon: { main: url("icon_main.png") },
    };
    assert.deepEqual(droppedAssets(stored, saved, DIR).sort(), [`${DIR}abilities/nano.png`, `${DIR}abilities/sleep-dart.png`, `${DIR}icon.png`, `${DIR}portrait_2d.webp`]);
  });

  it("reads a picture in any form a record holds it, and keeps one the saved record still names anywhere", () => {
    const stored = { a: `${url("a.webp")}?v=0123456789ab`, b: "assets/overwatch/heroes/ana/b%2Ewebp", c: `https://athena.example${url("c.webp")}#x` };
    assert.deepEqual(droppedAssets(stored, {}, DIR).sort(), [`${DIR}a.webp`, `${DIR}b.webp`, `${DIR}c.webp`]);
    assert.deepEqual(droppedAssets(stored, { notes: `see ${url("a.webp")} and ${url("b.webp")}`, c: url("c.webp") }, DIR), []);
  });

  it("is never a file outside the record's folder, nor one only another game's path resembles", () => {
    const stored = {
      a: "/api/assets/overwatch/heroes/baptiste/p.webp",
      b: "/api/assets/overwatch/heroes/ana-2/p.webp",
      c: "https://example.com/p.webp",
      d: "/api/assets/rival-overwatch/heroes/ana/p.webp",
      e: "/api/assets/overwatch/heroes/ana/",
      f: "/api/assets/overwatch/heroes/ana/../baptiste/p.webp",
    };
    assert.deepEqual(droppedAssets(stored, {}, DIR), []);
  });
});

const REQUEST: PruneRequest = { game: "overwatch", folder: "heroes", id: "ana", paths: [`${DIR}portrait_2d.webp`] };

describe("the server's check of a prune request", () => {
  it("takes only files of the record's own folder", () => {
    assert.deepEqual(pruneRequest(REQUEST), REQUEST);
    for (const paths of [[], ["public/assets/overwatch/heroes/baptiste/p.webp"], [`${DIR}../baptiste/p.webp`], ["data/overwatch/heroes/ana.json"], [DIR], [`${DIR}a.png`, `${DIR}a.png`], "x", Array.from({ length: 51 }, (_, i) => `${DIR}p${i}.png`)]) {
      assert.equal(typeof pruneRequest({ ...REQUEST, paths }), "string", JSON.stringify(paths).slice(0, 80));
    }
    assert.match(pruneRequest({ ...REQUEST, folder: "schemas" }) as string, /folder/);
    assert.match(pruneRequest({ ...REQUEST, folder: "games" }) as string, /folder/);
    assert.match(pruneRequest({ ...REQUEST, id: "../ana" }) as string, /id/);
    assert.match(pruneRequest({ ...REQUEST, game: "Overwatch!" }) as string, /game/);
  });

  it("takes an enum's option icons only in that enum's own folder, public/assets/{game}/enums/{enum}/", () => {
    const enumRequest = { game: "overwatch", folder: "enums", id: "sub-role", paths: ["public/assets/overwatch/enums/sub-role/medic.png"] };
    assert.deepEqual(pruneRequest(enumRequest), enumRequest);
    for (const path of ["public/assets/overwatch/enums/sub-role.png", "public/assets/overwatch/enums/role/medic.png", "public/assets/overwatch/enums/medic.png", "public/assets/overwatch/enums/sub-role/../role/medic.png"]) {
      assert.equal(typeof pruneRequest({ ...enumRequest, paths: [path] }), "string", path);
    }
  });
});

describe("which replaced pictures a save removes", () => {
  const files = [`${DIR}portrait_2d.webp`, `${DIR}abilities/nano.png`, `${DIR}icon.png`].map((path) => ({ path, sha: `sha-${path}` }));
  it("those no record points at, the saved record itself included", () => {
    const records = [
      record("data/overwatch/heroes/ana.json", "ana", { icon: url("icon.png") }),
      record("data/overwatch/screens/home.json", "home", { image: `${url("abilities/nano.png")}?v=1` }),
      record("data/overwatch/heroes/baptiste.json", "baptiste", { portrait: "/api/assets/overwatch/heroes/baptiste/portrait_2d.webp" }),
    ];
    const plan = prunePlan(DIR, files, records);
    assert.deepEqual(plan.remove.map((f) => f.path), [`${DIR}portrait_2d.webp`]);
    assert.deepEqual(plan.keep.map((k) => [k.path, k.usedBy]), [
      [`${DIR}abilities/nano.png`, ["data/overwatch/screens/home.json"]],
      [`${DIR}icon.png`, ["data/overwatch/heroes/ana.json"]],
    ]);
  });

  it("are said, for the editor's message", () => {
    assert.deepEqual(pruneNote({ removed: [`${DIR}portrait_2d.webp`], kept: [] }), { message: "Removed the replaced picture portrait_2d.webp.", kept: false });
    assert.deepEqual(pruneNote({ removed: [], kept: [{ path: `${DIR}a/b.png`, why: "couldn't check what uses it" }] }), { message: "Kept the replaced picture a/b.png: couldn't check what uses it.", kept: true });
    assert.match(pruneNote({ removed: [`${DIR}x.png`, `${DIR}y.png`], kept: [{ path: `${DIR}z.png`, why: "used by data/overwatch/screens/home.json" }] }).message, /^Removed 2 replaced pictures \(x\.png, y\.png\)\. Kept the replaced picture z\.png: used by/);
  });
});

describe("the API's removal of replaced pictures", () => {
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let head: string;
  let files: Map<string, string>;
  let calls: string[];
  let expressions: string[];
  let commits: { parents: string[]; changes: { path: string; sha?: null }[] }[];
  let graphql: boolean;
  let moveBranchBeforePatch: boolean;
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");

  beforeEach(() => {
    head = "commit-1";
    files = new Map([
      ["data/_meta/games.json", JSON.stringify({ games: [{ slug: "overwatch", icon: "/api/assets/games/overwatch-icon.webp" }] })],
      ["data/overwatch/heroes/ana.json", JSON.stringify({ id: "ana", portrait: { "2d": url("portrait_2d.png") }, icon: url("icon.png") })],
      ["data/overwatch/heroes/baptiste.json", JSON.stringify({ id: "baptiste", rival: url("old-rival.webp") })],
      ["data/overwatch/imports/job/draft.json", JSON.stringify({ record: { image: url("draft.webp") } })],
      ["data/overwatch/navigation.json", JSON.stringify({ tabs: [] })],
      [`${DIR}portrait_2d.png`, "png"],
      [`${DIR}portrait_2d.webp`, "webp"],
      [`${DIR}icon.png`, "png"],
      [`${DIR}old-rival.webp`, "webp"],
      [`${DIR}draft.webp`, "webp"],
      ["public/assets/overwatch/heroes/baptiste/p.webp", "webp"],
    ]);
    calls = [];
    expressions = [];
    commits = [];
    graphql = true;
    moveBranchBeforePatch = false;
    const blob = (text: string) => ({ oid: sha(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      if (u.hostname !== "api.github.com") throw new Error(`unexpected request to ${u.href}`);
      calls.push(`${method} ${u.pathname}`);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (u.pathname === "/graphql") {
        if (!graphql) return Response.json({ message: "Bad credentials" }, { status: 401 });
        const repository: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(body.variables as Record<string, string>)) {
          if (!/^p\d+$/.test(name)) continue;
          expressions.push(value);
          const dir = value.slice(value.indexOf(":") + 1);
          const entries = [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"));
          repository[name] = entries.length === 0 ? null : { entries: entries.map((p) => ({ name: p.slice(dir.length + 1), type: "blob", mode: 33188, object: blob(files.get(p)!) })) };
        }
        return Response.json({ data: { repository } });
      }
      const route = u.pathname.replace(/^\/repos\/o\/r/, "");
      if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: head } });
      if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: `tree-of-${route.split("/").pop()}` } });
      if (method === "GET" && route.startsWith("/git/trees/")) return Response.json({ truncated: false, tree: [...files].map(([path, text]) => ({ path, type: "blob", sha: sha(text) })) });
      if (method === "POST" && route === "/git/trees") {
        commits.push({ parents: [], changes: body.tree });
        return Response.json({ sha: "tree-new" });
      }
      if (method === "POST" && route === "/git/commits") {
        commits.at(-1)!.parents = body.parents;
        return Response.json({ sha: "commit-new" });
      }
      if (method === "PATCH" && route === "/git/refs/heads/main") {
        if (moveBranchBeforePatch) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
        for (const change of commits.at(-1)!.changes) files.delete(change.path);
        head = body.sha;
        return Response.json({ object: { sha: head } });
      }
      throw new Error(`unexpected ${method} ${u.href}`);
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: { async match() {}, async put() {}, async delete() { return true; } } };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  const kv = { async get() { return null; }, async put() {} };
  const waits: Promise<unknown>[] = [];
  const prune = async (body: unknown, signedIn = true) => {
    const response = await api({
      request: new Request("https://athena.example/api/data/prune-assets", { method: "POST", headers: { ...(signedIn && { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` }), "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits.splice(0));
    return { status: response.status, body: JSON.parse((await response.text()) || "null") as { removed: string[]; kept: { path: string; why: string }[]; error?: string } };
  };
  const paths = (...names: string[]) => ({ game: "overwatch", folder: "heroes", id: "ana", paths: names.map((n) => `${DIR}${n}`) });

  it("deletes, in one commit on the commit it checked, the named files nothing uses: 8 GitHub requests", async () => {
    const res = await prune(paths("portrait_2d.webp", "icon.png", "old-rival.webp", "draft.webp", "gone.png"));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.removed, [`${DIR}portrait_2d.webp`]);
    assert.deepEqual(res.body.kept, [
      { path: `${DIR}icon.png`, why: "used by data/overwatch/heroes/ana.json" },
      { path: `${DIR}old-rival.webp`, why: "used by data/overwatch/heroes/baptiste.json" },
      { path: `${DIR}draft.webp`, why: "used by data/overwatch/imports/job/draft.json" },
    ]);
    assert.deepEqual(commits.map((c) => [c.parents, c.changes.map((t) => [t.path, t.sha])]), [[["commit-1"], [[`${DIR}portrait_2d.webp`, null]]]]);
    assert.ok(!files.has(`${DIR}portrait_2d.webp`));
    // Every JSON file of the game and data/_meta, read as at the commit checked.
    assert.deepEqual(expressions.sort(), ["commit-1:data/_meta", "commit-1:data/overwatch", "commit-1:data/overwatch/heroes", "commit-1:data/overwatch/imports/job"]);
    assert.deepEqual(calls, [
      "GET /repos/o/r/git/ref/heads/main",
      "GET /repos/o/r/git/commits/commit-1",
      "GET /repos/o/r/git/trees/tree-of-commit-1",
      "POST /graphql",
      "GET /repos/o/r/git/commits/commit-1",
      "POST /repos/o/r/git/trees",
      "POST /repos/o/r/git/commits",
      "PATCH /repos/o/r/git/refs/heads/main",
    ]);
  });

  it("keeps every file, and says why, when what uses them can't be checked", async () => {
    graphql = false;
    const res = await prune(paths("portrait_2d.webp"));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { removed: [], kept: [{ path: `${DIR}portrait_2d.webp`, why: "couldn't check what uses it (GitHub GraphQL is unavailable)" }] });
    assert.deepEqual(commits, []);
    assert.ok(files.has(`${DIR}portrait_2d.webp`));
  });

  it("keeps every file when the data changed between the check and the commit", async () => {
    moveBranchBeforePatch = true;
    const res = await prune(paths("portrait_2d.webp"));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { removed: [], kept: [{ path: `${DIR}portrait_2d.webp`, why: "the data changed meanwhile" }] });
    assert.ok(files.has(`${DIR}portrait_2d.webp`));
  });

  it("does nothing for files already gone, and refuses others than the record's own, or anyone signed out", async () => {
    assert.deepEqual((await prune(paths("gone.png"))).body, { removed: [], kept: [] });
    assert.equal((await prune({ ...paths("x.png"), paths: ["public/assets/overwatch/heroes/baptiste/p.webp"] })).status, 400);
    assert.equal((await prune(paths("portrait_2d.webp"), false)).status, 401);
    assert.ok(files.has("public/assets/overwatch/heroes/baptiste/p.webp"));
    assert.deepEqual(commits, []);
  });
});
