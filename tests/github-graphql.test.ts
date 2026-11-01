import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { Octokit } from "@octokit/rest";

import { graphqlStatus } from "../app/lib/github-graphql";
import { buildDataPayload, buildInitPayload, githubReader, readJsonFolder } from "../app/lib/mobile-payload";
import { createSessionToken } from "../app/lib/session";

// The handler is type-checked with Workers' types (functions/tsconfig.json);
// a computed specifier keeps it out of the app's DOM-typed program.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

// A GitHub of in-memory files, answering the REST contents and trees APIs as
// Octokit calls them, and GraphQL by operation name and variables. Nothing
// leaves this process; any other request fails the test.
type Blob = { oid: string; byteSize: number; isBinary: boolean | null; isTruncated: boolean; text: string | null };
interface FakeOptions {
  /** How GraphQL answers: as GitHub does, or one of the ways it can fail. */
  graphql?: "ok" | 401 | 403 | "errors" | "partial-errors" | "malformed" | "network";
  /** Changes to a blob as GraphQL describes it (truncated, binary...). */
  blob?: (path: string, blob: Blob) => Blob;
  /** Files whose REST read fails (502). */
  restFails?: string[];
  /** Symlinks, by path: listed by REST as type "symlink", by GraphQL as a blob with mode 40960. */
  symlinks?: Record<string, string>;
}
const FAKE_TOKEN_IN_MESSAGE = "ghp_FAKE0123456789abcdefABCDEF0123456789";
const TOKEN = "test-token-not-real";

function fakeGitHub(files: Record<string, string>, options: FakeOptions = {}) {
  const calls: string[] = [];
  const variables: Record<string, unknown>[] = [];
  const all = { ...files, ...(options.symlinks ?? {}) };
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");
  const blob = (path: string): Blob => {
    const text = all[path];
    const plain: Blob = { oid: sha(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text };
    return options.blob ? options.blob(path, plain) : plain;
  };
  const children = (dir: string) => {
    const names = new Map<string, "blob" | "tree">();
    for (const path of Object.keys(all)) {
      if (!path.startsWith(`${dir}/`)) continue;
      const rest = path.slice(dir.length + 1);
      names.set(rest.split("/")[0], rest.includes("/") ? "tree" : "blob");
    }
    return [...names].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  };
  const item = (path: string) => {
    if (path in all) return blob(path);
    const entries = children(path);
    if (entries.length === 0) return null;
    return {
      entries: entries.map(([name, type]) => {
        const child = `${path}/${name}`;
        const link = options.symlinks && child in options.symlinks;
        return { name, type, mode: type === "tree" ? 16384 : link ? 40960 : 33188, object: type === "tree" ? {} : blob(child) };
      }),
    };
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.github.com") throw new Error(`unexpected request to ${url.href}`);
    if (url.pathname === "/graphql") {
      const body = JSON.parse(String(init?.body));
      calls.push(`graphql ${body.operationName}`);
      variables.push(body.variables);
      assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
      const mode = options.graphql ?? "ok";
      if (mode === "network") throw new TypeError("fetch failed");
      if (typeof mode === "number") return Response.json({ message: `Bad credentials ${FAKE_TOKEN_IN_MESSAGE}` }, { status: mode });
      if (mode === "malformed") return new Response("<html>oops</html>", { status: 200 });
      const error = { type: "FORBIDDEN", path: ["repository"], message: `Resource not accessible by personal access token ${FAKE_TOKEN_IN_MESSAGE}` };
      if (mode === "errors") return Response.json({ data: { repository: null }, errors: [error] });
      if (body.operationName === "AthenaStatus") return Response.json({ data: { repository: { id: "R_kgDOtest" } } });
      const repository: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(body.variables)) {
        if (!/^p\d+$/.test(name)) continue;
        const [ref, ...path] = String(value).split(":");
        assert.equal(ref, "main");
        repository[name] = item(path.join(":"));
      }
      if (mode === "partial-errors") return Response.json({ data: { repository }, errors: [error] });
      return Response.json({ data: { repository } });
    }
    const contents = /^\/repos\/o\/r\/contents\/(.+)$/.exec(url.pathname);
    if (contents) {
      const path = decodeURIComponent(contents[1]);
      calls.push(`rest ${path}`);
      if (options.restFails?.includes(path)) return Response.json({ message: "Bad Gateway" }, { status: 502 });
      if (path in all) return Response.json({ type: "file", encoding: "base64", content: Buffer.from(all[path]).toString("base64"), sha: sha(all[path]), path, name: path.split("/").pop() });
      const entries = children(path);
      if (entries.length === 0) return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(
        entries.map(([name, type]) => {
          const child = `${path}/${name}`;
          return { type: type === "tree" ? "dir" : options.symlinks && child in options.symlinks ? "symlink" : "file", name, path: child, sha: "s" };
        }),
      );
    }
    if (/^\/repos\/o\/r\/git\/trees\//.test(url.pathname)) {
      calls.push("rest tree");
      return Response.json({ truncated: false, tree: Object.keys(files).filter((p) => p.startsWith("public/assets/")).map((path) => ({ path, type: "blob", sha: sha(files[path]) })) });
    }
    throw new Error(`unexpected request to ${url.href}`);
  }) as typeof fetch;
  return { fetcher, calls, variables };
}

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
let warnings: string[];
beforeEach(() => {
  warnings = [];
  mock.method(console, "warn", (...args: unknown[]) => warnings.push(args.map(String).join(" ")));
  mock.method(console, "error", () => {});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { caches?: unknown }).caches = realCaches;
  mock.restoreAll();
});

