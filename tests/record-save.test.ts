import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { assetSeenKey } from "../app/lib/asset-headers";
import { CATEGORIES_PATH, DEFAULT_CATEGORIES } from "../app/lib/categories";
import { ConflictError, saveRecord } from "../app/lib/github";
import { jsonFileText } from "../app/lib/json-file";
import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, mobileDataVersionKey } from "../app/lib/mobile-cache-version";
import { MAX_PICTURE_BYTES } from "../app/lib/picture-rules";
import { SESSION_VERSION_KEY, createSessionToken, isPictureToken } from "../app/lib/session";

// A record's save with its pictures (F2). Each picture was its own contents
// API write, made side by side, which GitHub says conflict when made in
// parallel: some pictures landed, the record didn't, and every upload was a
// commit, a webhook delivery and a KV write of the same key. Now each picture
// goes up as a blob (POST /api/data/picture), which commits nothing, and one
// request commits them with the record (POST /api/data/save-record).
//
// GitHub's git data is kept here in memory; Google's push endpoints answer
// too. Every request a Function makes (GitHub, Google, KV, the cache) is
// counted for the invocation that made it, and the 51st fails, as on the
// Workers Free plan.

const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const SECRET = "test-session-secret";
const ORIGIN = "https://athena.example";
const LIMIT = 50;
const DIR = "public/assets/overwatch/heroes/ana/";
const KIRIKO = "public/assets/overwatch/heroes/kiriko/";

const gitSha = (bytes: Buffer) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
/** A picture of `size` bytes whose first bytes are its type's; `seed` makes it unlike the others. */
const picture = (type: "png" | "jpeg" | "webp", size = 600, seed = 0) => {
  const head = { png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], jpeg: [0xff, 0xd8, 0xff, 0xe0], webp: [...Buffer.from("RIFF"), 1, 2, 0, 0, ...Buffer.from("WEBP")] }[type];
  const bytes = Buffer.alloc(size, seed % 251);
  bytes.set(head);
  return bytes.toString("base64");
};

// ─── GitHub's git data, in memory ───────────────────────────────────────
let blobs: Map<string, Buffer>;
let trees: Map<string, Map<string, string>>;
let commits: Map<string, { tree: string; parents: string[]; message: string }>;
let head: string;
/** Times someone else commits on the branch just before this Function moves it. */
let moves: number;
/** What that other commit changes. */
let outside: Record<string, string>;
let blobPosts: { content: string; encoding: string }[];
let kvWrites: string[];
let cacheDeletes: string[];
/** Concurrent picture uploads, at most, during a save from the admin. */
let uploading: { now: number; most: number };

const store = (bytes: Buffer) => {
  const sha = gitSha(bytes);
  blobs.set(sha, bytes);
  return sha;
};
function commitFiles(parent: string | null, changes: Record<string, string | null>, message: string): string {
  const tree = new Map(parent ? trees.get(commits.get(parent)!.tree)! : []);
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) tree.delete(path);
    else tree.set(path, store(Buffer.from(text)));
  }
  const treeId = `t${trees.size}`;
  trees.set(treeId, tree);
  const id = `c${commits.size}`;
  commits.set(id, { tree: treeId, parents: parent ? [parent] : [], message });
  return id;
}
/** The branch's files at its head, by path: their blob shas. */
const filesAtHead = () => trees.get(commits.get(head)!.tree)!;
const textAt = (path: string) => blobs.get(filesAtHead().get(path)!)?.toString();

/** Every subrequest of the invocation it runs in, and the count that fails it at LIMIT + 1. */
const invocation = new AsyncLocalStorage<string[]>();
function subrequest(what: string) {
  const calls = invocation.getStore();
  if (!calls) throw new Error(`a subrequest outside any invocation: ${what}`);
  calls.push(what);
  if (calls.length > LIMIT) throw new Error("Too many subrequests.");
}

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;

