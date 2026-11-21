import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import { gameIconRequest, gamesSaveRequest } from "../app/lib/api/games";
import { assetSeenKey } from "../app/lib/asset-headers";
import { jsonFileText } from "../app/lib/json-file";
import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY } from "../app/lib/mobile-cache-version";
import { MAX_PICTURE_BYTES } from "../app/lib/picture-rules";
import { SESSION_VERSION_KEY, createSessionToken, isPictureToken, pictureToken } from "../app/lib/session";

// The games page's save (R7): its icon was a commit of its own (POST
// /api/data/file), then games.json another, so a refused or failed games.json
// left the icon committed, and every save ran the push webhook twice. Now the
// icon goes up as a blob (POST /api/data/game-icon), which commits nothing,
// and one request commits it with games.json (POST /api/data/save-games),
// after the checks data/file ran on games.json. GitHub's git data and its
// GraphQL reads are kept here in memory.

// Imported by name, as the other API tests do: the root type check leaves functions/ to its own.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

const SECRET = "test-session-secret";
const ORIGIN = "https://athena.example";
const GAMES = "data/_meta/games.json";
const ICON = "public/assets/games/overwatch-icon.png";
const ICON_URL = "/api/assets/games/overwatch-icon.png";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const dark = (JSON.parse(readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8")) as { dark: Record<string, string> }).dark;
const game = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({ slug, name, developer: "", active: true, ...dark, ...extra });
const GAMES_FILE = { games: [game("overwatch", "Overwatch"), game("marvel-rivals", "Marvel Rivals")] };

const gitSha = (bytes: Buffer) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${String(bytes.length)}\0`), bytes])).digest("hex");
/** A PNG of `size` bytes: its signature, then `seed`. */
const png = (size = 600, seed = 0) => {
  const bytes = Buffer.alloc(size, seed);
  bytes.set(PNG_SIGNATURE);
  return bytes.toString("base64");
};

// ─── GitHub's git data, in memory ───────────────────────────────────────
type Body = Record<string, unknown>;
interface Commit {
  tree: string;
  parents: string[];
  message: string;
}
let blobs: Map<string, Buffer>;
let trees: Map<string, Map<string, string>>;
let commits: Map<string, Commit>;
let head: string;
/** Times someone else commits on the branch just before this Function moves it. */
let moves: number;
let calls: string[];
let kvWrites: string[];
let cacheDeletes: string[];

const store = (bytes: Buffer) => {
  const sha = gitSha(bytes);
  blobs.set(sha, bytes);
  return sha;
};
const treeOf = (commit: string) => trees.get(commits.get(commit)?.tree ?? "") ?? new Map<string, string>();
const addTree = (tree: Map<string, string>) => {
  const id = `t${String(trees.size)}`;
  trees.set(id, tree);
  return id;
};
const addCommit = (commit: Commit) => {
  const id = `c${String(commits.size)}`;
  commits.set(id, commit);
  return id;
};
function commitFiles(parent: string | null, changes: Record<string, string>, message: string): string {
  const tree = new Map(parent === null ? [] : treeOf(parent));
  for (const [path, text] of Object.entries(changes)) {
    tree.set(path, store(Buffer.from(text)));
  }
  return addCommit({ tree: addTree(tree), parents: parent === null ? [] : [parent], message });
}
const filesAtHead = () => treeOf(head);
const textAt = (path: string) => blobs.get(filesAtHead().get(path) ?? "")?.toString();
const lastSegment = (route: string) => route.split("/").pop() ?? "";

/** games.json and the folders under data/, as games-guard.ts reads them in one GraphQL request. */
function graphql(): Response {
  const text = textAt(GAMES) ?? "";
  const folders = new Set([...filesAtHead().keys()].filter((path) => path.startsWith("data/")).map((path) => path.split("/")[1]));
  const blob = { oid: "x", byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text };
  return Response.json({ data: { repository: { p0: blob, l0: { entries: [...folders].map((name) => ({ name, type: "tree", mode: 16_384 })) } } } });
}

function postTree(body: Body): Response {
  const tree = new Map(trees.get(String(body.base_tree)));
  for (const entry of body.tree as { path: string; sha?: string; content?: string }[]) {
    if (entry.content !== undefined) {
      tree.set(entry.path, store(Buffer.from(entry.content)));
    } else if (entry.sha !== undefined && blobs.has(entry.sha)) {
      tree.set(entry.path, entry.sha);
    } else {
      return Response.json({ message: "BadObjectState" }, { status: 422 });
    }
  }
  return Response.json({ sha: addTree(tree) }, { status: 201 });
}

function moveRef(body: Body): Response {
  if (moves > 0) {
    moves--;
    head = commitFiles(head, { "data/_meta/touched.json": "{}" }, "Someone else's commit");
  }
  if (commits.get(String(body.sha))?.parents[0] !== head) {
    return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
  }
  head = String(body.sha);
  return Response.json({ object: { sha: head } });
}

/** GitHub's git data API, by method and route. */
const GIT: [string, (route: string) => boolean, (route: string, body: Body) => Response][] = [
  ["GET", (route) => route === "/git/ref/heads/main", () => Response.json({ object: { sha: head } })],
  ["GET", (route) => route.startsWith("/git/commits/"), (route) => Response.json({ tree: { sha: commits.get(lastSegment(route))?.tree } })],
  ["GET", (route) => route.startsWith("/git/trees/"), (route) => Response.json({ truncated: false, tree: [...(trees.get(lastSegment(route)) ?? [])].map(([path, sha]) => ({ path, type: "blob", sha })) })],
  ["POST", (route) => route === "/git/blobs", (_route, body) => Response.json({ sha: store(Buffer.from(String(body.content), "base64")) }, { status: 201 })],
  ["POST", (route) => route === "/git/trees", (_route, body) => postTree(body)],
  ["POST", (route) => route === "/git/commits", (_route, body) => Response.json({ sha: addCommit({ tree: String(body.tree), parents: body.parents as string[], message: String(body.message) }) }, { status: 201 })],
  ["PATCH", (route) => route === "/git/refs/heads/main", (_route, body) => moveRef(body)],
];

function github(url: URL, method: string, body: Body): Response {
  if (url.pathname === "/graphql") {
    calls.push("graphql");
    return graphql();
  }
  const route = url.pathname.replace(/^\/repos\/o\/r/, "");
  calls.push(`${method} ${route}`);
  const found = GIT.find(([verb, matches]) => verb === method && matches(route));
  if (!found) {
    throw new Error(`unexpected ${method} ${route}`);
  }
  return found[2](route, body);
}

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
beforeEach(() => {
  blobs = new Map();
  trees = new Map();
  commits = new Map();
  moves = 0;
  calls = [];
  kvWrites = [];
  cacheDeletes = [];
  head = commitFiles(null, { [GAMES]: jsonFileText(GAMES_FILE), "data/overwatch/heroes/ana.json": "{}" }, "Initial data");
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Body) : {};
    return github(url, (init?.method ?? "GET").toUpperCase(), body);
  };
  (globalThis as { caches?: unknown }).caches = {
    default: {
      async delete(request: Request | string) {
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
  async get() {
    return null;
  },
  async put(key: string) {
    if (key !== SESSION_VERSION_KEY) {
      kvWrites.push(key);
    }
  },
};

/** One POST to the Function, signed in from the admin's own page unless said otherwise. */
async function call(path: string, body: unknown, { isSignedIn = true, site = "same-origin" } = {}) {
  const waits: Promise<unknown>[] = [];
  const cookie: Record<string, string> = isSignedIn ? { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } : {};
  const response = await api({
    request: new Request(`${ORIGIN}/api/${path}`, { method: "POST", headers: { ...cookie, "Content-Type": "application/json", "Sec-Fetch-Site": site }, body: JSON.stringify(body) }),
    env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET },
    params: {},
    next: async () => new Response(null),
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  const answer: Body = await response.json();
  return { status: response.status, body: answer };
}

const githubCalls = () => calls.filter((what) => what !== "graphql");
interface Uploaded {
  path: string;
  sha: string;
  token: string;
}
const uploadIcon = async (path = ICON, base64 = png()) => {
  const res = await call("data/game-icon", { slug: "overwatch", path, base64 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as unknown as Uploaded;
};
const edited = (icon?: string) => ({ games: [game("overwatch", "Overwatch 2", icon === undefined ? {} : { icon }), GAMES_FILE.games[1]] });
const gamesSha = () => filesAtHead().get(GAMES);
const save = async (body: Body) => call("data/save-games", { sha: gamesSha(), content: edited(), message: "Edit game: Overwatch 2", ...body });

void describe("uploading a game's icon (POST /api/data/game-icon)", () => {
  void it("makes it a blob and nothing more, with the server's token for that path", async () => {
    const before = head;
    const base64 = png(5000);
    const res = await call("data/game-icon", { slug: "overwatch", path: ICON, base64 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(githubCalls(), ["POST /git/blobs"]);
    assert.equal(head, before);
    assert.deepEqual([kvWrites, cacheDeletes], [[], []]);
    const sha = gitSha(Buffer.from(base64, "base64"));
    assert.deepEqual({ ...res.body, token: undefined }, { path: ICON, sha, token: undefined });
    assert.equal(await isPictureToken(String(res.body.token), SECRET, ICON, sha), true);
  });

  void it("refuses, before any GitHub request, what isn't its game's icon as a PNG, JPEG or WebP of at most 2 MiB", async () => {
    const ok = { slug: "overwatch", path: ICON, base64: png() };
    const cases: [string, Body, number][] = [
      ["another game's icon", { path: "public/assets/games/valorant-icon.png" }, 400],
      ["a record's folder", { path: "public/assets/overwatch/heroes/ana/icon.png" }, 400],
      ["a data file", { path: GAMES }, 400],
      ["a path out of the folder", { path: "public/assets/games/../overwatch-icon.png" }, 400],
      ["a slug that isn't one", { slug: "../overwatch", path: "public/assets/games/../overwatch-icon.png" }, 400],
      ["no base64", { base64: undefined }, 400],
      ["an SVG", { path: "public/assets/games/overwatch-icon.svg", base64: Buffer.from("<svg/>").toString("base64") }, 415],
      ["one byte over 2 MiB", { base64: png(MAX_PICTURE_BYTES + 1) }, 413],
    ];
    const answers = await Promise.all(cases.map(async ([, change]) => call("data/game-icon", { ...ok, ...change })));
    answers.forEach((res, index) => {
      const [what, , status] = cases[index];
      assert.equal(res.status, status, `${what}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, "string", what);
    });
    const [unsigned, crossSite] = await Promise.all([call("data/game-icon", ok, { isSignedIn: false }), call("data/game-icon", ok, { site: "cross-site" })]);
    assert.deepEqual([unsigned.status, crossSite.status], [401, 403]);
    assert.deepEqual(githubCalls(), []);
  });
});