/** A reader over the fake, with GraphQL (as the Functions make it) or REST only. */
function readers(files: Record<string, string>, options: FakeOptions = {}) {
  const fake = fakeGitHub(files, options);
  globalThis.fetch = fake.fetcher;
  const octokit = new Octokit({ auth: TOKEN });
  return {
    fake,
    graphql: () => githubReader(octokit, "o", "r", "main", { token: TOKEN }),
    rest: () => githubReader(octokit, "o", "r", "main"),
  };
}

const NEWS = "data/overwatch/news";
const news = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${NEWS}/n${String(i).padStart(3, "0")}.json`, JSON.stringify({ id: `n${i}`, title: `Héros ${i} — ✓` })]));
const graphqlCalls = (calls: string[]) => calls.filter((c) => c.startsWith("graphql")).length;
const restCalls = (calls: string[]) => calls.filter((c) => c.startsWith("rest")).length;

describe("reading a folder through GitHub GraphQL", () => {
  const FOLDER = {
    [`${NEWS}/a.json`]: '{"id":"a"}',
    [`${NEWS}/b.json`]: '{"id":"b","title":"Ünïcode ✓ 漢字"}',
    [`${NEWS}/c.json`]: '﻿{"id":"c"}',
    [`${NEWS}/notes.txt`]: "not a record",
    [`${NEWS}/drafts/x.json`]: '{"id":"x"}',
  };
  const SYMLINKS = { [`${NEWS}/link.json`]: '{"id":"link"}' };

  it("reads every .json file in one request, as REST reads them, in the same order", async () => {
    const r = readers(FOLDER, { symlinks: SYMLINKS });
    const viaGraphql = await readJsonFolder(r.graphql(), NEWS);
    assert.deepEqual(r.fake.calls, ["graphql AthenaRead"]);
    assert.deepEqual(viaGraphql.files.map((f) => f.name), ["a", "b", "c"]);
    assert.deepEqual(viaGraphql, await readJsonFolder(r.rest(), NEWS));
    assert.equal(viaGraphql.partial, false);
  });

  it("reads through REST only the blobs GraphQL can't give whole: truncated, binary, of another size, or not valid UTF-8", async () => {
    const odd: Record<string, (b: Blob) => Blob> = {
      [`${NEWS}/a.json`]: (b) => ({ ...b, isTruncated: true, text: b.text!.slice(0, 3) }),
      [`${NEWS}/b.json`]: (b) => ({ ...b, isBinary: true, text: null }),
      [`${NEWS}/c.json`]: (b) => ({ ...b, byteSize: b.byteSize + 7 }),
      [`${NEWS}/d.json`]: (b) => ({ ...b, text: b.text!.replace("e", "�") }),
    };
    const files = { ...FOLDER, [`${NEWS}/d.json`]: '{"id":"d","name":"Zoé"}', [`${NEWS}/e.json`]: '{"id":"e"}' };
    const r = readers(files, { blob: (path, b) => (odd[path] ? odd[path](b) : b) });
    const result = await readJsonFolder(r.graphql(), NEWS);
    assert.deepEqual(r.fake.calls.sort(), ["graphql AthenaRead", ...Object.keys(odd).map((p) => `rest ${p}`)].sort());
    assert.deepEqual(result, await readJsonFolder(r.rest(), NEWS));
    assert.deepEqual(result.files.map((f) => f.name), ["a", "b", "c", "d", "e"]);
  });

  for (const failure of [401, 403, "errors", "partial-errors", "malformed", "network"] as const) {
    it(`falls back to REST when GraphQL fails as a whole (${failure}), says so once, and never repeats GitHub's message`, async () => {
      const r = readers(news(12), { graphql: failure });
      const reader = r.graphql();
      const first = await readJsonFolder(reader, NEWS);
      const second = await readJsonFolder(reader, NEWS);
      assert.deepEqual(first, await readJsonFolder(r.rest(), NEWS));
      assert.deepEqual(second, first);
      assert.equal(first.files.length, 12);
      // One try per invocation: the second read goes straight to REST.
      assert.equal(graphqlCalls(r.fake.calls), 1);
      assert.equal(warnings.length, 1, warnings.join("\n"));
      assert.match(warnings[0], /GitHub GraphQL unavailable \(.+\), reading through REST/);
      assert.doesNotMatch(warnings[0], /ghp_|FAKE|Resource not accessible|Bad credentials|test-token/);
    });
  }

  it("treats a missing folder as empty and complete, without asking REST", async () => {
    const r = readers(FOLDER);
    assert.deepEqual(await readJsonFolder(r.graphql(), "data/overwatch/enums"), { files: [], partial: false });
    assert.deepEqual(r.fake.calls, ["graphql AthenaRead"]);
  });

  it("leaves out a file that isn't JSON and says the folder is partial, as REST does", async () => {
    const r = readers({ ...FOLDER, [`${NEWS}/broken.json`]: "{ not json" });
    const result = await readJsonFolder(r.graphql(), NEWS);
    assert.deepEqual(result.files.map((f) => f.name), ["a", "b", "c"]);
    assert.equal(result.partial, true);
    assert.deepEqual(result, await readJsonFolder(r.rest(), NEWS));
  });

  it("reads a folder whose name has spaces and other characters exactly as REST does", async () => {
    const dir = "data/over watch/news & notes #1 (ü)";
    const r = readers({ [`${dir}/a b.json`]: '{"id":"a b"}', [`${dir}/c%20d.json`]: '{"id":"c%20d"}' });
    const result = await readJsonFolder(r.graphql(), dir);
    assert.deepEqual(r.fake.variables[0].p0, `main:${dir}`);
    assert.deepEqual(result.files.map((f) => f.name), ["a b", "c%20d"]);
    assert.deepEqual(result, await readJsonFolder(r.rest(), dir));
  });
});