async function github(url: URL, method: string, body: Record<string, any> | undefined): Promise<Response> {
  const route = url.pathname.replace(/^\/repos\/o\/r/, "");
  if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: head } });
  if (method === "GET" && route.startsWith("/git/commits/")) {
    const commit = commits.get(route.split("/").pop()!);
    return commit ? Response.json({ tree: { sha: commit.tree } }) : Response.json({ message: "Not Found" }, { status: 404 });
  }
  if (method === "GET" && route.startsWith("/git/trees/")) {
    const tree = trees.get(route.split("/").pop()!)!;
    return Response.json({ truncated: false, tree: [...tree].map(([path, sha]) => ({ path, type: "blob", sha })) });
  }
  if (method === "POST" && route === "/git/blobs") {
    blobPosts.push({ content: body!.content, encoding: body!.encoding });
    return Response.json({ sha: store(Buffer.from(body!.content, body!.encoding === "base64" ? "base64" : "utf8")) }, { status: 201 });
  }
  if (method === "POST" && route === "/git/trees") {
    const tree = new Map(trees.get(body!.base_tree)!);
    for (const entry of body!.tree as { path: string; sha?: string | null; content?: string }[]) {
      if (entry.sha === null) tree.delete(entry.path);
      else if (entry.content !== undefined) tree.set(entry.path, store(Buffer.from(entry.content)));
      else if (!blobs.has(entry.sha!)) return Response.json({ message: "BadObjectState" }, { status: 422 });
      else tree.set(entry.path, entry.sha!);
    }
    const id = `t${trees.size}`;
    trees.set(id, tree);
    return Response.json({ sha: id }, { status: 201 });
  }
  if (method === "POST" && route === "/git/commits") {
    const id = `c${commits.size}`;
    commits.set(id, { tree: body!.tree, parents: body!.parents, message: body!.message });
    return Response.json({ sha: id }, { status: 201 });
  }
  if (method === "PATCH" && route === "/git/refs/heads/main") {
    if (moves > 0) {
      moves--;
      head = commitFiles(head, outside, "Someone else's commit");
    }
    if (commits.get(body!.sha)!.parents[0] !== head) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
    head = body!.sha;
    return Response.json({ object: { sha: head } });
  }
  const file = /^\/contents\/(.+)$/.exec(route);
  if (method === "GET" && file) {
    const path = decodeURIComponent(file[1]);
    const sha = filesAtHead().get(path);
    if (!sha) return Response.json({ message: "Not Found" }, { status: 404 });
    return Response.json({ type: "file", encoding: "base64", content: blobs.get(sha)!.toString("base64"), sha, path, name: path.split("/").pop() });
  }
  throw new Error(`unexpected ${method} ${url.href}`);
}

beforeEach(() => {
  blobs = new Map();
  trees = new Map();
  commits = new Map();
  moves = 0;
  outside = { "data/_meta/touched.json": "{}" };
  blobPosts = [];
  kvWrites = [];
  cacheDeletes = [];
  uploading = { now: 0, most: 0 };
  const categories = { categories: DEFAULT_CATEGORIES.map((c) => (c.folder === "heroes" ? { ...c, notify: { enabled: true, title: "New hero: {name}", body: "Meet {name}." } } : c)) };
  head = commitFiles(null, {
    "data/_meta/games.json": JSON.stringify({ games: [{ slug: "overwatch", name: "Overwatch", active: true }] }),
    [CATEGORIES_PATH]: JSON.stringify(categories),
    "data/overwatch/heroes/ana.json": jsonFileText({ id: "ana", name: "Ana", portrait: { "2d": "/api/assets/overwatch/heroes/ana/portrait_2d.webp" } }),
    "data/overwatch/heroes/baptiste.json": jsonFileText({ id: "baptiste", name: "Baptiste" }),
    "data/overwatch/enums/sub-role.json": jsonFileText({ id: "sub-role", name: "Sub-role", options: [{ id: "medic", name: "Medic" }] }),
    [`${DIR}portrait_2d.webp`]: Buffer.from(picture("webp"), "base64").toString("latin1"),
  }, "Initial data");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), ORIGIN);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // The admin's own requests (saveRecord): served by the Function, each its own invocation.
    if (url.origin === ORIGIN && url.pathname.startsWith("/api/")) return admin(url, init);
    subrequest(`${method} ${url.hostname === "api.github.com" ? url.pathname.replace(/^\/repos\/o\/r/, "") : url.hostname}`);
    if (url.hostname === "api.github.com") return github(url, method, init?.body ? JSON.parse(String(init.body)) : undefined);
    if (url.href === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "made-up" });
    if (url.hostname === "fcm.googleapis.com") return Response.json({ name: "projects/zms-test-1/messages/1" });
    throw new Error(`unexpected request to ${url.href}`);
  }) as typeof fetch;
  (globalThis as { caches?: unknown }).caches = {
    default: {
      async match() {
        subrequest("cache match");
      },
      async put() {
        subrequest("cache put");
      },
      async delete(request: Request | string) {
        subrequest("cache delete");
        cacheDeletes.push(typeof request === "string" ? request : request.url);
        return true;
      },
    },
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { caches?: unknown }).caches = realCaches;
});