void describe("saving games.json (POST /api/data/save-games)", () => {
  void it("commits the edited games.json and its new icon at once, on the commit it checked", async () => {
    const base64 = png(4000, 7);
    const icon = await uploadIcon(ICON, base64);
    const before = head;
    calls = [];
    const content = edited(ICON_URL);
    const res = await save({ content, icon });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { ok: true, sha: gitSha(Buffer.from(jsonFileText(content))), commit: head });
    assert.deepEqual(commits.get(head), { tree: commits.get(head)?.tree, parents: [before], message: "Edit game: Overwatch 2" });
    assert.equal(textAt(GAMES), jsonFileText(content));
    assert.equal(filesAtHead().get(ICON), gitSha(Buffer.from(base64, "base64")));
    assert.equal(githubCalls().filter((what) => what === "PATCH /git/refs/heads/main").length, 1);
    assert.deepEqual(kvWrites.sort(), [MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY].sort());
    assert.ok(cacheDeletes.includes(assetSeenKey("assets/games/overwatch-icon.png")));
  });

  void it("commits games.json alone when no icon was picked", async () => {
    const before = head;
    const res = await save({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(commits.get(head)?.parents, [before]);
    assert.equal(textAt(GAMES), jsonFileText(edited()));
    assert.deepEqual([...filesAtHead().keys()].sort(), [GAMES, "data/overwatch/heroes/ana.json"].sort());
    assert.deepEqual(kvWrites, [MOBILE_INIT_VERSION_KEY]);
  });

  void it("is a conflict to reload when games.json changed since it was loaded, and commits nothing", async () => {
    const before = head;
    const res = await save({ sha: gitSha(Buffer.from("an older games.json")) });
    assert.equal(res.status, 409);
    assert.equal(res.body.conflict, true);
    assert.match(String(res.body.error), /games\.json was modified since it was loaded/);
    assert.equal(head, before);
  });

  void it("commits on the new head when the branch moved once, and is a conflict when it keeps moving", async () => {
    moves = 1;
    const once = await save({});
    assert.equal(once.status, 200);
    assert.equal(textAt("data/_meta/touched.json"), "{}");
    moves = 2;
    const res = await save({ content: { games: [game("overwatch", "Overwatch 3"), GAMES_FILE.games[1]] } });
    assert.equal(res.status, 409);
    assert.match(String(res.body.error), /kept changing/);
  });

  void it("refuses to drop or rename a game whose data folder exists, and leaves its picked icon uncommitted", async () => {
    const icon = await uploadIcon();
    const before = head;
    const named = { icon: ICON_URL };
    const contents = [{ games: [GAMES_FILE.games[1], game("valorant", "Valorant", named)] }, { games: [{ ...GAMES_FILE.games[0], slug: "ow", ...named }, GAMES_FILE.games[1]] }];
    const answers = await Promise.all(contents.map(async (content) => save({ content, icon })));
    for (const res of answers) {
      assert.equal(res.status, 400);
      assert.match(String(res.body.error), /data\/overwatch\//);
    }
    assert.equal(head, before);
    assert.equal(filesAtHead().get(ICON), undefined);
  });

  void it("runs games.json's own checks, as the per-file write did", async () => {
    const res = await save({ content: { games: [game("overwatch", "Overwatch", { primary: "blue" }), GAMES_FILE.games[1]] } });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /^This file can't be saved: .*primary/);
  });

  void it("commits only an icon the server uploaded for that very path", async () => {
    const icon = await uploadIcon();
    const forged = await save({ content: edited(ICON_URL), icon: { ...icon, token: await pictureToken("another secret", ICON, icon.sha) } });
    assert.equal(forged.status, 400);
    const webp = { games: [game("overwatch", "Overwatch", { icon: "/api/assets/games/overwatch-icon.webp" }), GAMES_FILE.games[1]] };
    const moved = await save({ content: webp, icon: { ...icon, path: "public/assets/games/overwatch-icon.webp" } });
    assert.equal(moved.status, 400);
  });

  void it("is a 400 that says what's wrong for a body that isn't a save, and a 401 signed out", async () => {
    const cases: [string, Body][] = [
      ["no sha", { sha: undefined }],
      ["no games list", { content: { nope: true } }],
      ["a message that isn't text", { message: 42 }],
      ["an icon no game in the file names", { icon: { path: ICON, sha: "a".repeat(40), token: "x" } }],
    ];
    const answers = await Promise.all(cases.map(async ([, body]) => save(body)));
    answers.forEach((res, index) => {
      assert.equal(res.status, 400, cases[index][0]);
      assert.equal(typeof res.body.error, "string", cases[index][0]);
    });
    const unsigned = await call("data/save-games", {}, { isSignedIn: false });
    assert.equal(unsigned.status, 401);
  });
});

void describe("the per-file write (POST /api/data/file)", () => {
  void it("takes no picture: they go with their record's save or the games save, never a commit of their own", async () => {
    const answers = await Promise.all([ICON, "public/assets/overwatch/heroes/ana/portrait.png"].map(async (path) => call("data/file", { path, content: png(), isBase64: true })));
    for (const res of answers) {
      assert.equal(res.status, 400);
      assert.match(String(res.body.error), /save-record|save-games/);
    }
    assert.deepEqual(calls, []);
  });
});

void describe("the request shapes", () => {
  void it("take a game's own icon in public/assets/games/, and a save whose icon a game in the file names", () => {
    assert.deepEqual(gameIconRequest({ slug: "overwatch", path: ICON, base64: "x" }), { slug: "overwatch", path: ICON, base64: "x" });
    assert.equal(typeof gameIconRequest({ slug: "overwatch", path: "public/assets/games/marvel-rivals-icon.png", base64: "x" }), "string");
    const icon = { path: ICON, sha: "a".repeat(40), token: "t" };
    const content = edited(ICON_URL);
    const request = { sha: "b".repeat(40), content, message: "Edit game: Overwatch 2", icon };
    assert.deepEqual(gamesSaveRequest(request), request);
    assert.equal(typeof gamesSaveRequest({ ...request, content: edited() }), "string");
  });
});