describe("the mobile payloads through GraphQL", () => {
  const GAME_FILES = (game: string) => ({
    [`data/${game}/schemas/s1.json`]: JSON.stringify({ id: "s1", category: "news", fields: [] }),
    [`data/${game}/enums/e1.json`]: JSON.stringify({ id: "e1", options: [{ id: "o", icon: `/api/assets/${game}/enums/e1/o.png` }] }),
    [`data/${game}/screens/home.json`]: JSON.stringify({ blocks: [] }),
    [`data/${game}/navigation.json`]: JSON.stringify({ tabs: [{ screen: "home" }] }),
    [`public/assets/${game}/enums/e1/o.png`]: "png-bytes",
  });
  const FILES = {
    "data/_meta/games.json": JSON.stringify({ games: [{ slug: "overwatch", active: true }, { slug: "rivals", active: true }, { slug: "old", active: false }] }),
    "data/_meta/categories.json": JSON.stringify({ categories: [{ category: "news", folder: "news", label: "News", singular: "Article", icon: "newspaper" }] }),
    ...GAME_FILES("overwatch"),
    ...GAME_FILES("rivals"),
    ...news(120),
  };

  it("/mobile/init reads every active game's folders and the categories in one request, the same payload as REST", async () => {
    const r = readers(FILES);
    const viaGraphql = await buildInitPayload(r.graphql());
    assert.deepEqual(r.fake.calls.sort(), ["graphql AthenaRead", "rest data/_meta/games.json", "rest tree"]);
    assert.deepEqual(viaGraphql, await buildInitPayload(r.rest()));
    assert.equal(viaGraphql.partial, false);
    assert.match(JSON.stringify(viaGraphql.payload), /o\.png\?v=[0-9a-f]{12}/);
  });

  it("/mobile/data reads 120 records in one request, the same payload as REST", async () => {
    const r = readers(FILES);
    const viaGraphql = await buildDataPayload(r.graphql(), NEWS);
    assert.deepEqual(r.fake.calls.sort(), ["graphql AthenaRead", "rest tree"]);
    assert.equal(viaGraphql.payload.length, 120);
    assert.deepEqual(viaGraphql, await buildDataPayload(r.rest(), NEWS));
  });
});