const kv = {
  async get(key: string) {
    subrequest(`KV get ${key}`);
    return null;
  },
  async put(key: string) {
    subrequest(`KV put ${key}`);
    if (key !== SESSION_VERSION_KEY && !key.startsWith("push_sent:")) kvWrites.push(key);
  },
};

let fcm: string | undefined;
const pem = (der: ArrayBuffer) => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const CREDENTIALS = JSON.stringify({ type: "service_account", project_id: "zms-test-1", client_email: "pusher@zms-test-1.iam.gserviceaccount.com", private_key: pem(await crypto.subtle.exportKey("pkcs8", keys.privateKey)) });
beforeEach(() => {
  fcm = undefined;
});

/** One request to the Function, as its own invocation: its answer, and every subrequest it made. */
async function call(path: string, body: unknown, { signedIn = true, headers = {} as Record<string, string>, raw }: { signedIn?: boolean; headers?: Record<string, string>; raw?: string } = {}) {
  const calls: string[] = [];
  const response = await invocation.run(calls, async () => {
    const waits: Promise<unknown>[] = [];
    const cookie: Record<string, string> = signedIn ? { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } : {};
    const res = await api({
      request: new Request(`${ORIGIN}/api/${path}`, { method: "POST", headers: { ...cookie, "Content-Type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) }),
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET, FCM_SERVICE_ACCOUNT: fcm },
      params: {},
      next: async () => new Response(null),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    return res;
  });
  return { status: response.status, body: JSON.parse((await response.text()) || "null"), calls, github: calls.filter((c) => !c.startsWith("KV ") && !c.startsWith("cache ")) };
}

/** The Function serving the admin's own fetch("/api/…"), as a browser on its page would send it. */
async function admin(url: URL, init?: RequestInit): Promise<Response> {
  const picture = url.pathname === "/api/data/picture";
  if (picture) uploading.most = Math.max(uploading.most, ++uploading.now);
  try {
    const { status, body } = await call(url.pathname.slice("/api/".length), undefined, { raw: String(init?.body ?? ""), headers: { "Sec-Fetch-Site": "same-origin" } });
    return Response.json(body, { status });
  } finally {
    if (picture) uploading.now--;
  }
}

type Uploaded = { path: string; sha: string; token: string };
const upload = async (path: string, base64: string, record = { game: "overwatch", folder: "heroes", id: path.split("/")[4] }) => {
  const res = await call("data/picture", { ...record, path, base64 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as Uploaded;
};
const save = (body: Record<string, unknown>) => call("data/save-record", { game: "overwatch", folder: "heroes", id: "ana", message: "Update hero: Ana", ...body });
const anaSha = () => filesAtHead().get("data/overwatch/heroes/ana.json")!;
/** Kiriko's 17 pictures: 2 portraits and 15 ability icons. */
const kirikoPictures = () => [
  { path: `${KIRIKO}portrait_2d.webp`, base64: picture("webp", 30_000, 1) },
  { path: `${KIRIKO}portrait_3d.png`, base64: picture("png", 40_000, 2) },
  ...Array.from({ length: 15 }, (_, i) => ({ path: `${KIRIKO}abilities/ability-${i}.png`, base64: picture("png", 2_000, 10 + i) })),
];
const KIRIKO_RECORD = { id: "kiriko", name: "Kiriko", portrait: { "2d": "/api/assets/overwatch/heroes/kiriko/portrait_2d.webp", "3d": "/api/assets/overwatch/heroes/kiriko/portrait_3d.png" } };

describe("uploading a picture for a save (POST /api/data/picture)", () => {
  it("makes it a blob and nothing more: GitHub gets the base64 as sent, no commit, no KV write, no cache delete", async () => {
    const base64 = picture("png", 5_000);
    const before = head;
    const res = await call("data/picture", { game: "overwatch", folder: "heroes", id: "ana", path: `${DIR}portrait_3d.png`, base64 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.calls, [`KV get ${SESSION_VERSION_KEY}`, "POST /git/blobs"]);
    assert.deepEqual(blobPosts, [{ content: base64, encoding: "base64" }]);
    assert.equal(head, before);
    assert.deepEqual([kvWrites, cacheDeletes], [[], []]);
    const sha = gitSha(Buffer.from(base64, "base64"));
    assert.deepEqual({ ...res.body, token: undefined }, { path: `${DIR}portrait_3d.png`, sha, token: undefined });
    assert.equal(await isPictureToken(res.body.token, SECRET, `${DIR}portrait_3d.png`, sha), true);
  });

  it("refuses, without any GitHub request, what isn't a PNG, JPEG or WebP of at most 2 MiB in the record's own folder", async () => {
    const ok = { game: "overwatch", folder: "heroes", id: "ana", path: `${DIR}p.png`, base64: picture("png") };
    const cases: [string, Record<string, unknown>, number][] = [
      ["another record's folder", { path: "public/assets/overwatch/heroes/baptiste/p.png" }, 400],
      ["a data file", { path: "data/overwatch/heroes/ana.json" }, 400],
      ["a path out of the folder", { path: `${DIR}../baptiste/p.png` }, 400],
      ["the folder of the games page", { path: "public/assets/games/overwatch-icon.png" }, 400],
      ["a folder that holds no records", { folder: "schemas", path: "public/assets/overwatch/schemas/ana/p.png" }, 400],
      ["no base64", { base64: undefined }, 400],
      ["an SVG", { path: `${DIR}p.svg`, base64: Buffer.from("<svg/>").toString("base64") }, 415],
      ["an SVG named .png", { base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64") }, 415],
      ["a WebP named .png", { base64: picture("webp") }, 415],
      ["one byte over 2 MiB", { base64: picture("png", MAX_PICTURE_BYTES + 1) }, 413],
      ["a body over the limit, refused before it's parsed", { base64: picture("png", MAX_PICTURE_BYTES * 1.5) }, 413],
    ];
    for (const [what, change, status] of cases) {
      const res = await call("data/picture", { ...ok, ...change });
      assert.equal(res.status, status, `${what}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, "string", what);
      assert.deepEqual(res.github, [], what);
    }
    const huge = await call("data/picture", { ...ok, base64: picture("png", MAX_PICTURE_BYTES * 1.5) });
    assert.equal(huge.body.error, "The picture is over 2 MB; a picture can be at most 2 MB.");
    assert.equal((await call("data/picture", ok, { signedIn: false })).status, 401);
    assert.equal((await call("data/picture", ok, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.deepEqual(blobPosts, []);
  });

  it("takes an enum's option icons in that enum's own folder", async () => {
    const res = await call("data/picture", { game: "overwatch", folder: "enums", id: "sub-role", path: "public/assets/overwatch/enums/sub-role/medic.png", base64: picture("png") });
    assert.equal(res.status, 200);
    const other = await call("data/picture", { game: "overwatch", folder: "enums", id: "sub-role", path: "public/assets/overwatch/enums/role/medic.png", base64: picture("png") });
    assert.equal(other.status, 400);
  });
});

describe("saving a record with its pictures (POST /api/data/save-record)", () => {
  it("commits a new hero and its 17 pictures at once, on the commit it checked, with one KV write per mobile version", async () => {
    const pictures = await Promise.all(kirikoPictures().map((p) => upload(p.path, p.base64)));
    const before = head;
    const res = await call("data/save-record", { game: "overwatch", folder: "heroes", id: "kiriko", sha: null, content: KIRIKO_RECORD, message: "Add hero: Kiriko", notify: true, pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // No FCM credentials here: the push is said not to be set up.
    assert.deepEqual(res.body, { ok: true, sha: gitSha(Buffer.from(jsonFileText(KIRIKO_RECORD))), commit: head, push: { status: "not_configured" } });
    assert.deepEqual(commits.get(head), { tree: commits.get(head)!.tree, parents: [before], message: "Add hero: Kiriko" });
    assert.equal(textAt("data/overwatch/heroes/kiriko.json"), jsonFileText(KIRIKO_RECORD));
    for (const p of kirikoPictures()) assert.equal(filesAtHead().get(p.path), gitSha(Buffer.from(p.base64, "base64")), p.path);
    assert.deepEqual(res.github, ["GET /git/ref/heads/main", `GET /git/commits/${before}`, `GET /git/trees/${commits.get(before)!.tree}`, `GET /git/commits/${before}`, "POST /git/trees", "POST /git/commits", "PATCH /git/refs/heads/main"]);
    assert.deepEqual(kvWrites.sort(), [MOBILE_ASSETS_VERSION_KEY, mobileDataVersionKey("overwatch", "heroes")].sort());
    // The cached copies of 12 pictures are forgotten here; the others' expire on their own.
    assert.equal(cacheDeletes.length, 24);
    assert.ok(cacheDeletes.includes(assetSeenKey("assets/overwatch/heroes/kiriko/portrait_2d.webp")));
    assert.ok(res.calls.length <= LIMIT, String(res.calls.length));
  });

  it("commits an edit with a replaced and a new picture; the replaced one's cached copies go first", async () => {
    const pictures = [await upload(`${DIR}portrait_3d.png`, picture("png", 900, 3)), await upload(`${DIR}portrait_2d.webp`, picture("webp", 900, 4))];
    const content = { id: "ana", name: "Ana Amari", portrait: { "2d": "/api/assets/overwatch/heroes/ana/portrait_2d.webp", "3d": "/api/assets/overwatch/heroes/ana/portrait_3d.png" } };
    const res = await save({ sha: anaSha(), content, pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.sha, filesAtHead().get("data/overwatch/heroes/ana.json"));
    assert.equal(filesAtHead().get(`${DIR}portrait_2d.webp`), pictures[1].sha);
    assert.deepEqual(cacheDeletes.slice(0, 2).sort(), ["https://api.internal/api/assets/overwatch/heroes/ana/portrait_2d.webp", assetSeenKey("assets/overwatch/heroes/ana/portrait_2d.webp")].sort());
    assert.equal(res.body.push, undefined);
  });

  it("saves pictures alone without rewriting the record, still checking the record's sha", async () => {
    const sha = anaSha();
    const pictures = [await upload(`${DIR}portrait_2d.webp`, picture("webp", 900, 5))];
    const res = await save({ sha, pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.sha, sha);
    assert.equal(anaSha(), sha);
    assert.deepEqual(kvWrites, [MOBILE_ASSETS_VERSION_KEY]);
    const stale = await save({ sha: "0".repeat(40), pictures });
    assert.equal(stale.status, 409);
  });

  it("refuses a stale edit as a conflict, without writing anything", async () => {
    const pictures = [await upload(`${DIR}portrait_3d.png`, picture("png"))];
    const before = head;
    for (const [body, says] of [
      [{ sha: "f".repeat(40), content: { id: "ana", name: "Ana" } }, /modified since it was loaded/],
      [{ sha: null, content: { id: "ana", name: "Ana" } }, /already exists/],
      [{ id: "zenyatta", sha: "f".repeat(40), content: { id: "zenyatta" }, pictures: [] }, /deleted since it was loaded/],
    ] as const) {
      const res = await save({ pictures, ...body });
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.conflict, true);
      assert.match(res.body.error, says);
      assert.deepEqual(res.github.filter((c) => !c.startsWith("GET")), []);
    }
    assert.equal(head, before);
    assert.deepEqual(kvWrites, []);
  });

  it("checks and commits once more when the branch moved between the check and the commit", async () => {
    moves = 1;
    const pictures = [await upload(`${DIR}portrait_3d.png`, picture("png"))];
    const res = await save({ sha: anaSha(), content: { id: "ana", name: "Ana Amari" }, pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(commits.get(commits.get(head)!.parents[0])!.message, "Someone else's commit");
    assert.equal(textAt("data/_meta/touched.json"), "{}");
    assert.equal(textAt("data/overwatch/heroes/ana.json"), jsonFileText({ id: "ana", name: "Ana Amari" }));
    assert.equal(res.github.filter((c) => c === "PATCH /git/refs/heads/main").length, 2);
    assert.equal(res.github.filter((c) => c === "GET /git/ref/heads/main").length, 2);
  });

  it("is a conflict when the branch moves twice, or moved and the record changed meanwhile", async () => {
    const pictures = [await upload(`${DIR}portrait_3d.png`, picture("png"))];
    moves = 2;
    let res = await save({ sha: anaSha(), content: { id: "ana", name: "Ana Amari" }, pictures });
    assert.equal(res.status, 409);
    assert.equal(res.body.conflict, true);
    assert.match(res.body.error, /kept changing while saving/);
    assert.equal(filesAtHead().has(`${DIR}portrait_3d.png`), false);

    moves = 1;
    const sha = anaSha();
    outside = { "data/overwatch/heroes/ana.json": jsonFileText({ id: "ana", name: "Someone else's Ana" }) };
    res = await save({ sha, content: { id: "ana", name: "Ana Amari" }, pictures });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /modified since it was loaded/);
    assert.equal(textAt("data/overwatch/heroes/ana.json"), jsonFileText({ id: "ana", name: "Someone else's Ana" }));
    assert.deepEqual(kvWrites, []);
  });

  it("refuses, without any GitHub request, what it may not commit", async () => {
    const ana = await upload(`${DIR}portrait_3d.png`, picture("png"));
    const baptiste = await upload("public/assets/overwatch/heroes/baptiste/p.png", picture("png"));
    const many = Array.from({ length: 51 }, (_, i) => ({ path: `${DIR}a${i}.png`, sha: ana.sha, token: ana.token }));
    const cases: [string, Record<string, unknown>][] = [
      ["a forged token", { pictures: [{ ...ana, token: "AAAA" }] }],
      ["a token for another path", { pictures: [{ ...ana, path: `${DIR}portrait_2d.png` }] }],
      ["a token for another blob", { pictures: [{ ...ana, sha: "a".repeat(40) }] }],
      ["a session token as a picture's", { pictures: [{ ...ana, token: await createSessionToken(SECRET, "0") }] }],
      ["another record's picture, with its own token", { pictures: [baptiste] }],
      ["a picture listed twice", { pictures: [ana, ana] }],
      ["51 pictures", { pictures: many }],
      ["an SVG", { pictures: [{ ...ana, path: `${DIR}p.svg` }] }],
      ["schemas", { folder: "schemas" }],
      ["screens", { folder: "screens" }],
      ["games", { folder: "games" }],
      ["a record whose id isn't its file's", { content: { id: "baptiste", name: "Ana" } }],
      ["a record that isn't an object", { content: ["ana"] }],
      ["a new record without content", { sha: null, content: undefined }],
      ["nothing to save", { content: undefined, pictures: [] }],
      ["a sha that isn't one", { sha: "HEAD" }],
      ["an invalid id", { id: "../ana" }],
    ];
    for (const [what, change] of cases) {
      const res = await save({ sha: anaSha(), content: { id: "ana", name: "Ana" }, pictures: [ana], ...change });
      assert.equal(res.status, 400, `${what}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, "string", what);
      assert.deepEqual(res.github, [], what);
    }
    assert.equal((await call("data/save-record", { game: "overwatch", folder: "heroes", id: "ana", sha: anaSha(), pictures: [ana] }, { signedIn: false })).status, 401);
    assert.equal((await call("data/save-record", {}, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  });

  it("says GitHub refused the pictures, not a conflict, when a blob it was given is gone", async () => {
    const pictures = [await upload(`${DIR}portrait_3d.png`, picture("png"))];
    blobs.delete(pictures[0].sha);
    const res = await save({ sha: anaSha(), content: { id: "ana", name: "Ana" }, pictures });
    assert.equal(res.status, 400);
    assert.equal(res.body.conflict, undefined);
    assert.match(res.body.error, /GitHub refused/);
  });

  it("commits an enum's option icons in its own folder, refreshing the app's init and pictures", async () => {
    const pictures = [await upload("public/assets/overwatch/enums/sub-role/medic.png", picture("png"), { game: "overwatch", folder: "enums", id: "sub-role" })];
    const sha = filesAtHead().get("data/overwatch/enums/sub-role.json");
    const content = { id: "sub-role", name: "Sub-role", options: [{ id: "medic", name: "Medic", icon: "/api/assets/overwatch/enums/sub-role/medic.png" }] };
    const res = await call("data/save-record", { game: "overwatch", folder: "enums", id: "sub-role", sha, content, message: "Update enum: Sub-role", pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(kvWrites.sort(), [MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY].sort());
  });

  it("notifies players of a new record once, after its commit; an edit never asks Google", async () => {
    fcm = CREDENTIALS;
    const created = await call("data/save-record", { game: "overwatch", folder: "heroes", id: "kiriko", sha: null, content: KIRIKO_RECORD, message: "Add hero: Kiriko", notify: true, pictures: [] });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.deepEqual(created.body.push, { status: "sent" });
    const patched = created.github.indexOf("PATCH /git/refs/heads/main");
    assert.ok(patched > 0 && created.github.indexOf("POST oauth2.googleapis.com") > patched, created.github.join(", "));
    assert.equal(created.github.filter((c) => c.startsWith("POST fcm.googleapis.com")).length, 1);

    const edited = await save({ sha: anaSha(), content: { id: "ana", name: "Ana Amari" }, notify: true, pictures: [] });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.push.status, "skipped");
    assert.deepEqual(edited.github.filter((c) => !c.includes("/git/")), []);
  });

  it("stays within a Function's 50 subrequests at worst: a new record notifying players, the branch moving once, 50 pictures replacing others", async () => {
    fcm = CREDENTIALS;
    moves = 1;
    // A deleted hero's pictures left in the new one's folder: each of the 50 replaces one.
    head = commitFiles(head, Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`${KIRIKO}abilities/a${i}.png`, "old"])), "Old pictures");
    const pictures = await Promise.all(Array.from({ length: 50 }, (_, i) => upload(`${KIRIKO}abilities/a${i}.png`, picture("png", 700, i))));
    const res = await call("data/save-record", { game: "overwatch", folder: "heroes", id: "kiriko", sha: null, content: KIRIKO_RECORD, message: "Add hero: Kiriko", notify: true, pictures });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.push, { status: "sent" });
    assert.equal(res.calls.length, 47, res.calls.join("\n"));
    assert.equal(cacheDeletes.length, 24);
  });
});

describe("saveRecord() in the admin", () => {
  it("uploads the pictures three at a time, then commits them with the record in one request", async () => {
    const before = head;
    const result = await saveRecord({ game: "overwatch", folder: "heroes", id: "kiriko", sha: null, content: KIRIKO_RECORD, message: "Add hero: Kiriko", notify: false, pictures: kirikoPictures() });
    assert.deepEqual(result, { sha: gitSha(Buffer.from(jsonFileText(KIRIKO_RECORD))), push: undefined });
    assert.equal(uploading.most, 3);
    assert.deepEqual(commits.get(head)!.parents, [before]);
    assert.equal(blobPosts.length, 17);
    for (const p of kirikoPictures()) assert.ok(filesAtHead().has(p.path), p.path);
  });

  it("saves nothing when a picture can't be uploaded, and says why", async () => {
    const before = head;
    const pictures = [...kirikoPictures().slice(0, 4), { path: `${KIRIKO}logo.png`, base64: Buffer.from("<svg/>").toString("base64") }];
    await assert.rejects(saveRecord({ game: "overwatch", folder: "heroes", id: "kiriko", sha: null, content: KIRIKO_RECORD, message: "Add hero: Kiriko", pictures }), /isn't a PNG, JPEG or WebP picture/);
    assert.equal(head, before);
  });

  it("turns a conflict into a ConflictError carrying the server's words", async () => {
    const err = await saveRecord({ game: "overwatch", folder: "heroes", id: "ana", sha: "f".repeat(40), content: { id: "ana", name: "Ana" }, message: "Update hero: Ana", pictures: [] }).catch((e: unknown) => e);
    assert.ok(err instanceof ConflictError);
    assert.match(err.message, /Conflict on data\/overwatch\/heroes\/ana\.json: the record was modified since it was loaded/);
  });
});