describe("the API through GraphQL", () => {
  const SECRET = "test-session-secret";
  const call = async (path: string) => {
    (globalThis as { caches?: unknown }).caches = { default: { async match() {}, async put() {}, async delete() { return true; } } };
    const response = await api({
      request: new Request(`https://athena.example/api/${path}`, { headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } }),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: TOKEN, GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    return { status: response.status, incomplete: response.headers.get("X-Incomplete"), body: (await response.json()) as unknown };
  };

  it("lists a folder with its records in one request, and counts exactly what the REST fallback couldn't read", async () => {
    const ok = readers(news(120));
    const listed = await call("data/directory?game=overwatch&subpath=news&includeContent=true");
    assert.equal((listed.body as unknown[]).length, 120);
    assert.equal(listed.incomplete, null);
    assert.deepEqual(ok.fake.calls, ["graphql AthenaRead"]);

    const keys = await call("data/directory?game=overwatch&subpath=news&includeContent=true&keysOnly=id");
    assert.deepEqual((keys.body as unknown[])[0], { id: "n0" });

    const fallback = readers(news(120), { graphql: 403, restFails: [`${NEWS}/n007.json`] });
    const partial = await call("data/directory?game=overwatch&subpath=news&includeContent=true");
    assert.equal((partial.body as unknown[]).length, 119);
    assert.equal(partial.incomplete, "1");
    assert.equal(graphqlCalls(fallback.fake.calls), 1);
    assert.equal(restCalls(fallback.fake.calls), 121);
  });

  it("says whether GraphQL works with the server's token, only to a signed-in admin", async () => {
    readers({});
    assert.deepEqual((await call("github/status")).body, { graphql: true });
    for (const failure of [401, 403, "errors", "malformed", "network"] as const) {
      readers({}, { graphql: failure });
      assert.deepEqual((await call("github/status")).body, { graphql: false }, String(failure));
    }
    const signedOut = await api({
      request: new Request("https://athena.example/api/github/status"),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: TOKEN, GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    assert.equal(signedOut.status, 401);
  });

  it("checks GraphQL with one tiny query", async () => {
    const r = readers({});
    assert.equal(await graphqlStatus({ token: TOKEN, owner: "o", repo: "r" }), true);
    assert.deepEqual(r.fake.calls, ["graphql AthenaStatus"]);
  });
});
